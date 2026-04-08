import { NextRequest, NextResponse } from "next/server"
import { requireOrganizerAccessToEvent } from "@/lib/organizer-auth"
import { createServiceRoleClient } from "@/lib/platform-admin"
import { fetchEventHealthMetrics } from "@/lib/platform-admin-metrics"

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireOrganizerAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()
    const metrics = await fetchEventHealthMetrics(supabase, eventId!)
    if (!metrics) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }
    return NextResponse.json(metrics)
  } catch (e) {
    console.error("organizer/event-health:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
