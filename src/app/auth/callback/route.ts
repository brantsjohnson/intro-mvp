import { createServerComponentClient } from "@/lib/supabase-server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const startTime = performance.now()
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const eventCode = requestUrl.searchParams.get("eventCode") // Legacy support
  const encryptedCode = code // New encrypted code parameter
  const error = requestUrl.searchParams.get("error")
  const origin = requestUrl.origin

  console.log("[PERF] Auth callback received:", {
    code: !!code,
    eventCode,
    encryptedCode: !!encryptedCode,
    error,
    timestamp: Date.now(),
  })

  if (error) {
    console.error("OAuth error in callback:", error)
    return NextResponse.redirect(`${origin}/auth?error=${error}`)
  }

  if (code) {
    const supabase = await createServerComponentClient()
    const exchangeStart = performance.now()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    const exchangeTime = performance.now() - exchangeStart
    console.log(`[PERF] Auth exchange took ${exchangeTime.toFixed(2)}ms`)

    if (exchangeError) {
      console.error("OAuth callback error:", exchangeError)
      return NextResponse.redirect(`${origin}/auth?error=oauth_error`)
    }

    // Upsert latest profile metadata for Google/LinkedIn sign-ins (non-blocking)
    const authUser = data.user
    if (authUser) {
      const metadata: Record<string, any> = authUser.user_metadata ?? {}
      const firstName =
        metadata.first_name ??
        metadata.given_name ??
        (metadata.full_name ? metadata.full_name.split(" ")[0] : undefined)
      const lastName =
        metadata.last_name ??
        metadata.family_name ??
        (metadata.full_name
          ? metadata.full_name.split(" ").slice(1).join(" ") || undefined
          : undefined)
      const photoUrl = metadata.avatar_url ?? metadata.picture ?? null
      const linkedinProfile =
        metadata.profile ?? metadata.url ?? metadata.public_profile_url ?? null

      const upsertPayload: Record<string, any> = {
        user_id: authUser.id,
      }

      if (authUser.email) {
        upsertPayload.email = authUser.email
      }
      if (firstName) {
        upsertPayload.first_name = firstName
      }
      if (lastName) {
        upsertPayload.last_name = lastName
      }
      if (photoUrl) {
        upsertPayload.photo_url = photoUrl
      }
      if (linkedinProfile) {
        upsertPayload.linkedin_raw_json = {
          profile_url: linkedinProfile,
          provider: "linkedin",
        }
      }

      // Fire-and-forget: don't wait for upsert to complete before redirecting
      if (Object.keys(upsertPayload).length > 1) {
        supabase
          .from("users")
          .upsert(upsertPayload, { onConflict: "user_id" })
          .then(({ error: upsertError }) => {
            if (upsertError) {
              console.error("Failed to upsert user metadata in callback:", upsertError)
            } else {
              console.log("[PERF] User metadata upsert completed (async)")
            }
          })
          .catch((metadataError) => {
            console.error("Exception upserting user metadata:", metadataError)
          })
      }
    }

    const totalTime = performance.now() - startTime
    console.log(
      `[PERF] OAuth successful, user: ${authUser?.id}, total callback time: ${totalTime.toFixed(
        2,
      )}ms`,
    )
    console.log("Session established:", !!data.session)
  }

  // URL to redirect to after sign in process completes
  if (encryptedCode) {
    // Encrypted code - redirect to onboarding (profile check happens there)
    console.log("Redirecting to onboarding with encrypted code")
    return NextResponse.redirect(`${origin}/onboarding?code=${encryptedCode}`)
  } else if (eventCode) {
    // Legacy event code - redirect to event join page
    console.log("Redirecting to event join with code:", eventCode)
    return NextResponse.redirect(`${origin}/event/join?code=${eventCode}`)
  } else {
    console.log("Redirecting to main page for routing logic")
    return NextResponse.redirect(`${origin}/`)
  }
}
