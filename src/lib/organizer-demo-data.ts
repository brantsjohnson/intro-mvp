/**
 * Fictional organizer dashboard data for sales demos and screenshots.
 * Conference size is fixed at 1741 guests; aggregates are internally consistent.
 */

import type {
  OrganizerAttendanceRosterRow,
  OrganizerEventAnalytics,
  OrganizerAttendeeInsightRow,
} from "@/lib/organizer-metrics"
import { ORGANIZER_CONNECTION_INTENT_LABELS } from "@/lib/organizer-metrics"

export const ORGANIZER_DEMO_EVENT_ID = "organizer-demo"

export const ORGANIZER_DEMO_TOTAL_ATTENDEES = 1741

const FIRST_NAMES = [
  "Jordan", "Riley", "Morgan", "Casey", "Quinn", "Avery", "Skyler", "Reese",
  "Cameron", "Drew", "Jamie", "Taylor", "Parker", "Sage", "Rowan", "Emerson",
  "Alex", "Sam", "Charlie", "Jessie", "Blake", "Logan", "Hayden", "Finley",
]

const LAST_NAMES = [
  "Nguyen", "Patel", "Garcia", "Kim", "Silva", "Okafor", "Andersson", "Cohen",
  "Martinez", "Brown", "Ito", "Kowalski", "Haddad", "Fernandez", "Park", "Singh",
  "Olsen", "Murphy", "Tanaka", "Schmidt", "Okonkwo", "Rivera", "Nakamura", "Bakker",
]

const INTENT_KEYS = [
  "biz_opps",
  "find_mentor",
  "be_mentor",
  "find_job",
  "recruit",
  "join_startup",
  "general",
  "other",
] as const

const INDUSTRY_TAGS = [
  "fintech",
  "healthtech",
  "devtools",
  "climate",
  "saas",
  "ai_ml",
  "cybersecurity",
  "logistics",
  "edtech",
  "media",
]

const CAREER_KEYS = [
  "engineering",
  "product",
  "sales",
  "marketing",
  "exec",
  "data",
  "design",
  "ops",
  "finance",
  "other",
] as const

const CAREER_LABELS: Record<(typeof CAREER_KEYS)[number], string> = {
  engineering: "Engineering",
  product: "Product",
  sales: "Sales",
  marketing: "Marketing",
  exec: "Exec / Founder",
  data: "Data & Analytics",
  design: "Design",
  ops: "Operations",
  finance: "Finance",
  other: "Other",
}

/** Deterministic “random” 0..n-1 from index */
function detMod(seed: number, n: number): number {
  return ((seed * 9301 + 49297) % 233280) % n
}

/** Weighted pick for stable but uneven bar charts (weights are relative frequencies). */
function pickWeighted<T extends string>(
  seed: number,
  keys: readonly T[],
  weights: readonly number[],
): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = detMod(seed * 7919 + 104729, Math.max(1, total))
  for (let k = 0; k < keys.length; k++) {
    r -= weights[k]!
    if (r < 0) return keys[k]!
  }
  return keys[keys.length - 1]!
}

/** Relative popularity at a large tech conference (intent selections, not headcount). */
const INTENT_WEIGHTS: Record<(typeof INTENT_KEYS)[number], number> = {
  general: 28,
  find_job: 20,
  biz_opps: 17,
  find_mentor: 13,
  recruit: 11,
  join_startup: 9,
  be_mentor: 7,
  other: 5,
}

const INDUSTRY_WEIGHTS: Record<(typeof INDUSTRY_TAGS)[number], number> = {
  saas: 22,
  fintech: 18,
  ai_ml: 16,
  healthtech: 12,
  devtools: 11,
  cybersecurity: 9,
  climate: 7,
  logistics: 6,
  edtech: 5,
  media: 4,
}

/** Job-function mix skewed toward builders and GTM, lighter on back-office. */
const CAREER_WEIGHTS: Record<(typeof CAREER_KEYS)[number], number> = {
  engineering: 24,
  product: 17,
  sales: 14,
  marketing: 12,
  exec: 11,
  data: 10,
  design: 8,
  ops: 6,
  finance: 4,
  other: 4,
}

