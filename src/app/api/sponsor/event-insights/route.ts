import { NextRequest, NextResponse } from "next/server"
import { ORGANIZER_CONNECTION_INTENT_LABELS } from "@/lib/organizer-metrics"
import { createServiceRoleClient } from "@/lib/platform-admin"
import { requireSponsorAccessToEvent } from "@/lib/sponsor-auth"

function humanizeTag(s: string): string {
  return s
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function labelForConnectionType(key: string): string {
  return ORGANIZER_CONNECTION_INTENT_LABELS[key] ?? humanizeTag(key)
}

/**
 * GET ?eventId=
 * Audience intent from non-sponsor attendees (connection_types_selected).
 */
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()

    const { data: attRows, error } = await supabase
      .from("attendance")
      .select("user_id, connection_types_selected")
      .eq("event_id", eventId!)
      .not("is_sponsor", "eq", true)

    if (error) {
      console.error("sponsor/event-insights attendance:", error)
      return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 })
    }

    const intentCount: Record<string, number> = {}

    for (const row of attRows ?? []) {
      for (const raw of row.connection_types_selected ?? []) {
        const key = (raw || "").trim()
        if (!key) continue
        intentCount[key] = (intentCount[key] ?? 0) + 1
      }
    }

    const connection_types = Object.entries(intentCount)
      .map(([key, count]) => ({
        key,
        label: labelForConnectionType(key),
        count,
      }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      total_attendees: attRows?.length ?? 0,
      connection_types,
    })
  } catch (e) {
    console.error("sponsor/event-insights:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
