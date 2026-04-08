import { NextRequest, NextResponse } from "next/server"
import {
  createServiceRoleClient,
  requirePlatformAdminForRoute,
} from "@/lib/platform-admin"
import { fetchEventHealthMetrics } from "@/lib/platform-admin-metrics"

/**
 * GET ?eventId=uuid
 * Read-only aggregates for platform admin (see docs/supabase-categories-reference.md §1–3).
 */
export async function GET(request: NextRequest) {
  const gate = await requirePlatformAdminForRoute()
  if (!gate.ok) return gate.response

  const eventId = request.nextUrl.searchParams.get("eventId")
  if (!eventId) {
    return NextResponse.json({ error: "eventId query parameter is required" }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const metrics = await fetchEventHealthMetrics(supabase, eventId)
    if (!metrics) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }
    return NextResponse.json(metrics)
  } catch (e) {
    console.error("platform-admin event-health:", e)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
