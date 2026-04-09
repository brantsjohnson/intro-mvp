import { NextRequest, NextResponse } from "next/server"
import { fetchUserDisplayMap } from "@/lib/organizer-metrics"
import { createServiceRoleClient } from "@/lib/platform-admin"
import { syncReplyInteractionEvents } from "@/lib/sponsor-outreach-db"
import { requireOrganizerAccessToEvent } from "@/lib/organizer-auth"

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireOrganizerAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()

    const { data: sponsorRows, error: sErr } = await supabase
      .from("attendance")
      .select("user_id")
      .eq("event_id", eventId!)
      .eq("is_sponsor", true)

    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 })
    }

    const sponsorIds = [...new Set((sponsorRows ?? []).map((r) => r.user_id))]
    if (sponsorIds.length === 0) {
      return NextResponse.json({ sponsors: [] })
    }

    const { data: profiles } = await supabase
      .from("sponsor_profiles")
      .select("user_id, company_description, event_goals, product_offering")
      .eq("event_id", eventId!)
      .in("user_id", sponsorIds)

    const { data: userRows } = await supabase
      .from("users")
      .select("user_id, company_name")
      .in("user_id", sponsorIds)

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]))
    const companyMap = new Map((userRows ?? []).map((u) => [u.user_id, u.company_name]))
    const labels = await fetchUserDisplayMap(supabase, sponsorIds)

    const last24h = Date.now() - 86400000
    const sponsors = []

    for (const sid of sponsorIds) {
      await syncReplyInteractionEvents(supabase, eventId!, sid)

      const { data: evs } = await supabase
        .from("sponsor_interaction_events")
        .select("event_type, occurred_at")
        .eq("event_id", eventId!)
        .eq("sponsor_user_id", sid)

      const list = evs ?? []
      const messages_sent = list.filter((e) => e.event_type === "message_sent").length
      const replied = list.filter((e) => e.event_type === "reply_received").length
      const linkedin = list.filter((e) => e.event_type === "linkedin_logged").length
      const met = list.filter((e) => e.event_type === "met_marked").length

      const active_recently = list.some(
        (e) => new Date(e.occurred_at ?? 0).getTime() > last24h,
      )

      const prof = profileMap.get(sid)
      sponsors.push({
        user_id: sid,
        display_name: labels[sid] ?? sid.slice(0, 8),
        company_name: companyMap.get(sid) ?? null,
        company_summary: prof?.company_description ?? null,
        product_offering: prof?.product_offering ?? null,
        event_goals: prof?.event_goals ?? null,
        messages_sent,
        replied,
        linkedin,
        met,
        active_recently,
      })
    }

    sponsors.sort((a, b) => a.display_name.localeCompare(b.display_name))

    return NextResponse.json({ sponsors })
  } catch (e) {
    console.error("organizer/sponsor-activity:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
