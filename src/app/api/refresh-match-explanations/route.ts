import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/** Regenerate AI card copy for existing top matches (same people, new explanations). */
export async function POST(request: NextRequest) {
  try {
    const { eventId, userId } = await request.json()

    if (!eventId || !userId) {
      return NextResponse.json({ error: "eventId and userId are required" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 })
    }

    const matchmakerResponse = await fetch(`${supabaseUrl}/functions/v1/matchmaker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: eventId,
        user_id: userId,
        refresh_explanations_only: true,
      }),
    })

    const result = await matchmakerResponse.json().catch(() => null)

    if (!matchmakerResponse.ok) {
      return NextResponse.json(
        { error: "Failed to refresh match explanations", details: result?.error ?? result },
        { status: matchmakerResponse.status },
      )
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[refresh-match-explanations]", error)
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 },
    )
  }
}
