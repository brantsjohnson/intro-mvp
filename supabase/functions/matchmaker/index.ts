// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import OpenAI from "https://esm.sh/openai@4"

import { rerankWithAI } from "./lib/rerank.ts"
import { fetchCandidatePool } from "./lib/ann.ts"
import { loadMatchConfig } from "./lib/config.ts"
import { scoreCandidates } from "./lib/scoring.ts"
import { buildDeterministicExplanation } from "./lib/explanations.ts"
import { CandidateProfile, ScoredCandidate, ViewerProfile } from "./lib/types.ts"

// -----------------------------------------------------------------------------
// Environment / clients
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? ""
const USE_AI_RERANK = (Deno.env.get("USE_AI_RERANK") ?? "on").toLowerCase()
const EMBEDDING_MODEL = Deno.env.get("MATCHMAKER_EMBED_MODEL") ?? "text-embedding-3-small"

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
}

function getClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null

// -----------------------------------------------------------------------------
// Constants & helpers
// -----------------------------------------------------------------------------

const DEFAULT_RECALL_LIMIT = 240
const SUGGESTIONS_PER_USER = 3
const SHORTLIST_SIZE = 10
const PRESERVE_THRESHOLD = 0.35
const SOFT_FLOORS = {
  business: 0.28,
  interests: 0.2,
  personality: 0.2
}

const AUTO_CLAMP = {
  business: [0.55, 0.7],
  interests: [0.35, 0.55],
  personality: [0.4, 0.6]
} as const

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

const parseDate = (value?: string | null) => {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

const canon = (value?: string | null) => {
  if (!value) return ""
  return value.toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_")
}

const tokenize = (text?: string | null) =>
  (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2)

const mergeUnique = (...lists: (string[] | null | undefined)[]): string[] | null => {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const list of lists) {
    if (!list) continue
    for (const item of list) {
      if (!item) continue
      const lower = item.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        merged.push(item)
      }
    }
  }
  return merged.length ? merged : null
}

const canonicalizeList = (list?: string[] | null) => {
  if (!list) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const value = canon(raw)
    if (value && !seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

// -----------------------------------------------------------------------------
// Embedding refresh helpers
// -----------------------------------------------------------------------------

function fusedNeedText(att: any, user: any) {
  return [
    att?.business_need_text ?? "",
    att?.why_attending_text ?? "",
    (att?.event_need_tags ?? []).join(", "),
    att?.event_role_intent ?? "",
    user?.career_title ?? "",
    user?.company_name ?? ""
  ]
    .filter(Boolean)
    .join("\n")
}

function fusedOfferText(att: any, user: any) {
  const tags = (att?.event_offer_tags?.length ? att.event_offer_tags : user?.offer_tags) ?? []
  return [
    tags.join(", "),
    user?.offer_summary_text ?? "",
    user?.career_title ?? "",
    (user?.industry_tags ?? []).join(", "),
    (user?.hobby_tags ?? user?.hobbies ?? []).join(", ")
  ]
    .filter(Boolean)
    .join("\n")
}

async function embedText(text: string) {
  const normalized = text.trim()
  if (!normalized || !openai) return null
  try {
    const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: normalized })
    const vector = response.data?.[0]?.embedding
    return vector ? Array.from(vector) : null
  } catch (error: any) {
    console.warn("embedding_failed", error?.message ?? String(error))
    return null
  }
}

function shouldRefreshEmbedding(
  current: number[] | null | undefined,
  text: string,
  lastChangedAt?: string | null,
  syncedAt?: string | null
) {
  const trimmed = text.trim()
  if (!trimmed) return Array.isArray(current) && current.length > 0
  if (!current || current.length === 0) return true
  const changedTs = parseDate(lastChangedAt)
  if (changedTs === null) return false
  const syncedTs = parseDate(syncedAt)
  if (syncedTs === null) return true
  return changedTs > syncedTs + 1000
}

