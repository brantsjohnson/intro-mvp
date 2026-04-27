import { NextRequest, NextResponse } from "next/server"
import { offerRewrite, loadOnboardingContext } from "@/lib/onboarding/engine"
import { getServiceSupabase } from "@/lib/onboarding/state"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { eventId, userId, correction } = body || {}

    if (!eventId || !userId || !correction || !String(correction).trim()) {
      return NextResponse.json({ error: "eventId_userId_correction_required" }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json({ error: "missing_supabase_config" }, { status: 500 })
    }

    const { ctx, error } = await loadOnboardingContext(supabase, eventId, userId)
    if (!ctx) {
      return NextResponse.json({ error: error || "context_unavailable" }, { status: 404 })
    }

    const draft = await offerRewrite(supabase, ctx, String(correction).trim())
    return NextResponse.json({ draftSummary: draft })
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal_error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
