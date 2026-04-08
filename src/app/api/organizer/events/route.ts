import { NextResponse } from "next/server"
import {
  fetchOrganizerEventSummariesForUser,
  requireLoggedInForOrganizerRoute,
} from "@/lib/organizer-auth"

/**
 * GET — events the current user can view as an organizer (read-only).
 */
export async function GET() {
  const gate = await requireLoggedInForOrganizerRoute()
  if (!gate.ok) return gate.response

  try {
    const events = await fetchOrganizerEventSummariesForUser(gate.userId)
    return NextResponse.json({ events })
  } catch (e) {
    console.error("organizer/events:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
