import { NextRequest, NextResponse } from "next/server"
import {
  createServiceRoleClient,
  requirePlatformAdminForRoute,
} from "@/lib/platform-admin"

type PersonRow = {
  user_id: string
  display: string
  email: string | null
}

function displayName(u: {
  first_name: string | null
  last_name: string | null
  email: string | null
  user_id: string
}): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim()
  return n || u.email || u.user_id.slice(0, 8)
}

/**
 * GET ?eventId=
 * Returns current sponsors (attendance.is_sponsor = true) + eligible non-sponsor attendees.
 */
export async function GET(request: NextRequest) {
  const gate = await requirePlatformAdminForRoute()
  if (!gate.ok) return gate.response

  const eventId = request.nextUrl.searchParams.get("eventId")
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()

    const { data: eventRow } = await supabase
      .from("events")
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle()
    if (!eventRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }

    const { data: attRows, error: attErr } = await supabase
      .from("attendance")
      .select("user_id, is_sponsor")
      .eq("event_id", eventId)

    if (attErr) {
      console.error("attendance read:", attErr)
      return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 })
    }

    const sponsorIds = new Set(
      (attRows ?? [])
        .filter((a) => a.is_sponsor === true)
        .map((a) => a.user_id),
    )
    const attendeeIds = [...new Set((attRows ?? []).map((a) => a.user_id))]
    const allNeeded = [...new Set([...sponsorIds, ...attendeeIds])]

    if (allNeeded.length === 0) {
      return NextResponse.json({
        sponsors: [] as PersonRow[],
        eligible_attendees: [] as PersonRow[],
      })
    }

    const { data: users, error: userErr } = await supabase
      .from("users")
      .select("user_id, first_name, last_name, email")
      .in("user_id", allNeeded)

    if (userErr) {
      console.error("users read:", userErr)
      return NextResponse.json({ error: "Failed to load users" }, { status: 500 })
    }

    const userMap = new Map((users ?? []).map((u) => [u.user_id, u]))

    const sponsors: PersonRow[] = [...sponsorIds]
      .map((id) => {
        const u = userMap.get(id)
        if (!u) return { user_id: id, display: id.slice(0, 8), email: null }
        return { user_id: id, display: displayName(u), email: u.email }
      })
      .sort((a, b) => a.display.localeCompare(b.display))

    const eligible_attendees: PersonRow[] = attendeeIds
      .filter((id) => !sponsorIds.has(id))
      .map((id) => {
        const u = userMap.get(id)
        if (!u)
          return { user_id: id, display: id.slice(0, 8), email: null as string | null }
        return { user_id: id, display: displayName(u), email: u.email }
      })
      .sort((a, b) => a.display.localeCompare(b.display))

    return NextResponse.json({ sponsors, eligible_attendees })
  } catch (e) {
    console.error("platform-admin/event-sponsors GET:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST body: { eventId, userId } — sets is_sponsor = true on attendance row
 */
export async function POST(request: NextRequest) {
  const gate = await requirePlatformAdminForRoute()
  if (!gate.ok) return gate.response

  try {
    const body = await request.json()
    const eventId = body?.eventId as string | undefined
    const userId = body?.userId as string | undefined
    if (!eventId || !userId) {
      return NextResponse.json(
        { error: "eventId and userId are required" },
        { status: 400 },
      )
    }

    const supabase = createServiceRoleClient()

    const { data: row } = await supabase
      .from("attendance")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!row) {
      return NextResponse.json(
        { error: "No attendance row for this user and event" },
        { status: 404 },
      )
    }

    const { error } = await supabase
      .from("attendance")
      .update({ is_sponsor: true })
      .eq("event_id", eventId)
      .eq("user_id", userId)

    if (error) {
      console.error("attendance is_sponsor update:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("platform-admin/event-sponsors POST:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * DELETE ?eventId=&userId= — sets is_sponsor = false
 */
export async function DELETE(request: NextRequest) {
  const gate = await requirePlatformAdminForRoute()
  if (!gate.ok) return gate.response

  const eventId = request.nextUrl.searchParams.get("eventId")
  const userId = request.nextUrl.searchParams.get("userId")
  if (!eventId || !userId) {
    return NextResponse.json(
      { error: "eventId and userId are required" },
      { status: 400 },
    )
  }

  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from("attendance")
      .update({ is_sponsor: false })
      .eq("event_id", eventId)
      .eq("user_id", userId)

    if (error) {
      console.error("attendance is_sponsor clear:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("platform-admin/event-sponsors DELETE:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
