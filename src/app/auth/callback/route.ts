import { createServerComponentClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const eventCode = requestUrl.searchParams.get('eventCode') // Legacy support
  const encryptedCode = code // New encrypted code parameter
  const error = requestUrl.searchParams.get('error')
  const origin = requestUrl.origin

  console.log('Auth callback received:', { code: !!code, eventCode, encryptedCode: !!encryptedCode, error })

  if (error) {
    console.error('OAuth error in callback:', error)
    return NextResponse.redirect(`${origin}/auth?error=${error}`)
  }

  if (code) {
    const supabase = await createServerComponentClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('OAuth callback error:', exchangeError)
      return NextResponse.redirect(`${origin}/auth?error=oauth_error`)
    }

    // Upsert latest profile metadata for Google/LinkedIn sign-ins
    const authUser = data.user
    if (authUser) {
      const metadata: Record<string, any> = authUser.user_metadata ?? {}
      const firstName =
        metadata.first_name ??
        metadata.given_name ??
        (metadata.full_name ? metadata.full_name.split(' ')[0] : undefined)
      const lastName =
        metadata.last_name ??
        metadata.family_name ??
        (metadata.full_name
          ? metadata.full_name.split(' ').slice(1).join(' ') || undefined
          : undefined)
      const photoUrl = metadata.avatar_url ?? metadata.picture ?? null
      const linkedinProfile =
        metadata.profile ??
        metadata.url ??
        metadata.public_profile_url ??
        null

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
          provider: 'linkedin'
        }
      }

      try {
        if (Object.keys(upsertPayload).length > 1) {
          const { error: upsertError } = await supabase
            .from('users')
            .upsert(upsertPayload, { onConflict: 'user_id' })

          if (upsertError) {
            console.error('Failed to upsert user metadata in callback:', upsertError)
          }
        }
      } catch (metadataError) {
        console.error('Exception upserting user metadata:', metadataError)
      }
    }

    console.log('OAuth successful, user:', authUser?.id, 'email:', authUser?.email)
    console.log('Session established:', !!data.session)
  }

  // URL to redirect to after sign in process completes
  if (encryptedCode) {
    // Encrypted code - redirect to onboarding (profile check happens there)
    console.log('Redirecting to onboarding with encrypted code')
    return NextResponse.redirect(`${origin}/onboarding?code=${encryptedCode}`)
  } else if (eventCode) {
    // Legacy event code - redirect to event join page
    console.log('Redirecting to event join with code:', eventCode)
    return NextResponse.redirect(`${origin}/event/join?code=${eventCode}`)
  } else {
    console.log('Redirecting to main page for routing logic')
    return NextResponse.redirect(`${origin}/`)
  }
}
