import { NextRequest, NextResponse } from "next/server"
import { requireOrganizerAccessToEvent } from "@/lib/organizer-auth"
import { fetchOrganizerAttendanceSummary } from "@/lib/organizer-metrics"
import { createServiceRoleClient } from "@/lib/platform-admin"

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireOrganizerAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()
    const summary = await fetchOrganizerAttendanceSummary(supabase, eventId!)
    if (!summary) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }
    return NextResponse.json(summary)
  } catch (e) {
    console.error("organizer/attendance-summary:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
