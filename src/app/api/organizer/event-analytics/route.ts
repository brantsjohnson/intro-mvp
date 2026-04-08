import { NextRequest, NextResponse } from "next/server"
import { requireOrganizerAccessToEvent } from "@/lib/organizer-auth"
import { fetchOrganizerEventAnalytics } from "@/lib/organizer-metrics"
import { createServiceRoleClient } from "@/lib/platform-admin"

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireOrganizerAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()
    const analytics = await fetchOrganizerEventAnalytics(supabase, eventId!)
    if (!analytics) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }
    return NextResponse.json(analytics)
  } catch (e) {
    console.error("organizer/event-analytics:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
