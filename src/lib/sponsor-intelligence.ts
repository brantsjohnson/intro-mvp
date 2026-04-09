import type { Json } from "./database.types"

export type IdealCustomerJson = {
  industries: string[]
  roles: string[]
  company_stages: string[]
}

export function parseIdealCustomer(json: Json | null | undefined): IdealCustomerJson {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { industries: [], roles: [], company_stages: [] }
  }
  const o = json as Record<string, unknown>
  const industries = Array.isArray(o.industries)
    ? (o.industries as unknown[]).map((x) => String(x).toLowerCase().trim()).filter(Boolean)
    : []
  const roles = Array.isArray(o.roles)
    ? (o.roles as unknown[]).map((x) => String(x).toLowerCase().trim()).filter(Boolean)
    : []
  const company_stages = Array.isArray(o.company_stages)
    ? (o.company_stages as unknown[]).map((x) => String(x).toLowerCase().trim()).filter(Boolean)
    : []
  return { industries, roles, company_stages }
}

/** Bucket max contributions (linear 0–100; multiple buckets rarely all max). */
const CAP_EVENT_INDUSTRY = 22
const CAP_USER_INDUSTRY = 16
const CAP_ROLE = 20
const CAP_STAGE = 8
const CAP_LANGUAGE = 24
const CAP_BIZ_OPPS = 10
/** Soft signal: company name tokens vs ICP industries (only if stage bucket did not fire). */
const CAP_COMPANY_NAME_INDUSTRY = 6

const PT_EVENT_INDUSTRY_HIT = 11
const PT_USER_INDUSTRY_HIT = 8

const STOPWORDS = new Set(
  [
    "the",
    "and",
    "for",
    "are",
    "but",
    "not",
    "you",
    "all",
    "can",
    "her",
    "was",
    "one",
    "our",
    "out",
    "day",
    "get",
    "has",
    "him",
    "his",
    "how",
    "man",
    "new",
    "now",
    "old",
    "see",
    "two",
    "way",
    "who",
    "its",
    "let",
    "put",
    "say",
    "she",
    "too",
    "use",
    "any",
    "may",
    "did",
    "com",
    "org",
    "net",
    "www",
    "with",
    "from",
    "that",
    "this",
    "have",
    "been",
    "than",
    "into",
    "your",
    "also",
    "more",
    "will",
    "just",
    "like",
    "only",
    "some",
    "what",
    "when",
    "make",
    "work",
    "been",
  ].map((w) => w.toLowerCase()),
)

function icpIndustryTagMatches(tag: string, icpIndustry: string): boolean {
  const t = tag.toLowerCase().trim()
  const i = icpIndustry.toLowerCase().trim()
  if (!t || !i) return false
  if (t === i) return true
  const short = t.length <= i.length ? t : i
  const long = t.length <= i.length ? i : t
  if (short.length < 4) return false
  return long.includes(short)
}

function titleMatchesRole(titleLower: string, role: string): boolean {
  const r = role.trim().toLowerCase()
  if (!r) return false
  if (r.length >= 4) return titleLower.includes(r)
  try {
    const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`\\b${escaped}\\b`, "i").test(titleLower)
  } catch {
    return titleLower.includes(r)
  }
}

function meaningfulTokensFromText(text: string, minLen: number): Set<string> {
  const out = new Set<string>()
  const words = text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
  for (const w of words) {
    if (w.length < minLen) continue
    if (STOPWORDS.has(w)) continue
    out.add(w)
  }
  return out
}

/** Tokens from sponsor copy for overlap checks (min length 4 + stoplist). */
function sponsorTokenSet(productOffering: string, companyDescription: string, eventGoals: string): {
  blob: string
  tokens: Set<string>
} {
  const blob = [productOffering, companyDescription, eventGoals]
    .map((s) => (s ?? "").toLowerCase())
    .filter(Boolean)
    .join("\n")
  return { blob, tokens: meaningfulTokensFromText(blob, 4) }
}

function attendeeTagMatchesSponsorBundle(
  tag: string,
  sponsorBlob: string,
  sponsorTokens: Set<string>,
): boolean {
  const t = tag.toLowerCase().trim()
  if (!t) return false
  if (t.length >= 3 && sponsorBlob.includes(t)) return true
  for (const tok of sponsorTokens) {
    if (t === tok) return true
    const short = t.length < tok.length ? t : tok
    const long = t.length < tok.length ? tok : t
    if (short.length >= 4 && long.includes(short)) return true
  }
  return false
}

type SignalEntry = { weight: number; text: string }

function mergeSignals(entries: SignalEntry[]): string[] {
  const byText = new Map<string, number>()
  for (const { weight, text } of entries) {
    const prev = byText.get(text) ?? 0
    if (weight > prev) byText.set(text, weight)
  }
  const sorted = [...byText.entries()].sort((a, b) => b[1] - a[1])
  return sorted.map(([t]) => t).slice(0, 8)
}

const STATUS_RANK: Record<string, number> = {
  recommended: 0,
  messaged: 1,
  reached_out: 1,
  replied: 2,
  connected: 3,
  linkedin: 4,
  met: 5,
  contacted_later: 6,
  closed_deal: 7,
}