async function ensureEventEmbeddings(client: any, attendance: any, user: any) {
  const updates: Record<string, unknown> = {}
  const nowIso = new Date().toISOString()

  const needText = fusedNeedText(attendance, user)
  if (
    shouldRefreshEmbedding(
      attendance?.event_need_embedding,
      needText,
      attendance?.last_profile_change_at,
      attendance?.event_need_embedding_synced_at
    )
  ) {
    if (needText) {
      const vec = await embedText(needText)
      updates.event_need_embedding = vec
      updates.event_need_embedding_synced_at = nowIso
      attendance.event_need_embedding = vec
      attendance.event_need_embedding_synced_at = nowIso
    } else {
      updates.event_need_embedding = null
      updates.event_need_embedding_synced_at = nowIso
      attendance.event_need_embedding = null
      attendance.event_need_embedding_synced_at = nowIso
    }
  }

  const offerText = fusedOfferText(attendance, user)
  if (
    shouldRefreshEmbedding(
      attendance?.event_offer_embedding,
      offerText,
      attendance?.last_profile_change_at,
      attendance?.event_offer_embedding_synced_at
    )
  ) {
    if (offerText) {
      const vec = await embedText(offerText)
      updates.event_offer_embedding = vec
      updates.event_offer_embedding_synced_at = nowIso
      attendance.event_offer_embedding = vec
      attendance.event_offer_embedding_synced_at = nowIso
    } else {
      updates.event_offer_embedding = null
      updates.event_offer_embedding_synced_at = nowIso
      attendance.event_offer_embedding = null
      attendance.event_offer_embedding_synced_at = nowIso
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await client
      .from("attendance")
      .update(updates)
      .eq("event_id", attendance.event_id)
      .eq("user_id", attendance.user_id)
    if (error) {
      console.error("Failed to update embeddings", error)
    }
  }
}

// -----------------------------------------------------------------------------
// Data loading helpers
// -----------------------------------------------------------------------------

const PROFILE_SELECT = `
  event_id,
  user_id,
  business_need_text,
  why_attending_text,
  match_count,
  user_connection_count,
  event_role_intent,
  event_availability_status,
  event_need_tags,
  event_offer_tags,
  event_industry_tags,
  event_hobby_tags,
  profile_embedding,
  event_need_embedding,
  event_offer_embedding,
  event_need_embedding_synced_at,
  event_offer_embedding_synced_at,
  last_profile_change_at,
  connection_types_selected,
  connection_followups_json,
  users:user_id (
    user_id,
    first_name,
    last_name,
    career_title,
    company_name,
    career_years_experience,
    offer_summary_text,
    want_summary_text,
    offer_embedding,
    need_embedding,
    profile_embedding,
    offer_tags,
    want_tags,
    need_tags,
    industry_tags,
    hobby_tags,
    hobbies,
    personality_embedding
  )
`

type ViewerRecord = {
  attendance: any
  user: any
}

async function loadViewerRecord(client: any, eventId: string, userId: string): Promise<ViewerRecord | null> {
  const { data, error } = await client
    .from("attendance")
    .select(PROFILE_SELECT)
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    console.error("viewer_load_error", { eventId, userId, error: error.message ?? error })
    return null
  }
  if (!data) {
    console.warn("viewer_not_found", { eventId, userId, message: "No attendance record found" })
    return null
  }
  if (!data.users) {
    console.warn("viewer_user_join_failed", { eventId, userId, message: "User join failed, loading user separately" })
    // Fallback: load user separately
    const { data: userData, error: userError } = await client
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
    
    if (userError || !userData) {
      console.error("viewer_user_missing", { eventId, userId, userError: userError?.message ?? null })
      return null
    }
    
    return { attendance: data, user: userData }
  }
  return { attendance: data, user: data.users }
}

function toViewerProfile(record: ViewerRecord): ViewerProfile {
  const { attendance, user } = record
  return {
    id: user.user_id,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    jobTitle: user.career_title ?? null,
    company: user.company_name ?? null,
    careerYears: user.career_years_experience ?? null,
    offerEmbedding: user.offer_embedding ?? null,
    needEmbedding: user.need_embedding ?? null,
    profileEmbedding: attendance.profile_embedding ?? user.profile_embedding ?? null,
    eventNeedEmbedding: attendance.event_need_embedding ?? null,
    eventOfferEmbedding: attendance.event_offer_embedding ?? null,
    offerTags: mergeUnique(user.offer_tags, attendance.event_offer_tags),
    wantTags: mergeUnique(user.want_tags, attendance.event_want_tags),
    needTags: mergeUnique(user.need_tags, attendance.event_need_tags),
    industryTags: mergeUnique(user.industry_tags, attendance.event_industry_tags),
    hobbyTags: mergeUnique(user.hobby_tags, attendance.event_hobby_tags),
    hobbies: mergeUnique(user.hobbies, attendance.event_hobby_tags),
    businessNeed: attendance.business_need_text ?? null,
    whyAttending: attendance.why_attending_text ?? null,
    roleIntent: attendance.event_role_intent ?? null,
    availabilityStatus: attendance.event_availability_status ?? null,
    personalityEmbedding: user.personality_embedding ?? null
  }
}

// -----------------------------------------------------------------------------
// Intent & explanation heuristics
// -----------------------------------------------------------------------------

const CANONICAL_TOKEN_MAP: Record<string, string> = {
  client: "clients",
  clients: "clients",
  customer: "clients",
  customers: "clients",
  buyer: "buyers",
  buyers: "buyers",
  sales: "clients",
  revenue: "clients",
  partnership: "partnerships",
  partnerships: "partnerships",
  partner: "partnerships",
  alliance: "partnerships",
  alliances: "partnerships",
  mentor: "mentorship",
  mentorship: "mentorship",
  coaching: "mentorship",
  learning: "learning",
  beta: "beta_users",
  adopter: "beta_users",
  adopters: "beta_users",
  feedback: "beta_users",
  pilot: "beta_users",
  product: "product",
  design: "design",
  ux: "design",
  ui: "design",
  engineering: "coding",
  engineer: "coding",
  engineers: "coding",
  developer: "coding",
  developers: "coding",
  data: "data",
  analytics: "data",
  machine: "machine_learning",
  "machine-learning": "machine_learning",
  ml: "machine_learning",
  python: "machine_learning",
  ai: "machine_learning",
  hiring: "hiring",
  recruit: "hiring",
  recruiting: "hiring",
  recruiter: "hiring",
  talent: "hiring",
  press: "press",
  media: "press",
  publicity: "press",
  pr: "press",
  speaking: "press"
}

