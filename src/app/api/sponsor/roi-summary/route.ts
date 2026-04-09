import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/platform-admin"
import { fetchUserDisplayMap } from "@/lib/organizer-metrics"
import { syncReplyInteractionEvents } from "@/lib/sponsor-outreach-db"
import {
  emptySponsorRoiResponse,
  isSponsorTablesMissingError,
} from "@/lib/sponsor-schema-guard"
import { requireSponsorAccessToEvent } from "@/lib/sponsor-auth"

const MESSAGED_STATUSES = [
  "messaged",
  "replied",
  "connected",
  "linkedin",
  "met",
  "reached_out",
  "contacted_later",
  "closed_deal",
]

function humanizeTag(s: string): string {
  return s
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function groupedFunnelCounts(
  leadList: Array<{ status: string | null }>,
): { id: string; label: string; count: number }[] {
  let recommended = 0
  let reachedOut = 0
  let connected = 0
  let followingUp = 0
  let closed = 0
  for (const l of leadList) {
    const s = l.status ?? "recommended"
    if (s === "recommended") {
      recommended++
    } else if (s === "messaged" || s === "linkedin" || s === "reached_out") {
      reachedOut++
    } else if (s === "replied" || s === "connected") {
      connected++
    } else if (s === "met" || s === "contacted_later") {
      followingUp++
    } else if (s === "closed_deal") {
      closed++
    } else {
      recommended++
    }
  }
  return [
    { id: "recommended", label: "Recommended", count: recommended },
    { id: "reached_out", label: "Reached out", count: reachedOut },
    { id: "connected", label: "Connected", count: connected },
    { id: "following_up", label: "Following up", count: followingUp },
    { id: "closed_deal", label: "Closed", count: closed },
  ]
}

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()
    await syncReplyInteractionEvents(supabase, eventId!, gate.userId)

    const { data: events, error: evErr } = await supabase
      .from("sponsor_interaction_events")
      .select("event_type, attendee_user_id, occurred_at")
      .eq("event_id", eventId!)
      .eq("sponsor_user_id", gate.userId)

    if (evErr) {
      if (isSponsorTablesMissingError(evErr)) {
        return NextResponse.json(emptySponsorRoiResponse(true))
      }
      return NextResponse.json({ error: evErr.message }, { status: 500 })
    }

    const list = events ?? []
    const messages_sent = list.filter((e) => e.event_type === "message_sent").length
    const replies_received = list.filter((e) => e.event_type === "reply_received").length
    const linkedin_logged = list.filter((e) => e.event_type === "linkedin_logged").length
    const met_marked = list.filter((e) => e.event_type === "met_marked").length

    const engaged = new Set<string>()
    for (const e of list) {
      engaged.add(e.attendee_user_id)
    }

    const byDay = new Map<string, number>()
    for (const e of list) {
      const d = (e.occurred_at ?? "").slice(0, 10)
      if (!d) continue
      byDay.set(d, (byDay.get(d) ?? 0) + 1)
    }
    const outreach_by_day = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))

    const { data: leads, error: leadsErr } = await supabase
      .from("sponsor_leads")
      .select("*")
      .eq("event_id", eventId!)
      .eq("sponsor_user_id", gate.userId)

    if (leadsErr) {
      if (isSponsorTablesMissingError(leadsErr)) {
        return NextResponse.json(emptySponsorRoiResponse(true))
      }
      return NextResponse.json({ error: leadsErr.message }, { status: 500 })
    }

    const leadList = leads ?? []
    const lead_statuses: Record<string, number> = {}
    for (const l of leadList) {
      const s = l.status ?? "recommended"
      lead_statuses[s] = (lead_statuses[s] ?? 0) + 1
    }

    const funnel = groupedFunnelCounts(leadList)

    let qualified_leads = 0
    let strong_fits = 0
    const reasonTagCount = new Map<string, number>()
    for (const l of leadList) {
      const score = Number(l.recommendation_score)
      const sc = Number.isFinite(score) ? score : 0
      if (sc >= 30) qualified_leads++
      if (sc >= 60) strong_fits++
      for (const t of l.recommendation_reason_tags ?? []) {
        const tag = (t || "").toLowerCase().trim()
        if (!tag) continue
        reasonTagCount.set(tag, (reasonTagCount.get(tag) ?? 0) + 1)
      }
    }

    const top_reason_tags = [...reasonTagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => humanizeTag(tag))

    const leadAttendeeIds = [...new Set(leadList.map((l) => l.attendee_user_id))]
    const industryCount = new Map<string, number>()
    if (leadAttendeeIds.length > 0) {
      const { data: att } = await supabase
        .from("attendance")
        .select("user_id, event_industry_tags")
        .eq("event_id", eventId!)
        .in("user_id", leadAttendeeIds)

      const { data: users } = await supabase
        .from("users")
        .select("user_id, industry_tags")
        .in("user_id", leadAttendeeIds)

      const uMap = new Map((users ?? []).map((u) => [u.user_id, u]))

      for (const row of att ?? []) {
        const u = uMap.get(row.user_id)
        const per = new Set<string>()
        for (const t of row.event_industry_tags ?? []) {
          const x = (t || "").toLowerCase().trim()
          if (x) per.add(x)
        }
        for (const t of u?.industry_tags ?? []) {
          const x = (t || "").toLowerCase().trim()
          if (x) per.add(x)
        }
        for (const tag of per) {
          industryCount.set(tag, (industryCount.get(tag) ?? 0) + 1)
        }
      }
    }

    const top_industries = [...industryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => humanizeTag(tag))

    const potential_deals_low =
      strong_fits > 0 ? Math.max(1, Math.floor(strong_fits * 0.05)) : 0
    const potential_deals_high =
      strong_fits > 0 ? Math.max(1, Math.floor(strong_fits * 0.15)) : 0

    const outreachLeads = leadList.filter((l) =>
      MESSAGED_STATUSES.includes(l.status ?? ""),
    )
    const attendeeIds = [
      ...new Set([
        ...engaged,
        ...outreachLeads.map((l) => l.attendee_user_id),
      ]),
    ]

    const tagCount = new Map<string, number>()
    if (attendeeIds.length > 0) {
      const { data: att } = await supabase
        .from("attendance")
        .select("user_id, event_need_tags, event_industry_tags")
        .eq("event_id", eventId!)
        .in("user_id", attendeeIds)

      const { data: users } = await supabase
        .from("users")
        .select("user_id, industry_tags")
        .in("user_id", attendeeIds)

      const uMap = new Map((users ?? []).map((u) => [u.user_id, u]))

      for (const row of att ?? []) {
        const u = uMap.get(row.user_id)
        const per = new Set<string>()
        for (const t of row.event_need_tags ?? []) {
          const x = (t || "").toLowerCase().trim()
          if (x) per.add(x)
        }
        for (const t of row.event_industry_tags ?? []) {
          const x = (t || "").toLowerCase().trim()
          if (x) per.add(x)
        }
        for (const t of u?.industry_tags ?? []) {
          const x = (t || "").toLowerCase().trim()
          if (x) per.add(x)
        }
        for (const tag of per) {
          tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
        }
      }
    }

    const top_topics = [...tagCount.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)

    const last24h = Date.now() - 86400000
    const active_recently = list.some(
      (e) => new Date(e.occurred_at ?? 0).getTime() > last24h,
    )

    const labelIds = outreachLeads.map((l) => l.attendee_user_id)
    const labels = await fetchUserDisplayMap(supabase, labelIds)

    const outreach_table = outreachLeads.map((l) => ({
      lead_id: l.id,
      attendee_user_id: l.attendee_user_id,
      display_name: labels[l.attendee_user_id] ?? l.attendee_user_id.slice(0, 8),
      status: l.status,
      notes: l.notes,
      updated_at: l.updated_at,
    }))

    return NextResponse.json({
      messages_sent,
      replies_received,
      linkedin_logged,
      met_marked,
      engaged_leads_total: engaged.size,
      outreach_by_day,
      funnel,
      qualified_leads,
      strong_fits,
      potential_deals_low,
      potential_deals_high,
      top_reason_tags,
      top_industries,
      lead_statuses,
      top_topics,
      active_recently,
      outreach_table,
      migrationRequired: false,
    })
  } catch (e) {
    console.error("sponsor/roi-summary:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
