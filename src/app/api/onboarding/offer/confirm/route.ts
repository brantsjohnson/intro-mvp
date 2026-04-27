import { NextRequest, NextResponse } from "next/server"
import { offerConfirm, loadOnboardingContext } from "@/lib/onboarding/engine"
import { getServiceSupabase } from "@/lib/onboarding/state"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { eventId, userId } = body || {}

    if (!eventId || !userId) {
      return NextResponse.json({ error: "eventId_and_userId_required" }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json({ error: "missing_supabase_config" }, { status: 500 })
    }

    const { ctx, error } = await loadOnboardingContext(supabase, eventId, userId)
    if (!ctx) {
      return NextResponse.json({ error: error || "context_unavailable" }, { status: 404 })
    }

    const result = await offerConfirm(supabase, ctx)

    // Kick off derive-attendance in the background so embeddings/tags use the new summary.
    // Fire-and-forget; client already proceeds to /home.
    const origin = request.nextUrl.origin
    fetch(`${origin}/api/derive-attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, userId }),
    }).catch(() => {})

    return NextResponse.json({
      offerSummary: result.offerFinal,
      wroteUserBaseline: result.wroteUserBaseline,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal_error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
