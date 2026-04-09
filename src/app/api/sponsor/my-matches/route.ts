import { NextRequest, NextResponse } from "next/server"
import {
  fetchSponsorMatchesTablePage,
  fetchUserDisplayMap,
} from "@/lib/organizer-metrics"
import { createServiceRoleClient } from "@/lib/platform-admin"
import { requireSponsorAccessToEvent } from "@/lib/sponsor-auth"

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireSponsorAccessToEvent(eventId)
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
    const result = await fetchSponsorMatchesTablePage(
      supabase,
      eventId!,
      gate.userId,
      page,
      pageSize,
    )
    if (!result) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }

    const ids = result.rows.flatMap((r) => [r.a_id, r.b_id])
    const labels = await fetchUserDisplayMap(supabase, ids)
    const rows = result.rows.map((r) => {
      const otherId = r.a_id === gate.userId ? r.b_id : r.a_id
      const otherDisplay = labels[otherId] ?? otherId
      return {
        ...r,
        matched_user_id: otherId,
        matched_display: otherDisplay,
        a_display: labels[r.a_id] ?? r.a_id,
        b_display: labels[r.b_id] ?? r.b_id,
      }
    })

    return NextResponse.json({
      page,
      pageSize,
      total: result.total,
      rows,
    })
  } catch (e) {
    console.error("sponsor/my-matches:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