const EXEC_KEYWORDS = [
  "founder",
  "cofounder",
  "co-founder",
  "ceo",
  "cxo",
  "cfo",
  "coo",
  "cpo",
  "cto",
  "cmo",
  "cio",
  "chief",
  "president",
  "owner",
  "partner",
  "principal",
  "managing",
  "chair",
  "gp",
  "general partner",
  "md",
  "managing director"
]

const SALES_KEYWORDS = [
  "sales",
  "account",
  "ae",
  "growth",
  "revenue",
  "business development",
  "bizdev",
  "bd",
  "partnership",
  "alliances",
  "commercial",
  "customer success",
  "client success",
  "gtm"
]

const INVESTOR_KEYWORDS = [
  "investor",
  "investment",
  "venture",
  "vc",
  "capital",
  "angel",
  "fund",
  "principal",
  "portfolio",
  "general partner",
  "limited partner",
  "associate"
]

const INVESTOR_COMPANY_KEYWORDS = ["capital", "ventures", "fund", "partners", "holdings", "investments"]

const RECRUITER_KEYWORDS = [
  "recruiter",
  "recruiting",
  "talent",
  "talent acquisition",
  "people",
  "hr",
  "human resources"
]

const MEDIA_KEYWORDS = [
  "journalist",
  "reporter",
  "editor",
  "producer",
  "host",
  "anchor",
  "press",
  "media",
  "podcast",
  "writer",
  "blogger",
  "publication"
]

const PARTNERSHIP_KEYWORDS = ["partnership", "alliances", "channel", "co-sell", "distribution", "ecosystem"]

const TECH_KEYWORDS = ["engineer", "engineering", "developer", "software", "architect", "devops", "data", "ml", "ai", "cto"]

const DESIGN_KEYWORDS = ["designer", "design", "ux", "ui", "creative", "brand"]

const PRODUCT_KEYWORDS = ["product manager", "product", "pm", "product lead", "product owner"]

const BUYER_FUNCTION_KEYWORDS = [
  "marketing",
  "growth",
  "product",
  "engineering",
  "technology",
  "operations",
  "finance",
  "it",
  "procurement",
  "hr",
  "talent",
  "innovation",
  "strategy",
  "digital",
  "customer",
  "brand",
  "revenue"
]

const INTENT_TOKEN_OVERRIDES: Record<string, string> = {
  find_a_mentor: "mentorship",
  be_a_mentor: "mentorship_mentor",
  find_a_job: "hiring",
  recruit: "recruiter",
  discover_business_opportunities: "clients",
  general_connections: "general"
}

const containsAny = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}

function detectPrimaryIntent(record: ViewerRecord) {
  const attendance = record.attendance
  const user = record.user

  const checkboxTokens = (attendance.connection_types_selected ?? [])
    .map((token: string) => canon(INTENT_TOKEN_OVERRIDES[token] ?? token))
    .filter(Boolean)

  if (checkboxTokens.includes("mentorship_mentor")) return { intent: "mentorship", mode: "mentor" as const }
  if (checkboxTokens.includes("mentorship")) return { intent: "mentorship", mode: "mentee" as const }
  if (checkboxTokens.includes("hiring")) return { intent: "hiring" as const }
  if (checkboxTokens.includes("recruiter")) return { intent: "recruiting" as const }
  if (checkboxTokens.includes("clients")) return { intent: "clients" as const }
  if (checkboxTokens.includes("beta_users")) return { intent: "beta_users" as const }
  if (checkboxTokens.includes("general")) return { intent: "general" as const }

  const combined = `${attendance.business_need_text ?? ""} ${attendance.why_attending_text ?? ""} ${
    user.want_summary_text ?? ""
  }`
    .toLowerCase()
    .trim()

  if (
    containsAny(combined, ["invest", "fundraise", "raise", "capital", "vc", "venture", "angel"]) ||
    canonicalizeList(attendance.event_need_tags ?? user.need_tags).includes("investment")
  ) {
    return { intent: "investment" as const }
  }

  if (containsAny(combined, ["hire", "hiring", "recruit", "talent", "headcount", "staff"])) {
    return { intent: "hiring" as const }
  }

  if (
    containsAny(combined, ["partner", "partnership", "alliances", "channel", "co-sell", "cosell"]) ||
    canonicalizeList(attendance.event_need_tags ?? user.need_tags).includes("partnerships")
  ) {
    return { intent: "partnerships" as const }
  }

  if (containsAny(combined, ["mentor", "mentorship", "guidance", "coach", "coaching"])) {
    return { intent: "mentorship", mode: "mentee" as const }
  }

  if (
    containsAny(combined, ["beta", "pilot", "adopter", "feedback", "early user", "user research"]) ||
    canonicalizeList(attendance.event_need_tags ?? user.need_tags).includes("beta_users")
  ) {
    return { intent: "beta_users" as const }
  }

  if (
    containsAny(combined, ["press", "media", "journalist", "interview", "pr", "publicity", "podcast", "speaking"]) ||
    canonicalizeList(attendance.event_need_tags ?? user.need_tags).includes("press")
  ) {
    return { intent: "press" as const }
  }

  return { intent: "general" as const }
}