export function leadStatusRank(s: string): number {
  return STATUS_RANK[s] ?? 0
}

export function mergeLeadStatus(current: string | undefined, next: string): string {
  const a = leadStatusRank(current ?? "recommended")
  const b = leadStatusRank(next)
  return b > a ? next : (current ?? "recommended")
}

export type ScoreInput = {
  icp: IdealCustomerJson
  productOffering: string
  sponsorCompanyDescription?: string
  sponsorEventGoals?: string
  attendee: {
    user_id: string
    event_need_tags: string[] | null
    event_want_tags: string[] | null
    event_industry_tags: string[] | null
    event_offer_tags?: string[] | null
    connection_types_selected: string[] | null
    business_need_text?: string | null
    why_attending_text?: string | null
    event_profile_summary_text?: string | null
    user: {
      career_title: string | null
      company_name: string | null
      industry_tags: string[] | null
      want_tags: string[] | null
      need_tags: string[] | null
      /** Free-text professional background; included in prose overlap vs sponsor bundle. */
      expertise_summary?: string | null
      company_summary?: string | null
      offer_summary_text?: string | null
      hobbies?: string[] | null
      career_years_experience?: number | null
    }
  }
}

export function scoreAttendeeForSponsor(input: ScoreInput): {
  score: number
  fit_signals: string[]
  reason_tags: string[]
} {
  const { icp, productOffering, attendee: a } = input
  const sponsorCompanyDescription = input.sponsorCompanyDescription ?? ""
  const sponsorEventGoals = input.sponsorEventGoals ?? ""
  const u = a.user

  const normTags = (arr: string[] | null | undefined) =>
    [...new Set((arr ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean))]

  const eventIndustry = normTags(a.event_industry_tags)
  const userIndustry = normTags(u.industry_tags)
  const needTags = normTags(a.event_need_tags)
  const wantTags = normTags(a.event_want_tags)
  const userWant = normTags(u.want_tags)
  const userNeed = normTags(u.need_tags)
  const offerTags = normTags(a.event_offer_tags)

  const { blob: sponsorBlob, tokens: sponsorTokens } = sponsorTokenSet(
    productOffering,
    sponsorCompanyDescription,
    sponsorEventGoals,
  )

  const entries: SignalEntry[] = []

  // --- ICP event industry (top 2 distinct tags, 11 pts each, cap 22)
  const eventIndustryHits: string[] = []
  for (const tag of eventIndustry) {
    if (icp.industries.some((i) => icpIndustryTagMatches(tag, i))) {
      eventIndustryHits.push(tag)
    }
  }
  const eventUnique = [...new Set(eventIndustryHits)]
  const eventCount = Math.min(2, eventUnique.length)
  let eventIndustryPts = 0
  for (let k = 0; k < eventCount; k++) {
    eventIndustryPts += PT_EVENT_INDUSTRY_HIT
    entries.push({
      weight: PT_EVENT_INDUSTRY_HIT + (10 - k),
      text: `ICP industry overlap: ${eventUnique[k]}`,
    })
  }
  eventIndustryPts = Math.min(eventIndustryPts, CAP_EVENT_INDUSTRY)

  // --- ICP user industry (top 2, 8 each, cap 16)
  const userIndustryHits: string[] = []
  for (const tag of userIndustry) {
    if (icp.industries.some((i) => icpIndustryTagMatches(tag, i))) {
      userIndustryHits.push(tag)
    }
  }
  const userIndUnique = [...new Set(userIndustryHits)]
  const userIndCount = Math.min(2, userIndUnique.length)
  let userIndustryPts = 0
  for (let k = 0; k < userIndCount; k++) {
    userIndustryPts += PT_USER_INDUSTRY_HIT
    entries.push({
      weight: PT_USER_INDUSTRY_HIT + (8 - k),
      text: `ICP industry overlap (profile): ${userIndUnique[k]}`,
    })
  }
  userIndustryPts = Math.min(userIndustryPts, CAP_USER_INDUSTRY)

  // --- ICP role (once)
  const title = (u.career_title ?? "").toLowerCase()
  let rolePts = 0
  for (const role of icp.roles) {
    if (role && titleMatchesRole(title, role)) {
      rolePts = CAP_ROLE
      entries.push({ weight: CAP_ROLE + 5, text: `ICP role match: ${role}` })
      break
    }
  }

  // --- ICP company stage (once, only if stages defined)
  let stagePts = 0
  const company = (u.company_name ?? "").toLowerCase()
  if (icp.company_stages.length > 0) {
    for (const stage of icp.company_stages) {
      if (stage && company.includes(stage)) {
        stagePts = CAP_STAGE
        entries.push({ weight: CAP_STAGE + 3, text: `Company stage signal: ${stage}` })
        break
      }
    }
  }

  // --- Company name tokens vs ICP industries (soft; skip if stage already used company_name)
  let companyNameIndustryPts = 0
  if (stagePts === 0 && icp.industries.length > 0 && company.trim()) {
    const nameTokens = meaningfulTokensFromText(company, 4)
    let matchedIndustry: string | null = null
    outer: for (const tok of nameTokens) {
      for (const ind of icp.industries) {
        if (icpIndustryTagMatches(tok, ind)) {
          matchedIndustry = ind
          break outer
        }
      }
    }
    if (matchedIndustry) {
      companyNameIndustryPts = CAP_COMPANY_NAME_INDUSTRY
      entries.push({
        weight: CAP_COMPANY_NAME_INDUSTRY + 2,
        text: `Company name suggests ICP industry: ${matchedIndustry}`,
      })
    }
  }

  // --- Need / offer language vs sponsor bundle
  const allAttendeeTags = [...needTags, ...wantTags, ...userWant, ...userNeed, ...offerTags]
  const matchingTags: string[] = []
  for (const tag of allAttendeeTags) {
    if (attendeeTagMatchesSponsorBundle(tag, sponsorBlob, sponsorTokens) && !matchingTags.includes(tag)) {
      matchingTags.push(tag)
    }
  }
  const tagSteps = [5, 4, 3, 2]
  let languagePts = 0
  for (let i = 0; i < Math.min(4, matchingTags.length); i++) {
    const add = tagSteps[i] ?? 2
    const space = CAP_LANGUAGE - languagePts
    if (space <= 0) break
    const p = Math.min(add, space)
    languagePts += p
    entries.push({
      weight: p + 4 - i,
      text: `Interest tag overlaps your offering: ${matchingTags[i]}`,
    })
  }

  const hobbiesJoined = (u.hobbies ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .join(", ")
  const yearsLine =
    u.career_years_experience != null && Number.isFinite(u.career_years_experience)
      ? `${u.career_years_experience} years professional experience`
      : ""
  const proseParts = [
    a.business_need_text,
    a.why_attending_text,
    a.event_profile_summary_text,
    u.expertise_summary,
    u.company_summary,
    u.offer_summary_text,
    hobbiesJoined || null,
    yearsLine || null,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
  const proseBlob = proseParts.join("\n").toLowerCase()
  const proseTokens = meaningfulTokensFromText(proseBlob, 4)
  let proseOverlap = 0
  for (const w of proseTokens) {
    if (sponsorTokens.has(w)) proseOverlap++
  }
  const prosePts = Math.min(10, proseOverlap * 2, CAP_LANGUAGE - languagePts)
  if (prosePts > 0) {
    languagePts += prosePts
    entries.push({
      weight: prosePts + 2,
      text: "Background or need language aligns with your product",
    })
  }
  languagePts = Math.min(languagePts, CAP_LANGUAGE)

  // --- Commercial intent (gated biz_opps)
  const hasBizOpps = (a.connection_types_selected ?? []).includes("biz_opps")
  const icpOrNeedSignal =
    eventIndustryPts > 0 ||
    userIndustryPts > 0 ||
    rolePts > 0 ||
    stagePts > 0 ||
    companyNameIndustryPts > 0 ||
    (languagePts >= 6 && (matchingTags.length > 0 || prosePts >= 4))
  let bizPts = 0
  if (hasBizOpps) {
    if (icpOrNeedSignal) {
      bizPts = CAP_BIZ_OPPS
      entries.push({
        weight: CAP_BIZ_OPPS + 1,
        text: "Selected: Business opportunities",
      })
    } else {
      bizPts = 7
      entries.push({
        weight: 7,
        text: "Selected: Business opportunities (limited other fit signals)",
      })
    }
  }

  const rawScore =
    eventIndustryPts +
    userIndustryPts +
    rolePts +
    stagePts +
    companyNameIndustryPts +
    languagePts +
    bizPts
  const score = Math.min(
    100,
    Math.max(0, Math.round(Number.isFinite(rawScore) ? rawScore : 0)),
  )

  const fit_signals = mergeSignals(entries)
  const reason_tags = fit_signals.slice(0, 5)

  return { score, fit_signals, reason_tags }
}

export function attendeeListScoreFallback(input: {
  attendee: ScoreInput["attendee"]
}): { score: number; fit_signals: string[]; reason_tags: string[] } {
  const fit_signals = [
    "Complete your sponsor profile (offering + ideal customer) for ranked fit",
  ]
  return { score: 0, fit_signals, reason_tags: fit_signals.slice(0, 5) }
}

function normalizeLinkedinProfileUrl(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (!lower.includes("linkedin.com")) return null
  if (t.startsWith("http://") || t.startsWith("https://")) return t
  return `https://${t.replace(/^\/+/, "")}`
}

/** Public LinkedIn profile URL from `users.linkedin_raw_json` (e.g. OAuth `profile_url`). */
export function linkedinProfileUrlFromRawJson(raw: Json | null | undefined): string | null {
  if (raw == null) return null
  if (typeof raw === "string") return normalizeLinkedinProfileUrl(raw)
  if (typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  for (const key of ["profile_url", "public_profile_url", "url"] as const) {
    const v = o[key]
    if (typeof v === "string") {
      const n = normalizeLinkedinProfileUrl(v)
      if (n) return n
    }
  }
  return null
}
