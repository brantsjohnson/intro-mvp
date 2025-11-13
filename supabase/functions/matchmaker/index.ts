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
    personalityEmbedding: user.personality_embedding ?? null,
    connectionTypes: attendance.connection_types_selected ?? null,
    followUps: (attendance.connection_followups_json as Record<string, string> | null) ?? null
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

const JOB_SEEKING_PATTERNS: RegExp[] = [
  /find(ing)? (a )?(new )?(job|role|position)/i,
  /looking for (my )?(next )?(role|job|position)/i,
  /job (search|hunt)/i,
  /open to (new )?(roles|opportunities)/i,
  /get(ting)? hired/i,
  /join( a| the)? (team|company)/i,
  /career (pivot|change|transition)/i,
  /switch(ing)? careers?/i,
  /land(ing)? (a )?(role|job|position)/i,
  /explor(ing)? (new )?roles?/i,
  /find(ing)? work/i,
  /full[- ]?time role/i,
  /part[- ]?time role/i
]

const COMMERCIAL_CLIENT_KEYWORDS = [
  "client",
  "clients",
  "customer",
  "customers",
  "buyer",
  "buyers",
  "prospect",
  "prospects",
  "lead",
  "leads",
  "sales",
  "sell",
  "selling",
  "revenue",
  "deal",
  "pipeline",
  "business opportunity",
  "business opportunities",
  "biz dev",
  "bizdev",
  "business development"
]

const COMMERCIAL_BUY_KEYWORDS = [
  "buy",
  "purchas",
  "vendor",
  "supplier",
  "tool",
  "software",
  "platform",
  "evaluation",
  "evaluate",
  "procure",
  "procurement",
  "solution",
  "solutioning"
]

const COMMERCIAL_COFUNDER_KEYWORDS = [
  "cofounder",
  "co-founder",
  "co founder",
  "founding team",
  "start a company",
  "starting a company",
  "build a startup",
  "launch a startup",
  "build a company",
  "cofounder search"
]

const HIRING_KEYWORDS = [
  "hire",
  "hiring",
  "headcount",
  "talent",
  "staff",
  "staffing",
  "fill this role",
  "fill roles",
  "fill positions",
  "grow the team",
  "building the team",
  "team members"
]

const matchesAnyPattern = (text: string, patterns: RegExp[]) => {
  if (!text) return false
  return patterns.some((pattern) => pattern.test(text))
}

const INTENT_TOKEN_OVERRIDES: Record<string, string> = {
  find_a_mentor: "mentorship",
  be_a_mentor: "mentorship_mentor",
  find_a_job: "job_seeking",
  find_job: "job_seeking",
  job_seeker: "job_seeking",
  job_seeking: "job_seeking",
  recruit: "recruiter",
  recruiting: "recruiter",
  discover_business_opportunities: "commercial",
  business_opportunities: "commercial",
  biz_opps: "commercial",
  general_connections: "general",
  general_connection: "general",
  general: "general"
}

const containsAny = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}