function collectInterestTokens(profile: any) {
  const tokens: string[] = []
  const pushList = (list?: string[] | null) => {
    if (!list) return
    for (const item of list) {
      const value = canon(item)
      if (value) tokens.push(value)
    }
  }
  pushList(profile.attendance?.event_hobby_tags)
  pushList(profile.user?.hobby_tags)
  pushList(profile.user?.hobbies)
  if (profile.attendance?.connection_followups_json) {
    for (const raw of Object.values(profile.attendance.connection_followups_json)) {
      if (typeof raw !== "string") continue
      const parts = raw
        .split(/[,/;&+|]/g)
        .map((part) => part.trim())
        .filter((part) => part.length > 2)
      for (const part of parts) {
        const value = canon(part)
        if (value) tokens.push(value)
      }
    }
  }
  return Array.from(new Set(tokens))
}

function getIndustryTokens(profile: any) {
  return canonicalizeList(mergeUnique(profile.attendance?.event_industry_tags, profile.user?.industry_tags))
}

function buildSummaryAndReasons(
  viewer: ViewerRecord,
  candidate: CandidateProfile,
  match: ScoredCandidate,
  viewerIntent: ReturnType<typeof detectPrimaryIntent>
) {
  const viewerTokens = canonicalizeList(mergeUnique(viewer.user.need_tags, viewer.attendance.event_need_tags))
  const candidateOfferTokens = canonicalizeList(candidate.offerTags)
  const candidateNeedTokens = canonicalizeList(candidate.needTags)
  const viewerExperience = viewer.user.career_years_experience ?? 0
  const candidateExperience = candidate.careerYears ?? 0
  const candidateTitle = (candidate.jobTitle ?? "leader").toLowerCase()
  const candidateCompany = (candidate.company ?? "their company").toLowerCase()

  const combined = [
    candidateTitle,
    candidateCompany,
    (candidate.roleIntent ?? "").toLowerCase(),
    (candidate.businessNeed ?? "").toLowerCase(),
    (candidate.offerSummary ?? "").toLowerCase(),
    (candidate.wantSummary ?? "").toLowerCase()
  ].join(" ")

  const isFounderOrExec = containsAny(candidateTitle, EXEC_KEYWORDS) || containsAny(combined, EXEC_KEYWORDS)
  const isSalesRole = containsAny(combined, SALES_KEYWORDS)
  const isInvestor =
    containsAny(combined, INVESTOR_KEYWORDS) ||
    containsAny(candidateCompany, INVESTOR_COMPANY_KEYWORDS) ||
    containsAny(candidate.offerSummary ?? "", INVESTOR_KEYWORDS)
  const isRecruiter = containsAny(combined, RECRUITER_KEYWORDS)
  const isMediaRole = containsAny(combined, MEDIA_KEYWORDS)
  const isPartnershipRole = containsAny(combined, PARTNERSHIP_KEYWORDS)
  const isTechnicalRole = containsAny(combined, TECH_KEYWORDS)
  const isDesignerRole = containsAny(combined, DESIGN_KEYWORDS)
  const isProductRole = containsAny(combined, PRODUCT_KEYWORDS)
  const buyerFunctionMatch = containsAny(combined, BUYER_FUNCTION_KEYWORDS)
  const isBuyerProspect = isFounderOrExec || buyerFunctionMatch
  const candidateMentorSignals = containsAny(combined, ["mentor", "mentorship", "advisor", "coach", "adviser"])
  const candidateNeedsMentor = candidateNeedTokens.includes("mentorship")

  const sharedInterests = (() => {
    const viewerInterests = collectInterestTokens(viewer)
    const candidateInterests = new Set(collectInterestTokens({ attendance: null, user: candidate }))
    return viewerInterests.filter((interest) => candidateInterests.has(interest))
  })()

  const industryViewer = new Set(getIndustryTokens(viewer))
  const industryCandidate = getIndustryTokens({ attendance: null, user: candidate })
  const industryOverlap = industryCandidate.filter((token) => industryViewer.has(token))

  let summary = ""
  let reasonTag = "strong_overlap"

  switch (viewerIntent.intent) {
    case "clients": {
      if (isBuyerProspect && !isSalesRole) {
        summary = `You need buyers; they’re a ${candidate.jobTitle ?? "leader"} at ${
          candidate.company ?? "their company"
        }—promising prospect.`
        reasonTag = "potential_client"
      } else if (isSalesRole) {
        summary = `You need new deals; ${candidate.jobTitle ?? "they"} open referral paths.`
        reasonTag = "referrer"
      } else {
        summary = `You need clients; ${candidate.jobTitle ?? "they"} at ${
          candidate.company ?? "their company"
        } is worth an intro.`
        reasonTag = "potential_client"
      }
      break
    }
    case "investment": {
      if (isInvestor) {
        summary = `You’re raising; ${candidate.jobTitle ?? "they"} at ${
          candidate.company ?? "their firm"
        } invests in your area.`
        reasonTag = "investor"
      } else if (isBuyerProspect || isPartnershipRole) {
        summary = `You’re raising; ${candidate.jobTitle ?? "they"} can intro investors or partners.`
        reasonTag = "warm_intro_to_investor"
      } else {
        summary = `You’re fundraising; ${candidate.jobTitle ?? "they"} could accelerate investor access.`
        reasonTag = "warm_intro_to_investor"
      }
      break
    }
    case "hiring": {
      if (isRecruiter) {
        summary = `You’re hiring; ${candidate.jobTitle ?? "they"} handle recruiting and know talent pools.`
        reasonTag = "recruiter_referrer"
      } else if (isFounderOrExec || containsAny(candidateTitle, ["head", "director", "lead", "manager"])) {
        summary = `You’re hiring; ${candidate.jobTitle ?? "they"} at ${candidate.company ?? "their company"} likely needs similar roles.`
        reasonTag = "hiring_manager"
      } else {
        summary = `You’re hiring; ${candidate.jobTitle ?? "they"} can share what’s working for their team.`
        reasonTag = "hiring_manager"
      }
      break
    }
    case "recruiting": {
      if (candidateNeedTokens.includes("hiring")) {
        summary = `You’re recruiting; ${candidate.jobTitle ?? "they"} needs talent you source.`
        reasonTag = "talent_match"
      } else {
        summary = `You’re recruiting; align with ${candidate.jobTitle ?? "their"} team’s upcoming needs.`
        reasonTag = "talent_match"
      }
      break
    }
    case "beta_users": {
      summary = `Need early users; ${candidate.jobTitle ?? "they"} at ${candidate.company ?? "their company"} fits your target audience.`
      reasonTag = "beta_user"
      break
    }
    case "mentorship": {
      if (viewerIntent.mode === "mentor" && candidateNeedsMentor) {
        summary = `You want to mentor; they’re asking for mentorship in your area.`
        reasonTag = "mentee"
      } else if (candidateMentorSignals || candidateExperience >= viewerExperience + 3) {
        summary = `You asked for mentorship; ${candidate.jobTitle ?? "they"} has deeper experience to guide you.`
        reasonTag = "mentor"
      } else {
        summary = `You want mentorship; ${candidate.jobTitle ?? "they"} can trade insights on career growth.`
        reasonTag = "mentor"
      }
      break
    }
    case "partnerships": {
      summary = `Seeking partners; ${candidate.jobTitle ?? "they"} at ${candidate.company ?? "their company"} looks aligned for co-selling.`
      reasonTag = "partner"
      break
    }
    case "press": {
      if (isMediaRole) {
        summary = `Need press; ${candidate.jobTitle ?? "they"} works in media—perfect first touch.`
        reasonTag = "media_contact"
      } else {
        summary = `Need press; ${candidate.jobTitle ?? "they"} can intro relevant media contacts.`
        reasonTag = "media_contact"
      }
      break
    }
    default: {
      if (isSalesRole) {
        summary = `${candidate.jobTitle ?? "They"} is revenue-focused—great for commercial ideas and referrals.`
        reasonTag = "referrer"
      } else if (industryOverlap.length > 0) {
        summary = `Both work in ${industryOverlap[0]?.replace(/_/g, " ")}; perfect to compare notes.`
        reasonTag = "same_industry"
      } else {
        summary = `Strong overlap in role or interests—worth a five-minute intro.`
      }
      break
    }
  }

  const reasons = new Set<string>([reasonTag])
  for (const interest of sharedInterests) {
    reasons.add(`shared_interest:${interest}`)
  }
  if (industryOverlap.length > 0) reasons.add("same_industry")
  if (match.breakdown.s_career >= 0.55) reasons.add("career_overlap")
  if (match.breakdown.s_personality >= 0.55) reasons.add("personality_fit")

  return {
    summary,
    reasons: Array.from(reasons)
  }
}

