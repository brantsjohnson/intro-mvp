import { NextResponse } from "next/server"
import {
  fetchSponsorEventSummariesForUser,
  requireLoggedInForSponsorRoute,
} from "@/lib/sponsor-auth"

/**
 * GET — events where the current user has attendance.is_sponsor = true.
 */
export async function GET() {
  const gate = await requireLoggedInForSponsorRoute()
  if (!gate.ok) return gate.response

  try {
    const events = await fetchSponsorEventSummariesForUser(gate.userId)
    return NextResponse.json({ events })
  } catch (e) {
    console.error("sponsor/events:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