function humanizeSnake(s: string): string {
  return s
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Suggested-match score bins — intentionally uneven (not a bell curve).
 * Sum = total synthetic system-match rows for the demo tables.
 */
const DEMO_MATCH_SCORE_BIN_COUNTS = [
  38, 71, 124, 189, 267, 311, 278, 156, 98, 92,
] as const

export const DEMO_MATCH_TOTAL = DEMO_MATCH_SCORE_BIN_COUNTS.reduce(
  (a, b) => a + b,
  0,
)

function buildDemoMatchScoreHistogram(): {
  histogram: OrganizerEventAnalytics["match_score_histogram"]
  avg_match_score: number | null
} {
  let sumWeighted = 0
  let total = 0
  const histogram = DEMO_MATCH_SCORE_BIN_COUNTS.map((count, i) => {
    const bin_start = i / 10
    const bin_end = (i + 1) / 10
    const mid = (bin_start + bin_end) / 2
    sumWeighted += mid * count
    total += count
    return {
      bin_label: `${bin_start.toFixed(1)}–${bin_end.toFixed(1)}`,
      bin_start,
      bin_end,
      count,
    }
  })
  const avg_match_score: number | null =
    total > 0 ? Math.round((sumWeighted / total) * 100) / 100 : null
  return { histogram, avg_match_score }
}

function connectionDepthFromInsights(
  rows: OrganizerAttendeeInsightRow[],
): OrganizerEventAnalytics["connection_depth"] {
  const order = ["0", "1", "2", "3", "4", "5+"] as const
  const counts = new Map<string, number>()
  for (const b of order) counts.set(b, 0)
  for (const r of rows) {
    const d = r.connection_degree
    const b = d >= 5 ? "5+" : String(d)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return order.map((bucket) => ({
    bucket,
    label:
      bucket === "5+"
        ? "5+ connections"
        : bucket === "0"
          ? "0 connections"
          : bucket === "1"
            ? "1 connection"
            : `${bucket} connections`,
    count: counts.get(bucket) ?? 0,
  }))
}

function buildAttendeeInsights(n: number): OrganizerAttendeeInsightRow[] {
  /**
   * Connection-degree buckets (sum = n) — uneven, not a smooth curve.
   * Slight “long tail” of power networkers + a wider single-connection band.
   */
  const depthPlan: { bucket: string; count: number }[] = [
    { bucket: "0", count: 141 },
    { bucket: "1", count: 276 },
    { bucket: "2", count: 523 },
    { bucket: "3", count: 368 },
    { bucket: "4", count: 251 },
    { bucket: "5+", count: 182 },
  ]

  const degrees: number[] = []
  for (const { bucket, count } of depthPlan) {
    const d =
      bucket === "5+" ? 6 : bucket === "0" ? 0 : Number.parseInt(bucket, 10)
    for (let i = 0; i < count; i++) degrees.push(d === 6 ? 5 + detMod(i, 4) : d)
  }
  while (degrees.length < n) degrees.push(detMod(degrees.length, 4))
  if (degrees.length > n) degrees.length = n

  // Fisher-ish shuffle by swapping with deterministic partner
  for (let i = 0; i < n; i++) {
    const j = detMod(i * 17 + 41, n)
    ;[degrees[i], degrees[j]] = [degrees[j]!, degrees[i]!]
  }

  const matchedTarget = 1388
  const hadMatch: boolean[] = new Array(n).fill(false)
  for (let i = 0; i < matchedTarget; i++) hadMatch[i] = true
  for (let i = 0; i < n; i++) {
    const j = detMod(i * 13 + 7, n)
    ;[hadMatch[i], hadMatch[j]] = [hadMatch[j]!, hadMatch[i]!]
  }

  const rows: OrganizerAttendeeInsightRow[] = []
  for (let i = 0; i < n; i++) {
    const fn = FIRST_NAMES[detMod(i, FIRST_NAMES.length)]!
    const ln = LAST_NAMES[detMod(i * 3 + 2, LAST_NAMES.length)]!
    const display_name = `${fn} ${ln}`

    const intentW = INTENT_KEYS.map((k) => INTENT_WEIGHTS[k])
    const ik = pickWeighted(i * 17 + 3, INTENT_KEYS, intentW)
    let ik2: (typeof INTENT_KEYS)[number] | null = null
    if (detMod(i * 11 + 5, 100) < 34) {
      ik2 = pickWeighted(i * 59 + 11, INTENT_KEYS, intentW)
      if (ik2 === ik) ik2 = INTENT_KEYS[detMod(i * 83 + 1, INTENT_KEYS.length)]!
      if (ik2 === ik) ik2 = null
    }
    const intents = ik2 ? [ik, ik2] : [ik]
    const intent_labels = intents.map(
      (k) => ORGANIZER_CONNECTION_INTENT_LABELS[k] ?? humanizeSnake(k),
    )

    const indW = INDUSTRY_TAGS.map((t) => INDUSTRY_WEIGHTS[t])
    const ind1 = pickWeighted(i * 31 + 7, INDUSTRY_TAGS, indW)
    let ind2: string | null = null
    if (detMod(i * 43 + 2, 100) < 41) {
      ind2 = pickWeighted(i * 67 + 19, INDUSTRY_TAGS, indW)
      if (ind2 === ind1) ind2 = INDUSTRY_TAGS[detMod(i * 97 + 3, INDUSTRY_TAGS.length)]!
      if (ind2 === ind1) ind2 = null
    }
    const industry_tags = [ind1, ind2 ?? ""].filter(Boolean)

    const careerW = CAREER_KEYS.map((k) => CAREER_WEIGHTS[k])
    const ck = pickWeighted(i * 41 + 13, CAREER_KEYS, careerW)
    const role_intent = detMod(i, 5) === 0 ? "recruiter" : "job_seeker"
    const role_intent_label =
      role_intent === "recruiter" ? "Recruiters" : "Job seekers"

    rows.push({
      user_id: `demo-org-att-${String(i + 1).padStart(5, "0")}`,
      display_name,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@demo-conference.example`,
      intents,
      intent_labels,
      industry_tags,
      role_intent,
      role_intent_label,
      career_role_key: ck,
      career_role_label: CAREER_LABELS[ck],
      career_title:
        ck === "engineering"
          ? "Staff Software Engineer"
          : ck === "exec"
            ? "CEO"
            : ck === "sales"
              ? "Account Director"
              : "Principal Consultant",
      connection_degree: degrees[i]!,
      had_system_match: hadMatch[i]!,
      onboarding_completed: detMod(i * 31, 100) < 96,
    })
  }

  rows.sort((a, b) =>
    a.display_name.localeCompare(b.display_name, undefined, {
      sensitivity: "base",
    }),
  )
  return rows
}

let cachedAnalytics: OrganizerEventAnalytics | null = null

export function getOrganizerDemoAnalytics(): OrganizerEventAnalytics {
  if (cachedAnalytics) return cachedAnalytics

  const n = ORGANIZER_DEMO_TOTAL_ATTENDEES
  const attendee_insights = buildAttendeeInsights(n)

  const onboarded = attendee_insights.filter((r) => r.onboarding_completed).length
  const matchedAmongOnboarded = attendee_insights.filter(
    (r) => r.had_system_match && r.onboarding_completed,
  ).length
  const madeOnePlusAmongOnboarded = attendee_insights.filter(
    (r) => r.onboarding_completed && r.connection_degree >= 1,
  ).length

  const total_connections = 5236
  const matchedAttendees = attendee_insights.filter((r) => r.had_system_match).length
  const pct_attendees_matched =
    Math.round((matchedAttendees / n) * 1000) / 10
  const avg_connections_per_attendee =
    Math.round((total_connections / n) * 100) / 100

  const funnel = [
    { id: "attended", label: "Guests", count: n, pct_of_previous: null },
    {
      id: "onboarded",
      label: "Finished signup",
      count: onboarded,
      pct_of_previous: Math.round((onboarded / n) * 1000) / 10,
    },
    {
      id: "received_ai_match",
      label: "Got suggestions",
      count: matchedAmongOnboarded,
      pct_of_previous:
        onboarded > 0
          ? Math.round((matchedAmongOnboarded / onboarded) * 1000) / 10
          : null,
    },
    {
      id: "made_one_plus_connection",
      label: "Had a connection",
      count: madeOnePlusAmongOnboarded,
      pct_of_previous:
        onboarded > 0
          ? Math.round((madeOnePlusAmongOnboarded / onboarded) * 1000) / 10
          : null,
    },
  ]

  const intentMap: Record<string, number> = {}
  for (const r of attendee_insights) {
    for (const k of r.intents) {
      intentMap[k] = (intentMap[k] ?? 0) + 1
    }
  }
  const intent_counts = Object.entries(intentMap)
    .map(([key, count]) => ({
      key,
      label: ORGANIZER_CONNECTION_INTENT_LABELS[key] ?? humanizeSnake(key),
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const industryMap: Record<string, number> = {}
  for (const r of attendee_insights) {
    for (const t of r.industry_tags) {
      const tag = t.toLowerCase()
      industryMap[tag] = (industryMap[tag] ?? 0) + 1
    }
  }
  const industry_top = Object.entries(industryMap)
    .map(([tag, count]) => ({
      tag,
      label: humanizeSnake(tag),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const roleIntentMap: Record<string, number> = {}
  for (const r of attendee_insights) {
    const ri = (r.role_intent || "general").toLowerCase()
    roleIntentMap[ri] = (roleIntentMap[ri] ?? 0) + 1
  }
  const role_intent_counts = Object.entries(roleIntentMap)
    .map(([key, count]) => ({
      key,
      label:
        key === "job_seeker"
          ? "Job seekers"
          : key === "recruiter"
            ? "Recruiters"
            : humanizeSnake(key),
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const careerMap: Record<string, { label: string; count: number }> = {}
  for (const r of attendee_insights) {
    if (!careerMap[r.career_role_key]) {
      careerMap[r.career_role_key] = {
        label: r.career_role_label,
        count: 0,
      }
    }
    careerMap[r.career_role_key]!.count++
  }
  const career_role_counts = Object.entries(careerMap)
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count)

  const connection_method_counts = [
    { key: "ai_match", label: "App suggestion", count: 1827 },
    { key: "qr", label: "QR code", count: 1388 },
    { key: "directory", label: "Directory", count: 973 },
    { key: "marked_met", label: "Marked as met", count: 619 },
    { key: "messaging", label: "From chat", count: 429 },
  ]

  const { histogram: match_score_histogram, avg_match_score } =
    buildDemoMatchScoreHistogram()

  const connection_depth = connectionDepthFromInsights(attendee_insights)

  cachedAnalytics = {
    event_id: ORGANIZER_DEMO_EVENT_ID,
    event_code: "DEMO26",
    event_name: "Global Tech Summit 2026",
    event_starts_at: "2026-05-18T08:00:00.000Z",
    event_ends_at: "2026-05-20T19:00:00.000Z",
    definitions: {
      total_connections:
        "Every real connection at this event. Open requests are not counted.",
      pct_attendees_matched:
        "Out of everyone who came, what share got at least one suggested introduction.",
      avg_connections_per_attendee:
        "Total connections divided by total attendees.",
      funnel_steps:
        'The last two bars only include people who finished signup. The "With suggestions" card still looks at every guest.',
    },
    kpis: {
      total_attendees: n,
      total_connections,
      pct_attendees_matched,
      avg_connections_per_attendee,
    },
    funnel,
    intent_counts,
    industry_top,
    role_intent_counts,
    career_role_counts,
    connection_method_counts,
    match_score_histogram,
    avg_match_score,
    connection_depth,
    attendee_insights,
  }

  return cachedAnalytics
}

export function getOrganizerDemoRosterPage(
  page: number,
  pageSize: number,
): { rows: OrganizerAttendanceRosterRow[]; total: number } {
  const total = ORGANIZER_DEMO_TOTAL_ATTENDEES
  const insights = getOrganizerDemoAnalytics().attendee_insights
  const from = (page - 1) * pageSize
  const slice = insights.slice(from, from + pageSize)
  const rows: OrganizerAttendanceRosterRow[] = slice.map((r) => {
    const [first_name, ...rest] = r.display_name.split(" ")
    const last_name = rest.join(" ") || null
    return {
      user_id: r.user_id,
      first_name: first_name ?? null,
      last_name: last_name,
      email: r.email,
      onboarding_completed: r.onboarding_completed,
      business_need_preview:
        detMod(r.user_id.length * 7, 3) === 0
          ? "Looking for enterprise pilots in EU and a design partner for analytics UX."
          : detMod(r.user_id.length * 3, 2) === 0
            ? "Raising Series B; intros to GTM leaders in fintech appreciated."
            : "Hiring senior backend engineers; also open to advisor conversations.",
    }
  })
  return { rows, total }
}

export type OrganizerDemoMatchRow = {
  connection_id: string
  a_id: string
  b_id: string
  a_display: string
  b_display: string
  match_score: number | null
  match_algorithm_version: string | null
  created_at: string | null
}

export function getOrganizerDemoMatchesPage(
  page: number,
  pageSize: number,
): { rows: OrganizerDemoMatchRow[]; total: number } {
  const insights = getOrganizerDemoAnalytics().attendee_insights
  const total = DEMO_MATCH_TOTAL
  const from = (page - 1) * pageSize
  const rows: OrganizerDemoMatchRow[] = []
  for (let k = 0; k < pageSize && from + k < total; k++) {
    const idx = from + k
    let ia = detMod(idx * 5 + 1, insights.length)
    let ib = detMod(idx * 7 + 3, insights.length)
    if (ib === ia) ib = (ia + 1) % insights.length
    const a = insights[ia]!
    const b = insights[ib]!
    const score = 0.42 + (detMod(idx * 13, 520) / 1000)
    rows.push({
      connection_id: `demo-conn-${String(idx + 1).padStart(5, "0")}`,
      a_id: a.user_id,
      b_id: b.user_id,
      a_display: a.display_name,
      b_display: b.display_name,
      match_score: Math.round(score * 1000) / 1000,
      match_algorithm_version: `matcher-v${1 + detMod(idx, 3)}`,
      created_at: new Date(
        Date.UTC(2026, 4, 18, 10 + detMod(idx, 8), detMod(idx * 2, 55), 0),
      ).toISOString(),
    })
  }
  return { rows, total }
}

export type OrganizerDemoSponsorRow = {
  user_id: string
  display_name: string
  company_name: string | null
  company_summary: string | null
  product_offering: string | null
  event_goals: string | null
  messages_sent: number
  replied: number
  linkedin: number
  met: number
  active_recently: boolean
}

export function getOrganizerDemoSponsors(): OrganizerDemoSponsorRow[] {
  return [
    {
      user_id: "demo-sponsor-01",
      display_name: "Morgan Ellis",
      company_name: "Northline Analytics",
      company_summary: "Revenue intelligence for B2B teams.",
      product_offering: "Pipeline forecasting and champion tracking.",
      event_goals: "Book 12–18 qualified demos; meet 3 design partners.",
      messages_sent: 214,
      replied: 132,
      linkedin: 98,
      met: 76,
      active_recently: true,
    },
    {
      user_id: "demo-sponsor-02",
      display_name: "Priya Shah",
      company_name: "HelioSec",
      company_summary: "Cloud security posture for mid-market SaaS.",
      product_offering: "Agentless CSPM with Slack-first workflows.",
      event_goals: "Find 25 security champions; 6 POCs by July.",
      messages_sent: 188,
      replied: 111,
      linkedin: 84,
      met: 61,
      active_recently: true,
    },
    {
      user_id: "demo-sponsor-03",
      display_name: "Diego Alvarez",
      company_name: "CargoMind",
      company_summary: "Predictive logistics for global shippers.",
      product_offering: "ETA risk scoring and dock scheduling.",
      event_goals: "Land 2 enterprise pilots in retail vertical.",
      messages_sent: 156,
      replied: 72,
      linkedin: 58,
      met: 44,
      active_recently: false,
    },
    {
      user_id: "demo-sponsor-04",
      display_name: "Sam Okonkwo",
      company_name: "LatticeLearn",
      company_summary: "AI tutoring infrastructure for universities.",
      product_offering: "APIs for adaptive curriculum and assessment.",
      event_goals: "Partner with 4 LMS vendors; recruit 2 solution architects.",
      messages_sent: 142,
      replied: 89,
      linkedin: 71,
      met: 52,
      active_recently: true,
    },
  ]
}

export function getOrganizerDemoEventSummary() {
  const a = getOrganizerDemoAnalytics()
  return {
    event_id: ORGANIZER_DEMO_EVENT_ID,
    event_name: a.event_name,
    event_code: a.event_code,
    event_location: "Moscone Center · San Francisco, CA",
    event_starts_at: a.event_starts_at,
    event_ends_at: a.event_ends_at,
  }
}