// -----------------------------------------------------------------------------
// Pillars & tiers
// -----------------------------------------------------------------------------

function computePillars(scored: ScoredCandidate, viewerIntent: ReturnType<typeof detectPrimaryIntent>) {
  const { breakdown, meta, candidate } = scored
  const mutual = Math.min(breakdown.s_need, breakdown.s_supply)
  let business = 0.72 * breakdown.s_need + 0.2 * breakdown.s_supply + 0.08 * mutual
  if (meta.needToken) business += 0.03
  if (viewerIntent.intent === "clients" && meta.needToken) business += 0.04
  if (viewerIntent.intent === "investment" && containsAny((candidate.offerSummary ?? "") + (candidate.businessNeed ?? ""), INVESTOR_KEYWORDS)) {
    business += 0.04
  }
  business = clamp(business)

  const interests = clamp(Math.max(breakdown.s_common, breakdown.s_career * 0.4))
  const personality = clamp(0.6 * breakdown.s_personality + 0.4 * breakdown.s_vibe)

  return { business, interests, personality }
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const weight = idx - lo
  return sorted[lo] * (1 - weight) + sorted[hi] * weight
}

function computeThresholds(samples: { business: number; interests: number; personality: number }[], defaults: {
  business: number
  interests: number
  personality: number
}) {
  if (!samples.length) {
    return {
      business: defaults.business,
      interests: defaults.interests,
      personality: defaults.personality
    }
  }

  const businessVals = samples.map((s) => s.business)
  const interestVals = samples.map((s) => s.interests)
  const personalityVals = samples.map((s) => s.personality)

  const business = clamp(
    Math.max(defaults.business, quantile(businessVals, 0.7)),
    AUTO_CLAMP.business[0],
    AUTO_CLAMP.business[1]
  )
  const interests = clamp(
    Math.max(defaults.interests, quantile(interestVals, 0.6)),
    AUTO_CLAMP.interests[0],
    AUTO_CLAMP.interests[1]
  )
  const personality = clamp(
    Math.max(defaults.personality, quantile(personalityVals, 0.6)),
    AUTO_CLAMP.personality[0],
    AUTO_CLAMP.personality[1]
  )

  return { business, interests, personality }
}

