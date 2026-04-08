import { NextRequest, NextResponse } from "next/server"
import { requireOrganizerAccessToEvent } from "@/lib/organizer-auth"
import { fetchOrganizerAttendanceRosterPage } from "@/lib/organizer-metrics"
import { createServiceRoleClient } from "@/lib/platform-admin"

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireOrganizerAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  const pageParam = request.nextUrl.searchParams.get("page")
  const sizeParam = request.nextUrl.searchParams.get("pageSize")
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(sizeParam || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  )

  try {
    const supabase = createServiceRoleClient()
    const result = await fetchOrganizerAttendanceRosterPage(
      supabase,
      eventId!,
      page,
      pageSize,
    )
    if (!result) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }
    return NextResponse.json({
      page,
      pageSize,
      total: result.total,
      rows: result.rows,
    })
  } catch (e) {
    console.error("organizer/attendance-roster:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