function detectPrimaryIntent(record: ViewerRecord) {
  const attendance = record.attendance
  const user = record.user

  const checkboxTokens = (attendance.connection_types_selected ?? [])
    .map((token: string) => {
      const override = INTENT_TOKEN_OVERRIDES[token] ?? token
      return canon(override)
    })
    .filter(Boolean)

  const preferGeneral = checkboxTokens.includes("general")
  const hasMentorOffer = checkboxTokens.includes("mentorship_mentor")
  const hasMentorNeed = checkboxTokens.includes("mentorship")
  const hasJobSeeker = checkboxTokens.includes("job_seeking")
  const hasRecruiter = checkboxTokens.includes("recruiter")
  const hasHiring = checkboxTokens.includes("hiring")
  const hasCommercial = checkboxTokens.includes("commercial") || checkboxTokens.includes("clients")
  const hasBeta = checkboxTokens.includes("beta_users")

  if (hasMentorOffer) return { intent: "mentorship", mode: "mentor" as const }
  if (hasMentorNeed) return { intent: "mentorship", mode: "mentee" as const }
  if (hasJobSeeker) return { intent: "job_seeking" as const }
  if (hasRecruiter) return { intent: "recruiting" as const }
  if (hasHiring && !hasJobSeeker) return { intent: "hiring" as const }
  if (hasCommercial) return { intent: "commercial" as const }
  if (hasBeta) return { intent: "beta_users" as const }

  const combinedParts = [
    attendance.business_need_text ?? "",
    attendance.why_attending_text ?? "",
    user.want_summary_text ?? ""
  ]
  const combinedText = combinedParts.filter(Boolean).join(" ").trim()
  const needTokens = canonicalizeList(attendance.event_need_tags ?? user.need_tags)

  const jobSeekerFromText = matchesAnyPattern(combinedText, JOB_SEEKING_PATTERNS)
  if (jobSeekerFromText) return { intent: "job_seeking" as const }

  if (
    containsAny(combinedText, ["invest", "fundraise", "raise", "capital", "vc", "venture", "angel"]) ||
    needTokens.includes("investment")
  ) {
    return { intent: "investment" as const }
  }

  const recruitingFromText = containsAny(combinedText, RECRUITER_KEYWORDS)
  if (recruitingFromText) return { intent: "recruiting" as const }

  const hiringFromText = containsAny(combinedText, HIRING_KEYWORDS)
  if ((hasHiring || hiringFromText) && !jobSeekerFromText) {
    return { intent: "hiring" as const }
  }

  const commercialFromText =
    containsAny(combinedText, COMMERCIAL_CLIENT_KEYWORDS) ||
    containsAny(combinedText, PARTNERSHIP_KEYWORDS) ||
    containsAny(combinedText, COMMERCIAL_BUY_KEYWORDS) ||
    containsAny(combinedText, COMMERCIAL_COFUNDER_KEYWORDS)
  if (commercialFromText) {
    return { intent: "commercial" as const }
  }

  if (
    containsAny(combinedText, ["partner", "partnership", "alliances", "channel", "co-sell", "cosell"]) ||
    needTokens.includes("partnerships")
  ) {
    return { intent: "partnerships" as const }
  }

  if (containsAny(combinedText, ["mentor", "mentorship", "guidance", "coach", "coaching"])) {
    return { intent: "mentorship", mode: "mentee" as const }
  }

  if (
    containsAny(combinedText, ["beta", "pilot", "adopter", "feedback", "early user", "user research"]) ||
    needTokens.includes("beta_users")
  ) {
    return { intent: "beta_users" as const }
  }

  if (
    containsAny(combinedText, ["press", "media", "journalist", "interview", "pr", "publicity", "podcast", "speaking"]) ||
    needTokens.includes("press")
  ) {
    return { intent: "press" as const }
  }

  if (preferGeneral) return { intent: "general" as const }

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
  const intentFocus = match.meta.intentFocus ?? ""
  const intentToken = match.meta.intentToken ?? ""
  const humanizeToken = (token?: string) => (token ? token.replace(/_/g, " ") : undefined)
  const intentTokenLabel = humanizeToken(intentToken)

  switch (viewerIntent.intent) {
    case "commercial":
    case "clients": {
      const focusDetail = intentFocus.startsWith("commercial:")
        ? intentFocus.split(":")[1]
        : intentFocus || (viewerIntent.intent === "clients" ? "clients" : "")
      // Buyer/Non-buyer persona-aware summary
      const cRole = (match.meta?.candidateRole as any) || null
      const persona = (match.meta?.viewerPersona as any) || null
      const isBuyerFunction = cRole && persona ? (persona.buyer_functions || []).includes(cRole.role_function) : false
      const isLeader = cRole ? ["director","vp","cxo","founder"].includes(cRole.role_seniority) : false
      const targetCompanies = Array.isArray(persona?.target_companies) ? persona.target_companies : []
      const firstName = candidate.firstName || "They"
      const jobNice = candidate.jobTitle || (cRole ? `${cRole.role_function}` : "leader")
      const companyNice = candidate.company || "their company"
      const wantPhrase =
        persona?.sector === "martech"
          ? "more clients and sponsorships"
          : "more clients"
      if (focusDetail === "partners") {
        summary = `You want partners; ${firstName} (${jobNice} at ${companyNice}) can co‑market and co‑sell${intentTokenLabel ? ` in ${intentTokenLabel}` : ""}.`
        reasonTag = "partner"
      } else if (focusDetail === "buy") {
        summary = `You’re evaluating solutions; ${firstName} (${jobNice} at ${companyNice}) helps choose tools${intentTokenLabel ? ` in ${intentTokenLabel}` : ""}.`
        reasonTag = "buyer"
      } else if (focusDetail === "cofounder") {
        summary = `You’re exploring co‑founders; ${firstName} brings ${intentTokenLabel ?? "complementary"} strengths.`
        reasonTag = "cofounder"
      } else if (isBuyerFunction && (persona?.leader_required ? isLeader : true)) {
        summary = `You want ${wantPhrase}; ${firstName} (${jobNice} at ${companyNice}) is a buyer${isLeader ? " and decision‑maker" : ""}${intentTokenLabel ? ` in ${intentTokenLabel}` : ""}.`
        reasonTag = "potential_client"
      } else if (isBuyerProspect && !isSalesRole) {
        summary = `You want ${wantPhrase}; ${firstName} (${jobNice} at ${companyNice}) looks like a promising buyer${intentTokenLabel ? ` in ${intentTokenLabel}` : ""}.`
        reasonTag = "potential_client"
      } else if (isSalesRole) {
        summary = `${firstName} is in sales; not a direct buyer, but can open referral paths.`
        reasonTag = "referrer"
      } else {
        summary = `You want ${wantPhrase}; ${firstName} (${jobNice} at ${companyNice}) is worth an intro.`
        reasonTag = "potential_client"
      }
      if (targetCompanies?.length && candidate.company) {
        for (const t of targetCompanies) {
          if (candidate.company.toLowerCase().includes(String(t).toLowerCase())) {
            summary += ` Company match: ${candidate.company}.`
            break
          }
        }
      }
      break
    }
    case "job_seeking": {
      const focus =
        intentFocus ||
        (isRecruiter ? "recruiter" : candidateNeedTokens.includes("hiring") ? "hiring_manager" : "peer_role")
      if (focus === "recruiter") {
        summary = `You’re job hunting; ${candidate.firstName ?? candidate.jobTitle ?? "they"} recruits for ${
          intentTokenLabel ?? "roles like yours"
        }.`
        reasonTag = "recruiter_referrer"
      } else if (focus === "hiring_manager") {
        summary = `You’re job hunting; ${candidate.jobTitle ?? "they"} at ${
          candidate.company ?? "their company"
        } is hiring${intentTokenLabel ? ` for ${intentTokenLabel}` : ""}.`
        reasonTag = "hiring_manager"
      } else {
        summary = `You’re job hunting; ${candidate.jobTitle ?? "they"} can share how they broke into${
          intentTokenLabel ? ` ${intentTokenLabel}` : " this role"
        }.`
        reasonTag = "peer_role"
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
      const topicText = intentTokenLabel ? ` in ${intentTokenLabel}` : ""
      if (viewerIntent.mode === "mentor" && candidateNeedsMentor) {
        summary = `You want to mentor; they’re asking for mentorship${topicText || " in your area"}.`
        reasonTag = "mentee"
      } else if (candidateMentorSignals || candidateExperience >= viewerExperience + 3) {
        summary = `You asked for mentorship; ${candidate.jobTitle ?? "they"} has deeper experience${
          topicText || ""
        } to guide you.`
        reasonTag = "mentor"
      } else {
        summary = `You want mentorship; ${candidate.jobTitle ?? "they"} can trade insights on career growth${
          topicText ? `, especially around ${intentTokenLabel}` : ""
        }.`
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
  if (viewerIntent.intent === "job_seeking" && intentToken) {
    reasons.add(`job_focus:${canon(intentToken)}`)
  }
  if ((viewerIntent.intent === "commercial" || viewerIntent.intent === "clients") && intentFocus) {
    const focusDetail = intentFocus.includes(":") ? intentFocus.split(":")[1] : intentFocus
    if (focusDetail) reasons.add(`commercial_focus:${canon(focusDetail)}`)
    if (intentToken) reasons.add(`business_need:${canon(intentToken)}`)
  }
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
  // Business pillar: 0.70 * need→offer + 0.25 * offer→need + 0.05 * connectionTypeBoost
  const connectionTypeBoost = clamp(meta.connectionBoost ?? 0) // normalized 0..1
  const businessCore = 0.70 * breakdown.s_need + 0.25 * breakdown.s_supply + 0.05 * connectionTypeBoost

  // Intent micro-boosts: sum then clamp ≤ 0.08, then add and clamp(0..1)
  let boostSum = 0

  if (viewerIntent.intent === "job_seeking") {
    if (meta.intentFocus === "recruiter" || meta.intentFocus === "hiring_manager") {
      boostSum += 0.06
    } else if (meta.intentFocus === "peer_role") {
      boostSum += 0.04
    }
  }

  if (viewerIntent.intent === "commercial" || viewerIntent.intent === "clients") {
    const focus = meta.intentFocus?.includes(":") ? meta.intentFocus.split(":")[1] : meta.intentFocus
    if (focus === "clients") boostSum += 0.05
    if (focus === "partners") boostSum += 0.05
    if (focus === "buy") boostSum += 0.05
    if (focus === "cofounder") boostSum += 0.05
    if (!focus && meta.intentToken) boostSum += 0.03
  }

  if (viewerIntent.intent === "mentorship") {
    if (meta.intentFocus === "mentor" || meta.intentFocus === "mentee") {
      boostSum += 0.05
    }
  }

  if (viewerIntent.intent === "general" || viewerIntent.intent === "other") {
    if (meta.sharedHobby) boostSum += 0.02
  }

  // Buyer-persona role/sector boosts (persona-aware)
  const vRole = meta.viewerRole
  const cRole = meta.candidateRole
  const persona = meta.viewerPersona
  if (vRole && cRole) {
    // penalties for obvious off-function pairs without rationale
    const obviousOff = vRole.role_function === "sales" && cRole.role_function === "data"
    if (obviousOff) boostSum -= 0.02
  }
  if (persona && cRole) {
    if (viewerIntent.intent === "commercial") {
      // candidate function in buyer_functions
      if (persona.buyer_functions.includes(cRole.role_function)) boostSum += 0.05
      // leadership requirement
      if (persona.leader_required && (["director","vp","cxo","founder"].includes(cRole.role_seniority))) {
        boostSum += 0.03
      }
      // sector token overlap small bonus if any token seen in candidate summary/company
      const combined = `${candidate.offerSummary ?? ""} ${candidate.company ?? ""}`.toLowerCase()
      if (combined.includes(persona.sector.replace(/_/g, " "))) {
        boostSum += 0.01
      }
      // penalize non-buyers (ICs in sales/engineering/product) when leader_required
      const nonBuyerIC =
        persona.leader_required &&
        ["sales","engineering","product"].includes(cRole.role_function) &&
        !["manager","director","vp","cxo","founder"].includes(cRole.role_seniority)
      if (nonBuyerIC) boostSum -= 0.08
    } else if (viewerIntent.intent === "job_seeking") {
      if (cRole.role_function === "hr_talent" || ["manager","director","vp","cxo","founder"].includes(cRole.role_seniority)) {
        boostSum += 0.05
      }
    } else if (viewerIntent.intent === "recruiting") {
      if (cRole.role_function === vRole?.role_function) boostSum += 0.05
    } else if (viewerIntent.intent === "mentorship") {
      if (cRole.role_function === vRole.role_function) {
        const viewerYears = 0 // unknown in this context; handled in selection tie-breaker
        boostSum += 0.04
      }
    }
  }

  boostSum = Math.min(boostSum, 0.08)
  const business = clamp(businessCore + boostSum)

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
// AI Review helpers
// -----------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(input)
    // @ts-ignore
    const digest = await crypto.subtle.digest("SHA-256", data)
    const bytes = Array.from(new Uint8Array(digest))
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i)
      hash |= 0
    }
    return String(hash >>> 0)
  }
}

function buildFingerprint(viewer: ViewerProfile, top3: ScoredCandidate[], shortlist: ScoredCandidate[]): string {
  const viewerStr = [
    viewer.businessNeed ?? "",
    viewer.whyAttending ?? "",
    (viewer.connectionTypes ?? []).join("|")
  ].join("\n")
  const candStr = top3
    .map((m) => {
      const c = m.candidate
      const parts = [
        c.id,
        c.offerSummary ?? "",
        (c.offerTags ?? []).join(","),
        JSON.stringify(c.followUps ?? {}),
        c.jobTitle ?? "",
        c.company ?? "",
        JSON.stringify(m.meta?.viewerPersona ?? {}),
        JSON.stringify(m.meta?.viewerRole ?? {}),
        JSON.stringify(m.meta?.candidateRole ?? {}),
        JSON.stringify((m.meta?.viewerPersona as any)?.target_companies ?? []),
        JSON.stringify((m.meta?.viewerPersona as any)?.target_functions ?? [])
      ]
      return parts.join("|")
    })
    .join("\n")
  const shortlistIds = shortlist.map((m) => m.candidate.id).join(",")
  return [viewerStr, candStr, shortlistIds].join("\n---\n")
}

type AIVerdict = {
  candidate_id: string
  verdict: "strong_fit" | "close_fit" | "marginal" | "not_close"
  biz_alignment_score: number
  confidence: number
  justification: string
  reason_tags?: string[]
  proposed_action?: string
}

async function reviewTopWithAI(
  openai: any,
  viewer: ViewerProfile,
  top3: ScoredCandidate[],
  shortlist: ScoredCandidate[]
): Promise<{ ordered: ScoredCandidate[]; ai: { ran: boolean; fingerprint: string; verdicts: AIVerdict[]; applied_changes: any[]; rationale: string } }> {
  const fingerprintRaw = buildFingerprint(viewer, top3, shortlist)
  const fingerprint = await sha256Hex(fingerprintRaw)
  const verdicts: AIVerdict[] = []
  let applied_changes: any[] = []
  let rationale = ""

  if (!openai) {
    return { ordered: top3, ai: { ran: false, fingerprint, verdicts, applied_changes, rationale } }
  }

  const prompt = [
    "Rank and justify the top three people who most directly help the viewer achieve their business need.",
    "Provide a short justification for each slot, referencing their need explicitly.",
    "You may reorder or replace a person if business alignment is significantly stronger (≥ 0.08).",
    "Use secondary factors (interests, personality) only for tie-breaking.",
    "Return strict JSON array of objects with keys:",
    "{candidate_id, verdict: 'strong_fit'|'close_fit'|'marginal'|'not_close', biz_alignment_score: 0-1, confidence: 0-1, justification, reason_tags: string[], proposed_action}",
    "",
    `Viewer need: ${viewer.businessNeed ?? "(none)"} | Why attending: ${viewer.whyAttending ?? "(none)"}`,
    "",
    "Candidates:",
    ...top3.map((m, i) => {
      const c = m.candidate
      return `${i + 1}. id=${c.id}, role=${c.jobTitle ?? ""} @ ${c.company ?? ""}, offerSummary=${c.offerSummary ?? ""}`
    })
  ].join("\n")

  try {
    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: "system", content: "Respond with JSON only. No prose outside of JSON." },
        { role: "user", content: prompt }
      ]
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ""
    const cleaned = raw.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      for (const v of parsed) {
        const verdict = (v.verdict || "close_fit") as AIVerdict["verdict"]
        const biz_alignment_score = Math.max(0, Math.min(1, Number(v.biz_alignment_score ?? 0)))
        const confidence = Math.max(0, Math.min(1, Number(v.confidence ?? 0)))
        verdicts.push({
          candidate_id: String(v.candidate_id ?? ""),
          verdict,
          biz_alignment_score,
          confidence,
          justification: String(v.justification ?? ""),
          reason_tags: Array.isArray(v.reason_tags) ? v.reason_tags.map(String) : [],
          proposed_action: v.proposed_action ? String(v.proposed_action) : undefined
        })
      }
    }
  } catch (err) {
    console.warn("ai_review_failed", String(err))
    return { ordered: top3, ai: { ran: false, fingerprint, verdicts, applied_changes, rationale: "ai_error" } }
  }

  // Ensure we have three verdicts and order covers all three
  const byId = new Map(top3.map((m) => [m.candidate.id, m]))
  const order: ScoredCandidate[] = []
  for (const v of verdicts) {
    const m = byId.get(v.candidate_id)
    if (m) order.push(m)
  }
  for (const m of top3) if (!order.includes(m)) order.push(m)

  // Bump rules
  const getScore = (id: string) => verdicts.find((v) => v.candidate_id === id)?.biz_alignment_score ?? 0
  if (verdicts.length >= 2 && order.length >= 2) {
    const v1 = verdicts.find((v) => v.candidate_id === order[0].candidate.id)
    if (v1 && (v1.verdict === "marginal" || v1.verdict === "not_close")) {
      const better = order.slice(1).find((m) => getScore(m.candidate.id) >= (v1.biz_alignment_score + 0.08))
      if (better) {
        applied_changes.push({ action: "demote_slot1", from: order[0].candidate.id, to: better.candidate.id })
        order.splice(order.indexOf(better), 1)
        order.unshift(better)
      }
    }
  }
  if (order.length >= 3) {
    const v2 = getScore(order[1].candidate.id)
    const v3 = getScore(order[2].candidate.id)
    if (v3 - v2 >= 0.03) {
      applied_changes.push({ action: "swap_2_3", a: order[1].candidate.id, b: order[2].candidate.id })
      const tmp = order[1]
      order[1] = order[2]
      order[2] = tmp
    }
  }

  return {
    ordered: order.slice(0, 3),
    ai: { ran: true, fingerprint, verdicts, applied_changes, rationale }
  }
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
  thresholds: { business: number; interests: number; personality: number },
  extras?: { ai_review?: any; selection_rule_version?: string }
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

  const rows = matches.map((match, idx) => {
    const pair = viewerId < match.candidate.id
      ? { a: viewerId, b: match.candidate.id }
      : { a: match.candidate.id, b: viewerId }

    const { explanation, panel } = buildDeterministicExplanation(viewerProfile, match)

    const businessComponents = {
      needOffer: Number((match.breakdown?.s_need ?? 0).toFixed(4)),
      offerNeed: Number((match.breakdown?.s_supply ?? 0).toFixed(4)),
      connectionTypeBoost: Number((match.meta?.connectionBoost ?? 0).toFixed(4)),
      intentBoosts: {
        focus: match.meta?.intentFocus ?? null,
        token: match.meta?.intentToken ?? null
      }
    }

    const totalForSelection = Number(
      (((match.pillars?.business ?? 0) + (match.pillars?.interests ?? 0) + (match.pillars?.personality ?? 0))).toFixed(4)
    )

    const payload = {
      score: Number(match.score.toFixed(4)),
      tier: match.tier,
      pillars: match.pillars,
      breakdown: match.breakdown,
      bases: match.bases,
      meta: match.meta,
      panel,
      thresholds,
      total_for_selection: totalForSelection,
      business_components: businessComponents,
      role_canonicalization: {
        viewer: match.meta?.viewerRole ?? null,
        candidate: match.meta?.candidateRole ?? null
      },
      buyer_persona: match.meta?.viewerPersona ?? null,
      ai_review: extras?.ai_review ?? null,
      selection_rule_version: extras?.selection_rule_version ?? "business_pool_ai_v2"
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
      match_algorithm_version: extras?.selection_rule_version ?? "business_pool_ai_v2"
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

  const scored = scoreCandidates(viewerProfile, candidatePool.candidates, matchConfig.weights, viewerIntent)
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

  // Business-first selection (no thresholds)
  const buyerPriority = (m: ScoredCandidate): number => {
    const persona = (m.meta?.viewerPersona as any) || null
    const role = (m.meta?.candidateRole as any) || null
    if (!persona || !role) return 0
    const isBuyerFunc = (persona.buyer_functions || []).includes(role.role_function)
    const isLeader = ["manager","director","vp","cxo","founder"].includes(role.role_seniority)
    if (isBuyerFunc && isLeader) return 2
    if (isBuyerFunc) return 1
    return 0
  }
  const byBusiness = [...prioritized].sort((a, b) => {
    const bp = buyerPriority(b) - buyerPriority(a)
    if (bp !== 0) return bp
    return (b.pillars?.business ?? 0) - (a.pillars?.business ?? 0)
  })
  let shortlist = byBusiness.slice(0, 4)

  const stableCompare = (a: ScoredCandidate, b: ScoredCandidate) => {
    // Deterministic tie-breakers
    const ai = a.pillars?.interests ?? 0
    const bi = b.pillars?.interests ?? 0
    if (bi !== ai) return bi - ai
    const ap = a.pillars?.personality ?? 0
    const bp = b.pillars?.personality ?? 0
    if (bp !== ap) return bp - ap
    // Mentorship seniority gap (larger absolute diff preferred when mentorship intent)
    if (viewerIntent.intent === "mentorship") {
      const viewerYears = viewerProfile.careerYears ?? 0
      const agap = Math.abs((a.candidate.careerYears ?? viewerYears) - viewerYears)
      const bgap = Math.abs((b.candidate.careerYears ?? viewerYears) - viewerYears)
      if (bgap !== agap) return bgap - agap
    }
    // Availability (fewer current matches first) - not available; skip
    // Prefer preserved IDs on exact ties
    const aPres = preservedIds.has(a.candidate.id) ? 1 : 0
    const bPres = preservedIds.has(b.candidate.id) ? 1 : 0
    if (bPres !== aPres) return bPres - aPres
    // Stable ID
    return String(a.candidate.id).localeCompare(String(b.candidate.id))
  }

  // Lock Slot #1 by business
  const slot1 = shortlist[0]
  const remaining = shortlist.slice(1)
  // Compute totals for selection
  for (const m of remaining) {
    const p = m.pillars!
    ;(m as any).totalForSelection = (p.business ?? 0) + (p.interests ?? 0) + (p.personality ?? 0)
  }
  remaining.sort((a, b) => {
    const at = (a as any).totalForSelection ?? 0
    const bt = (b as any).totalForSelection ?? 0
    if (bt !== at) return bt - at
    return stableCompare(a, b)
  })
  const slot2 = remaining[0]
  const slot3 = remaining[1]

  let finalMatches = [slot1, slot2, slot3].filter(Boolean) as ScoredCandidate[]

  if (!finalMatches.length) {
    const limit = matchConfig.limits.suggestionsPerUser ?? SUGGESTIONS_PER_USER
    const businessFallback = [...byBusiness]
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

  // AI review and potential reordering
  let aiReviewResult: { ran: boolean; fingerprint: string; verdicts: any[]; applied_changes: any[]; rationale: string } | null = null
  if (openai && finalMatches.length >= 2) {
    const review = await reviewTopWithAI(openai, viewerProfile, finalMatches, shortlist)
    aiReviewResult = review.ai
    finalMatches = review.ordered
  }

  for (const match of finalMatches) {
    const { summary, reasons } = buildSummaryAndReasons(viewerRecord, match.candidate, match, viewerIntent)
    match.meta.summary = summary
    match.meta.reasons = reasons
  }

  const upsertResult = await upsertMatches(supabase, eventId, viewerRecord, viewerProfile, finalMatches, thresholds, {
    ai_review: aiReviewResult,
    selection_rule_version: "business_pool_ai_v2"
  })

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