function assignTier(pillars: { business: number; interests: number; personality: number }, thresholds: {
  business: number
  interests: number
  personality: number
}) {
  const businessOK = pillars.business >= thresholds.business
  const interestsOK = pillars.interests >= thresholds.interests
  const personalityOK = pillars.personality >= thresholds.personality

  if (businessOK && interestsOK && personalityOK) return 1
  if (businessOK && (interestsOK || personalityOK)) return 2
  if (businessOK) return 3
  if (interestsOK && personalityOK) return 4
  if (interestsOK) return 5
  if (personalityOK) return 6
  return 0
}

function selectByTier(matches: ScoredCandidate[], limit: number) {
  if (limit <= 0) return []
  const byTier = new Map<number, ScoredCandidate[]>()
  for (const match of matches) {
    const tier = match.tier || 0
    if (!byTier.has(tier)) byTier.set(tier, [])
    byTier.get(tier)!.push(match)
  }
  const ordered: ScoredCandidate[] = []
  for (const tier of [1, 2, 3, 4, 5, 6]) {
    const list = byTier.get(tier) || []
    list.sort((a, b) => b.score - a.score)
    for (const match of list) {
      ordered.push(match)
      if (ordered.length >= limit) return ordered
    }
  }
  const remainder = matches.filter((m) => !ordered.includes(m)).sort((a, b) => b.score - a.score)
  for (const match of remainder) {
    ordered.push(match)
    if (ordered.length >= limit) break
  }
  return ordered.slice(0, limit)
}

function prioritizePreserved(matches: ScoredCandidate[], preservedIds: Set<string>) {
  if (!preservedIds.size) return matches
  const preserved: ScoredCandidate[] = []
  const remainder: ScoredCandidate[] = []
  for (const match of matches) {
    if (preservedIds.has(match.candidate.id)) preserved.push(match)
    else remainder.push(match)
  }
  return [...preserved, ...remainder]
}

// -----------------------------------------------------------------------------
// Match persistence
// -----------------------------------------------------------------------------

