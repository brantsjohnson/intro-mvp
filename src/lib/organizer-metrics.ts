import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export type OrganizerAttendanceSummary = {
  event_id: string
  attendance_total: number
  onboarding_completed_count: number
  business_need_filled_count: number
  /** Normalized lowercase key -> count (first ~500 chars of trimmed text) */
  business_need_text_buckets: Record<string, number>
}

function bucketBusinessNeed(text: string | null): string | null {
  if (!text?.trim()) return null
  const t = text.trim()
  const key = t.length > 500 ? `${t.slice(0, 500)}…` : t
  return key.toLowerCase()
}

export async function fetchOrganizerAttendanceSummary(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<OrganizerAttendanceSummary | null> {
  const { data: evt } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle()
  if (!evt) return null

  const { data: rows } = await supabase
    .from("attendance")
    .select("onboarding_completed, business_need_text")
    .eq("event_id", eventId)

  const list = rows ?? []
  let onboarding_completed_count = 0
  let business_need_filled_count = 0
  const business_need_text_buckets: Record<string, number> = {}

  for (const r of list) {
    if (r.onboarding_completed === true) onboarding_completed_count++
    if (r.business_need_text?.trim()) {
      business_need_filled_count++
      const b = bucketBusinessNeed(r.business_need_text)
      if (b) business_need_text_buckets[b] = (business_need_text_buckets[b] ?? 0) + 1
    }
  }

  return {
    event_id: eventId,
    attendance_total: list.length,
    onboarding_completed_count,
    business_need_filled_count,
    business_need_text_buckets,
  }
}

export type OrganizerMatchesSummary = {
  event_id: string
  system_match_count: number
  unique_users_in_system_matches: number
  match_algorithm_version_counts: Record<string, number>
  /** Rows with connection_kind=system_match divided by attendance rows */
  avg_system_matches_per_attendee: number | null
}

export async function fetchOrganizerMatchesSummary(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<OrganizerMatchesSummary | null> {
  const { data: evt } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle()
  if (!evt) return null

  const { count: attendanceTotal } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)

  const { data: matches } = await supabase
    .from("connections")
    .select("a_id, b_id, match_algorithm_version")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")

  const rows = matches ?? []
  const userSet = new Set<string>()
  const versionCounts: Record<string, number> = {}
  for (const r of rows) {
    userSet.add(r.a_id)
    userSet.add(r.b_id)
    const v = r.match_algorithm_version || "unknown"
    versionCounts[v] = (versionCounts[v] ?? 0) + 1
  }

  const attend = attendanceTotal ?? 0
  const avg = attend > 0 ? rows.length / attend : null

  return {
    event_id: eventId,
    system_match_count: rows.length,
    unique_users_in_system_matches: userSet.size,
    match_algorithm_version_counts: versionCounts,
    avg_system_matches_per_attendee: avg,
  }
}

export type OrganizerMatchTableRow = {
  connection_id: string
  a_id: string
  b_id: string
  match_score: number | null
  match_algorithm_version: string | null
  created_at: string | null
}

export async function fetchOrganizerMatchesTablePage(
  supabase: SupabaseClient<Database>,
  eventId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: OrganizerMatchTableRow[]; total: number } | null> {
  const { data: evt } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle()
  if (!evt) return null

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { count } = await supabase
    .from("connections")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")

  const { data } = await supabase
    .from("connections")
    .select(
      "connection_id, a_id, b_id, match_score, match_algorithm_version, created_at",
    )
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .order("created_at", { ascending: false })
    .range(from, to)

  return {
    rows: (data ?? []) as OrganizerMatchTableRow[],
    total: count ?? 0,
  }
}

export type OrganizerAttendanceRosterRow = {
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  onboarding_completed: boolean | null
  business_need_preview: string | null
}

export async function fetchOrganizerAttendanceRosterPage(
  supabase: SupabaseClient<Database>,
  eventId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: OrganizerAttendanceRosterRow[]; total: number } | null> {
  const { data: evt } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle()
  if (!evt) return null

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { count } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)

  const { data: attRows } = await supabase
    .from("attendance")
    .select("user_id, onboarding_completed, business_need_text")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: false, nullsFirst: false })
    .range(from, to)

  const list = attRows ?? []
  const userIds = [...new Set(list.map((a) => a.user_id))]
  if (userIds.length === 0) {
    return { rows: [], total: count ?? 0 }
  }

  const { data: userRows } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, email")
    .in("user_id", userIds)

  const userMap = new Map((userRows ?? []).map((u) => [u.user_id, u]))

  const rows: OrganizerAttendanceRosterRow[] = list.map((a) => {
    const u = userMap.get(a.user_id)
    const raw = a.business_need_text?.trim() ?? null
    const preview =
      raw && raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
    return {
      user_id: a.user_id,
      first_name: u?.first_name ?? null,
      last_name: u?.last_name ?? null,
      email: u?.email ?? null,
      onboarding_completed: a.onboarding_completed,
      business_need_preview: preview,
    }
  })

  return { rows, total: count ?? 0 }
}