async function upsertMatches(
  client: any,
  eventId: string,
  viewerRecord: ViewerRecord,
  viewerProfile: ViewerProfile,
  matches: ScoredCandidate[],
  thresholds: { business: number; interests: number; personality: number }
) {
  const viewerId = viewerRecord.user.user_id

  await client
    .from("connections")
    .delete()
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${viewerId},b_id.eq.${viewerId}`)

  if (matches.length === 0) {
    return { inserted: [], planned: [] }
  }

  const rows = matches.map((match) => {
    const pair = viewerId < match.candidate.id
      ? { a: viewerId, b: match.candidate.id }
      : { a: match.candidate.id, b: viewerId }

    const { explanation, panel } = buildDeterministicExplanation(viewerProfile, match)

    const payload = {
      score: Number(match.score.toFixed(4)),
      tier: match.tier,
      pillars: match.pillars,
      breakdown: match.breakdown,
      bases: match.bases,
      meta: match.meta,
      panel,
      thresholds
    }

    return {
      event_id: eventId,
      a_id: pair.a,
      b_id: pair.b,
      connection_kind: "system_match",
      created_by_user_id: viewerId,
      match_score: payload.score,
      match_tier: match.tier,
      match_pillars_json: match.pillars,
      match_score_breakdown_json: payload,
      match_explanation_text: match.meta.summary ?? explanation,
      match_algorithm_version: "tiered-v2"
    }
  })

  const { data, error } = await client
    .from("connections")
    .insert(rows)
    .select("a_id,b_id,match_score,connection_kind")

  if (error) {
    throw error
  }

  return { inserted: data ?? [], planned: rows.map((row) => ({ a: row.a_id, b: row.b_id })) }
}

// -----------------------------------------------------------------------------
// Core processor
// -----------------------------------------------------------------------------

async function processUser(eventId: string, userId: string) {
  const supabase = getClient()

  const viewerRecord = await loadViewerRecord(supabase, eventId, userId)
  if (!viewerRecord) {
    // Try a simpler query to see if attendance exists at all
    const { data: simpleCheck, error: simpleError } = await supabase
      .from("attendance")
      .select("user_id, event_id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle()
    
    console.error("viewer_missing_detailed", {
      eventId,
      userId,
      simpleCheck: simpleCheck ? "found" : "not_found",
      simpleError: simpleError?.message ?? null,
      message: "Failed to load viewer profile with full join"
    })
    return { processed: 0, reason: "viewer_missing" }
  }

  await ensureEventEmbeddings(supabase, viewerRecord.attendance, viewerRecord.user)

  const viewerProfile = toViewerProfile(viewerRecord)
  const viewerIntent = detectPrimaryIntent(viewerRecord)

  const matchConfig = await loadMatchConfig(supabase, eventId)
  console.log("viewer_loaded", {
    eventId,
    userId,
    intent: viewerIntent.intent,
    connection_types: viewerRecord.attendance?.connection_types_selected ?? null,
    thresholds: matchConfig.thresholds,
    limits: matchConfig.limits
  })

  const { data: locks } = await supabase
    .from("connections")
    .select("locked_until_utc")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)
    .gt("locked_until_utc", new Date().toISOString())

  if (locks && locks.length > 0) {
    console.log("locked_skip", { eventId, userId, locks: locks.length })
    return { processed: 0, skipped: true, reason: "locked" }
  }

  const existing = await supabase
    .from("connections")
    .select("a_id,b_id,match_score")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)

  const existingMatches = existing.data ?? []
  const existingPairs = existingMatches
    .map((row: any) => ({
      otherId: row.a_id === userId ? row.b_id : row.a_id,
      score: row.match_score ?? 0
    }))
    .filter((entry) => Boolean(entry.otherId))

  const preservedIds = new Set(
    existingPairs
      .filter((entry) => entry.score >= PRESERVE_THRESHOLD)
      .map((entry) => entry.otherId as string)
  )

  const existingIds = new Set(existingPairs.map((entry) => entry.otherId as string))

  const recallLimit = Math.max(matchConfig.limits.candidateRecall ?? DEFAULT_RECALL_LIMIT, 60)
  const candidatePool = await fetchCandidatePool(supabase, eventId, viewerProfile, existingIds, {
    annLimit: recallLimit,
    fallbackLimit: recallLimit + 40
  })

  console.log("candidate_pool_result", {
    eventId,
    userId,
    pool_size: candidatePool.candidates.length,
    seed_count: candidatePool.seedCount,
    existing_exclusions: existingIds.size,
    has_need_embedding: !!viewerProfile.needEmbedding,
    has_offer_embedding: !!viewerProfile.offerEmbedding
  })

  if (!candidatePool.candidates.length) {
    console.warn("no_candidates_recalled", { eventId, userId })
    return { processed: 0, reason: "no_candidates" }
  }

  const scored = scoreCandidates(viewerProfile, candidatePool.candidates, matchConfig.weights)
    .filter((match) => {
      if (match.candidate.id === userId) return false
      return true
    })
    .sort((a, b) => b.score - a.score)

  if (!scored.length) {
    console.warn("no_scored_candidates", { eventId, userId })
    return { processed: 0, reason: "no_scored" }
  }

  console.log("score_preview", {
    eventId,
    userId,
    total_scored: scored.length,
    top5: scored.slice(0, 5).map((match) => ({
      id: match.candidate.id,
      score: Number(match.score.toFixed(3)),
      need: Number(match.breakdown.s_need.toFixed(3)),
      supply: Number(match.breakdown.s_supply.toFixed(3))
    }))
  })

  const withPillars: ScoredCandidate[] = []
  const samples: { business: number; interests: number; personality: number }[] = []
  for (const match of scored) {
    const pillars = computePillars(match, viewerIntent)
    if (
      pillars.business < SOFT_FLOORS.business &&
      pillars.interests < SOFT_FLOORS.interests &&
      pillars.personality < SOFT_FLOORS.personality
    ) {
      match.meta = { ...match.meta, droppedFloor: true }
      continue
    }
    match.pillars = pillars
    samples.push(pillars)
    withPillars.push(match)
  }

  if (!withPillars.length) {
    console.warn("no_scored_after_floors", {
      eventId,
      userId,
      scored: scored.length
    })
    return { processed: 0, reason: "no_scored" }
  }

  const thresholds = computeThresholds(samples, {
    business: matchConfig.thresholds.need,
    interests: matchConfig.thresholds.interests,
    personality: matchConfig.thresholds.personality
  })

  for (const match of withPillars) {
    match.tier = assignTier(match.pillars, thresholds)
    match.gates = {
      businessOK: match.pillars.business >= thresholds.business,
      interestsOK: match.pillars.interests >= thresholds.interests,
      personalityOK: match.pillars.personality >= thresholds.personality
    }
  }

  const prioritized = prioritizePreserved(withPillars, preservedIds)

  let shortlist = prioritized.slice(0, Math.max(SHORTLIST_SIZE, SUGGESTIONS_PER_USER * 3))
  if (openai && USE_AI_RERANK !== "off" && shortlist.length > 1) {
    shortlist = await rerankWithAI(openai, viewerProfile, shortlist, shortlist.length)
  }

  let finalMatches = selectByTier(shortlist, matchConfig.limits.suggestionsPerUser ?? SUGGESTIONS_PER_USER)

  if (!finalMatches.length) {
    const limit = matchConfig.limits.suggestionsPerUser ?? SUGGESTIONS_PER_USER
    const businessFallback = [...shortlist]
      .sort((a, b) => (b.pillars?.business ?? 0) - (a.pillars?.business ?? 0))
      .slice(0, limit)
    const uniqueBusiness = businessFallback.filter(
      (match, idx, arr) => arr.findIndex((m) => m.candidate.id === match.candidate.id) === idx
    )
    let fallbackMatches = uniqueBusiness.filter((match) => (match.pillars?.business ?? 0) > 0)

    if (fallbackMatches.length < limit) {
      const needRanked = [...shortlist]
        .sort((a, b) => b.breakdown.s_need - a.breakdown.s_need)
        .filter((match) => !fallbackMatches.some((m) => m.candidate.id === match.candidate.id))
        .slice(0, limit - fallbackMatches.length)
      fallbackMatches = [...fallbackMatches, ...needRanked]
    }

    if (!fallbackMatches.length && shortlist.length) {
      fallbackMatches = shortlist.slice(0, limit)
    }

    if (!fallbackMatches.length) {
      console.warn("no_matches_after_fallback", {
        eventId,
        userId,
        shortlist: shortlist.length
      })
      return { processed: 0, reason: "no_matches" }
    }

    console.warn("fallback_matches_used", {
      eventId,
      userId,
      fallback_count: fallbackMatches.length,
      shortlist: shortlist.length
    })
    finalMatches = fallbackMatches
  }

  for (const match of finalMatches) {
    const { summary, reasons } = buildSummaryAndReasons(viewerRecord, match.candidate, match, viewerIntent)
    match.meta.summary = summary
    match.meta.reasons = reasons
  }

  const upsertResult = await upsertMatches(supabase, eventId, viewerRecord, viewerProfile, finalMatches, thresholds)

  console.log("matches_final", {
    eventId,
    userId,
    selected: finalMatches.map((match) => ({
      id: match.candidate.id,
      tier: match.tier,
      business: Number(match.pillars?.business?.toFixed(3) ?? 0),
      interests: Number(match.pillars?.interests?.toFixed(3) ?? 0),
      personality: Number(match.pillars?.personality?.toFixed(3) ?? 0),
      need: Number(match.breakdown.s_need.toFixed(3))
    }))
  })

  return {
    processed: finalMatches.length,
    inserted: upsertResult.inserted.length,
    planned: upsertResult.planned,
    tiers: finalMatches.reduce((acc: Record<string, number>, match) => {
      const tier = match.tier ?? 0
      acc[tier] = (acc[tier] ?? 0) + 1
      return acc
    }, {})
  }
}

// -----------------------------------------------------------------------------
// HTTP handler
// -----------------------------------------------------------------------------

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  const eventId = payload?.event_id
  const userId = payload?.user_id

  if (!eventId || !userId) {
    return new Response(JSON.stringify({ ok: false, error: "event_id and user_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  const started = Date.now()
  try {
    const result = await processUser(eventId, userId)
    return new Response(
      JSON.stringify({
        ok: (result.processed ?? 0) > 0,
        ...result,
        runtime_ms: Date.now() - started
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    )
  } catch (error: any) {
    console.error("matchmaker_error", error?.message ?? error)
    return new Response(JSON.stringify({ ok: false, error: error?.message ?? String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})