/** Map user_id -> display label for match rows */
export async function fetchUserDisplayMap(
  supabase: SupabaseClient<Database>,
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}
  const unique = [...new Set(userIds)]
  const { data } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, email")
    .in("user_id", unique)

  const out: Record<string, string> = {}
  for (const u of data ?? []) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim()
    out[u.user_id] = name || u.email || u.user_id.slice(0, 8)
  }
  return out
}

/** DB snake_case → organizer-facing label (matches onboarding intent options). */
export const ORGANIZER_CONNECTION_INTENT_LABELS: Record<string, string> = {
  general: "General Networking",
  biz_opps: "Business Opportunities",
  find_mentor: "Find a Mentor",
  be_mentor: "Be a Mentor",
  find_job: "Job Seeking",
  recruit: "Recruiting",
  join_startup: "Join a Startup",
  other: "Other",
}

const ROLE_INTENT_LABELS: Record<string, string> = {
  general: "General",
  job_seeker: "Job seekers",
  recruiter: "Recruiters",
  mentor: "Mentors",
}

function humanizeSnake(s: string): string {
  return s
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

/** How KPIs and charts are computed (show in UI tooltips / docs). */
export type OrganizerEventAnalyticsDefinitions = {
  total_connections: string
  pct_attendees_matched: string
  avg_connections_per_attendee: string
  funnel_steps: string
}

export type OrganizerAttendeeInsightRow = {
  user_id: string
  display_name: string
  email: string | null
  intents: string[]
  intent_labels: string[]
  industry_tags: string[]
  role_intent: string | null
  role_intent_label: string | null
  connection_degree: number
  had_system_match: boolean
  onboarding_completed: boolean
}

export type OrganizerEventAnalytics = {
  event_id: string
  event_name: string | null
  event_starts_at: string | null
  event_ends_at: string | null
  definitions: OrganizerEventAnalyticsDefinitions
  kpis: {
    total_attendees: number
    total_connections: number
    pct_attendees_matched: number | null
    avg_connections_per_attendee: number | null
  }
  funnel: {
    id: string
    label: string
    count: number
    pct_of_previous: number | null
  }[]
  intent_counts: { key: string; label: string; count: number }[]
  industry_top: { tag: string; label: string; count: number }[]
  role_intent_counts: { key: string; label: string; count: number }[]
  connection_method_counts: { key: string; label: string; count: number }[]
  match_score_histogram: {
    bin_label: string
    bin_start: number
    bin_end: number
    count: number
  }[]
  connection_depth: { bucket: string; label: string; count: number }[]
  attendee_insights: OrganizerAttendeeInsightRow[]
}

type ConnRow = {
  a_id: string
  b_id: string
  connection_kind: string
  user_add_method: string | null
  match_score: number | null
}

function isPendingConnection(row: ConnRow): boolean {
  return row.connection_kind === "user_request_pending"
}

/**
 * Single bucket per connection row for the "how connections formed" chart.
 * Priority: concrete user action (QR, directory, …) then app suggestion vs user-added.
 */
export function classifyConnectionMethod(row: ConnRow): string {
  if (isPendingConnection(row)) return "pending"
  const m = row.user_add_method
  if (m === "qr") return "qr"
  if (m === "manual_directory") return "directory"
  if (m === "manual_add") return "manual_add"
  if (m === "met") return "marked_met"
  if (m === "manual_message") return "messaging"
  if (row.connection_kind === "system_match") return "ai_match"
  if (row.connection_kind === "user_added") return "user_added"
  return "other"
}

const CONNECTION_METHOD_CHART_LABELS: Record<string, string> = {
  ai_match: "App suggestion",
  qr: "QR code",
  directory: "Directory",
  manual_add: "Added by hand",
  marked_met: "Marked as met",
  messaging: "From chat",
  user_added: "Added in app",
  other: "Other",
}

/** Full organizer analytics payload for one event (single round-trip). */
export async function fetchOrganizerEventAnalytics(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<OrganizerEventAnalytics | null> {
  const { data: eventRow, error: evErr } = await supabase
    .from("events")
    .select("event_id, event_name, event_starts_at, event_ends_at")
    .eq("event_id", eventId)
    .maybeSingle()

  if (evErr || !eventRow) return null

  const { data: attRows } = await supabase
    .from("attendance")
    .select(
      "user_id, onboarding_completed, connection_types_selected, event_role_intent, event_industry_tags",
    )
    .eq("event_id", eventId)

  const attendanceList = attRows ?? []
  const attendeeSet = new Set(attendanceList.map((a) => a.user_id))
  const attendanceTotal = attendanceList.length

  const userIds = [...attendeeSet]
  const { data: userRows } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, email, industry_tags")
    .in("user_id", userIds)

  const userMap = new Map((userRows ?? []).map((u) => [u.user_id, u]))

  const { data: connRowsRaw } = await supabase
    .from("connections")
    .select("a_id, b_id, connection_kind, user_add_method, match_score")
    .eq("event_id", eventId)

  const connRows = (connRowsRaw ?? []) as ConnRow[]

  const activeConns = connRows.filter((r) => !isPendingConnection(r))
  const totalConnections = activeConns.length

  const matchedAttendeeSet = new Set<string>()
  for (const r of connRows) {
    if (r.connection_kind !== "system_match") continue
    if (attendeeSet.has(r.a_id)) matchedAttendeeSet.add(r.a_id)
    if (attendeeSet.has(r.b_id)) matchedAttendeeSet.add(r.b_id)
  }

  const degree = new Map<string, number>()
  const bump = (uid: string) => {
    if (!attendeeSet.has(uid)) return
    degree.set(uid, (degree.get(uid) ?? 0) + 1)
  }
  for (const r of activeConns) {
    bump(r.a_id)
    bump(r.b_id)
  }

  const onboardedCount = attendanceList.filter(
    (a) => a.onboarding_completed === true,
  ).length

  const onboardedUserSet = new Set(
    attendanceList
      .filter((a) => a.onboarding_completed === true)
      .map((a) => a.user_id),
  )

  /** Funnel steps after onboarding count only the onboarded cohort. */
  let matchedAmongOnboarded = 0
  for (const uid of matchedAttendeeSet) {
    if (onboardedUserSet.has(uid)) matchedAmongOnboarded++
  }

  let madeOnePlusAmongOnboarded = 0
  for (const uid of onboardedUserSet) {
    if ((degree.get(uid) ?? 0) >= 1) madeOnePlusAmongOnboarded++
  }

  const pctAttendeesMatched =
    attendanceTotal > 0
      ? Math.round((matchedAttendeeSet.size / attendanceTotal) * 1000) / 10
      : null

  const avgConnPerAttendee =
    attendanceTotal > 0
      ? Math.round((totalConnections / attendanceTotal) * 100) / 100
      : null

  const funnelCounts = {
    attended: attendanceTotal,
    onboarded: onboardedCount,
    received_ai_match: matchedAmongOnboarded,
    made_one_plus_connection: madeOnePlusAmongOnboarded,
  }

  const funnelOrder: { id: string; label: string; count: number }[] = [
    { id: "attended", label: "Guests", count: funnelCounts.attended },
    { id: "onboarded", label: "Finished signup", count: funnelCounts.onboarded },
    {
      id: "received_ai_match",
      label: "Got suggestions",
      count: funnelCounts.received_ai_match,
    },
    {
      id: "made_one_plus_connection",
      label: "Had a connection",
      count: funnelCounts.made_one_plus_connection,
    },
  ]

  const funnel = funnelOrder.map((step, i) => {
    const prev = i > 0 ? funnelOrder[i - 1]!.count : null
    const pct_of_previous =
      prev != null && prev > 0 ? Math.round((step.count / prev) * 1000) / 10 : null
    return { ...step, pct_of_previous }
  })

  const intentCountMap: Record<string, number> = {}
  for (const a of attendanceList) {
    const sel = a.connection_types_selected
    if (!sel?.length) continue
    for (const raw of sel) {
      const key = raw
      intentCountMap[key] = (intentCountMap[key] ?? 0) + 1
    }
  }
  const intent_counts = Object.entries(intentCountMap)
    .map(([key, count]) => ({
      key,
      label: ORGANIZER_CONNECTION_INTENT_LABELS[key] ?? humanizeSnake(key),
      count,
    }))
    .sort((x, y) => y.count - x.count)

  const industryCount: Record<string, number> = {}
  for (const a of attendanceList) {
    const perPerson = new Set<string>()
    for (const t of a.event_industry_tags ?? []) {
      const tag = (t || "").toLowerCase().trim()
      if (tag) perPerson.add(tag)
    }
    const u = userMap.get(a.user_id)
    for (const t of u?.industry_tags ?? []) {
      const tag = (t || "").toLowerCase().trim()
      if (tag) perPerson.add(tag)
    }
    for (const tag of perPerson) {
      industryCount[tag] = (industryCount[tag] ?? 0) + 1
    }
  }
  const industry_top = Object.entries(industryCount)
    .map(([tag, count]) => ({
      tag,
      label: humanizeSnake(tag),
      count,
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 12)

  const roleCountMap: Record<string, number> = {}
  for (const a of attendanceList) {
    const ri = (a.event_role_intent || "general").toLowerCase().trim() || "general"
    roleCountMap[ri] = (roleCountMap[ri] ?? 0) + 1
  }
  const role_intent_counts = Object.entries(roleCountMap)
    .map(([key, count]) => ({
      key,
      label: ROLE_INTENT_LABELS[key] ?? humanizeSnake(key),
      count,
    }))
    .sort((x, y) => y.count - x.count)

  const methodCountMap: Record<string, number> = {}
  for (const r of activeConns) {
    const k = classifyConnectionMethod(r)
    if (k === "pending") continue
    methodCountMap[k] = (methodCountMap[k] ?? 0) + 1
  }
  const connection_method_counts = Object.entries(methodCountMap)
    .map(([key, count]) => ({
      key,
      label: CONNECTION_METHOD_CHART_LABELS[key] ?? humanizeSnake(key),
      count,
    }))
    .sort((x, y) => y.count - x.count)

  const binCount = new Array(10).fill(0)
  for (const r of connRows) {
    if (r.connection_kind !== "system_match") continue
    if (r.match_score == null) continue
    let s = Number(r.match_score)
    if (s > 1.001) s = s / 100
    if (s < 0) s = 0
    if (s > 1) s = 1
    const idx = Math.min(9, Math.floor(s * 10))
    binCount[idx]++
  }
  const match_score_histogram = binCount.map((count, i) => {
    const bin_start = i / 10
    const bin_end = (i + 1) / 10
    return {
      bin_label: `${bin_start.toFixed(1)}–${bin_end.toFixed(1)}`,
      bin_start,
      bin_end,
      count,
    }
  })

  const depthBuckets = new Map<string, number>()
  const bumpBucket = (label: string) =>
    depthBuckets.set(label, (depthBuckets.get(label) ?? 0) + 1)

  for (const uid of attendeeSet) {
    const d = degree.get(uid) ?? 0
    if (d === 0) bumpBucket("0")
    else if (d === 1) bumpBucket("1")
    else if (d === 2) bumpBucket("2")
    else if (d === 3) bumpBucket("3")
    else if (d === 4) bumpBucket("4")
    else bumpBucket("5+")
  }

  const depthOrder = ["0", "1", "2", "3", "4", "5+"]
  const connection_depth = depthOrder.map((bucket) => ({
    bucket,
    label:
      bucket === "5+"
        ? "5+ connections"
        : bucket === "0"
          ? "0 connections"
          : bucket === "1"
            ? "1 connection"
            : `${bucket} connections`,
    count: depthBuckets.get(bucket) ?? 0,
  }))

  const industryByUser = new Map<string, string[]>()
  for (const a of attendanceList) {
    const set = new Set<string>()
    for (const t of a.event_industry_tags ?? []) {
      const x = (t || "").toLowerCase().trim()
      if (x) set.add(x)
    }
    const u = userMap.get(a.user_id)
    for (const t of u?.industry_tags ?? []) {
      const x = (t || "").toLowerCase().trim()
      if (x) set.add(x)
    }
    industryByUser.set(a.user_id, [...set])
  }

  const attendee_insights: OrganizerAttendeeInsightRow[] = attendanceList.map(
    (a) => {
      const u = userMap.get(a.user_id)
      const display_name =
        [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
        u?.email ||
        a.user_id.slice(0, 8)
      const intents = [...(a.connection_types_selected ?? [])]
      const intent_labels = intents.map(
        (k) => ORGANIZER_CONNECTION_INTENT_LABELS[k] ?? humanizeSnake(k),
      )
      const ri = a.event_role_intent?.toLowerCase().trim() || "general"
      return {
        user_id: a.user_id,
        display_name,
        email: u?.email ?? null,
        intents,
        intent_labels,
        industry_tags: industryByUser.get(a.user_id) ?? [],
        role_intent: a.event_role_intent,
        role_intent_label: ROLE_INTENT_LABELS[ri] ?? humanizeSnake(ri),
        connection_degree: degree.get(a.user_id) ?? 0,
        had_system_match: matchedAttendeeSet.has(a.user_id),
        onboarding_completed: a.onboarding_completed === true,
      }
    },
  )

  attendee_insights.sort((x, y) =>
    x.display_name.localeCompare(y.display_name, undefined, {
      sensitivity: "base",
    }),
  )

  const definitions: OrganizerEventAnalyticsDefinitions = {
    total_connections:
      "Every real connection at this event. Open requests are not counted.",
    pct_attendees_matched:
      "Out of everyone who came, what share got at least one suggested introduction.",
    avg_connections_per_attendee:
      "Total connections divided by total attendees.",
    funnel_steps:
      'The last two bars only include people who finished signup. The "With suggestions" card still looks at every guest.',
  }

  return {
    event_id: eventId,
    event_name: eventRow.event_name,
    event_starts_at: eventRow.event_starts_at,
    event_ends_at: eventRow.event_ends_at,
    definitions,
    kpis: {
      total_attendees: attendanceTotal,
      total_connections: totalConnections,
      pct_attendees_matched: pctAttendeesMatched,
      avg_connections_per_attendee: avgConnPerAttendee,
    },
    funnel,
    intent_counts,
    industry_top,
    role_intent_counts,
    connection_method_counts,
    match_score_histogram,
    connection_depth,
    attendee_insights,
  }
}
