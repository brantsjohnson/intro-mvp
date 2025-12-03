// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import OpenAI from "https://esm.sh/openai@4"
import { canonicalizeRole, deriveBuyerPersona, isLeadershipTitle, normalizeCompanyInput } from "./lib/personas.ts"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type WantKind =
  | "find_clients"
  | "find_partners"
  | "find_talent"
  | "find_job"
  | "find_investors"
  | "find_users"
  | "find_press"
  | "learn_skill"
  | "general"

interface ViewerWant {
  kind: WantKind
  topic?: string
  rawText: string
  tags: string[]
}

interface ViewerProfile {
  id: string
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  company: string | null
  companySummary: string | null
  companyUrl?: string | null
  careerYears: number | null
  offerEmbedding: number[] | null
  needEmbedding: number[] | null
  profileEmbedding: number[] | null
  eventNeedEmbedding?: number[] | null
  eventOfferEmbedding?: number[] | null
  offerTags: string[]
  wantTags: string[]
  needTags: string[]
  industryTags: string[]
  hobbyTags: string[]
  hobbies: string[]
  businessNeed: string | null
  whyAttending: string | null
  roleIntent: string | null
  availabilityStatus: string | null
  personalityEmbedding: number[] | null
  connectionTypes: string[] | null
  followUps: Record<string, string> | null
  linkedinSkills: string[]
}

interface CandidateProfile extends ViewerProfile {
  eventId: string
  offerSummary: string | null
  wantSummary: string | null
}

interface ScoreBreakdown {
  wantFit: number
  mutualValue: number
  relationshipFit: number
  totalScore: number
  wantFitComponents: {
    semantic: number
    tagOverlap: number
    roleBonus: number
    wantFit?: number
    personaBoost?: number
    personaBases?: string[]
    viewerRole?: { role_function: string; role_seniority: string; confidence: number }
    candidateRole?: { role_function: string; role_seniority: string; confidence: number }
    viewerPersona?: { sector: string; buyer_functions: string[]; leader_required: boolean }
    aiExplanation?: string
    excluded?: boolean
    exclusionReason?: string
  }
}

interface ScoredCandidate {
  candidate: CandidateProfile
  breakdown: ScoreBreakdown
}

// -----------------------------------------------------------------------------
// Environment & Client
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
}

function getClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        "x-client-info": "intro-matchmaker-v2"
      }
    }
  })
}

// Initialize OpenAI client (optional)
function getOpenAIClient(): OpenAI | null {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set, will use hardcoded explanations")
    return null
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY })
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SUGGESTIONS_PER_USER = 3

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

const canon = (value?: string | null): string => {
  if (!value) return ""
  return value.toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_")
}

const tokenize = (text?: string | null): string[] => {
  if (!text) return []
  return text.toLowerCase().split(/[^a-z0-9]+/g).filter((token) => token.length > 2)
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

function deterministicCompare(a: ScoredCandidate, b: ScoredCandidate): number {
  // Primary: TotalScore descending (includes all boosts: wantFit, mutualValue, relationshipFit, personaBoost)
  // This ensures persona-aware matches rank higher
  if (b.breakdown.totalScore !== a.breakdown.totalScore) {
    return b.breakdown.totalScore - a.breakdown.totalScore
  }
  // Secondary: WantFit descending
  if (b.breakdown.wantFit !== a.breakdown.wantFit) {
    return b.breakdown.wantFit - a.breakdown.wantFit
  }
  // Tertiary: MutualValue descending
  if (b.breakdown.mutualValue !== a.breakdown.mutualValue) {
    return b.breakdown.mutualValue - a.breakdown.mutualValue
  }
  // Quaternary: RelationshipFit descending
  if (b.breakdown.relationshipFit !== a.breakdown.relationshipFit) {
    return b.breakdown.relationshipFit - a.breakdown.relationshipFit
  }
  // Finally: Stable ID ascending
  return a.candidate.id.localeCompare(b.candidate.id)
}

// -----------------------------------------------------------------------------
// HTTP Handler
// -----------------------------------------------------------------------------

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
}

serve(async (req) => {
  console.log("matchmaker_v2_invoked", {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  })

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    })
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      {
        status: 405,
        headers: CORS_HEADERS
      }
    )
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      {
        status: 400,
        headers: CORS_HEADERS
      }
    )
  }

  const eventId = payload?.event_id
  const userId = payload?.user_id
  const forceRecompute = payload?.force_recompute === true

  if (!eventId || !userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "event_id and user_id required" }),
      {
        status: 400,
        headers: CORS_HEADERS
      }
    )
  }

  const started = Date.now()
  try {
    const result = await processUser(eventId, userId, forceRecompute)
    const runtime = Date.now() - started

    return new Response(
      JSON.stringify({
        ok: result.processed > 0,
        ...result,
        runtime_ms: runtime
      }),
      {
        status: 200,
        headers: CORS_HEADERS
      }
    )
  } catch (error: any) {
    console.error("matchmaker_v2_error", {
      eventId,
      userId,
      error: error?.message ?? String(error),
      stack: error?.stack
    })
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? String(error) }),
      {
        status: 500,
        headers: CORS_HEADERS
      }
    )
  }
})

// -----------------------------------------------------------------------------
// Load Viewer
// -----------------------------------------------------------------------------

const PROFILE_SELECT = `
  event_id,
  user_id,
  business_need_text,
  why_attending_text,
  event_role_intent,
  event_availability_status,
  event_need_tags,
  event_offer_tags,
  event_industry_tags,
  event_hobby_tags,
  profile_embedding,
  event_need_embedding,
  event_offer_embedding,
  connection_types_selected,
  connection_followups_json,
  users:user_id (
    user_id,
    first_name,
    last_name,
    career_title,
    company_name,
    company_summary,
    company_url,
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
    linkedin_skills,
    personality_embedding
  )
`

function mergeUnique(...lists: (string[] | null | undefined)[]): string[] {
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
  return merged
}

async function loadViewerProfile(
  supabase: any,
  eventId: string,
  userId: string
): Promise<ViewerProfile | null> {
  const { data, error } = await supabase
    .from("attendance")
    .select(PROFILE_SELECT)
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    console.error("viewer_load_error", { eventId, userId, error: error?.message })
    return null
  }

  if (!data.users) {
    console.warn("viewer_user_missing", { eventId, userId })
    return null
  }

  const user = data.users
  const attendance = data

  return {
    id: user.user_id,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    jobTitle: user.career_title ?? null,
    company: user.company_name ?? null,
    companySummary: user.company_summary ?? null,
    companyUrl: user.company_url ?? null,
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
    followUps: (attendance.connection_followups_json as Record<string, string>) ?? null,
    linkedinSkills: user.linkedin_skills || []
  }
}

// -----------------------------------------------------------------------------
// Want Detection
// -----------------------------------------------------------------------------

function detectWant(profile: ViewerProfile): ViewerWant {
  const checkboxTokens = (profile.connectionTypes ?? []).map(canon)

  const combinedText = [
    profile.businessNeed ?? "",
    profile.whyAttending ?? "",
    (profile.wantTags || []).join(" "),
    (profile.needTags || []).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const allTags = mergeUnique(
    profile.wantTags,
    profile.needTags,
    profile.offerTags,
    profile.industryTags
  )

  const containsAny = (text: string, phrases: string[]): boolean =>
    phrases.some((p) => text.includes(p))

  // ---- Heuristic buckets (domain-agnostic) ----

  // Clients / customers / sponsors
  if (
    checkboxTokens.includes("clients") ||
    checkboxTokens.includes("commercial") ||
    containsAny(combinedText, [
      "clients",
      "customers",
      "buyers",
      "sponsors",
      "new business",
      "sales leads",
      "find customers",
      "get more customers",
      "grow revenue"
    ])
  ) {
    return {
      kind: "find_clients",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Partnerships / collaborators
  if (
    checkboxTokens.includes("partnerships") ||
    containsAny(combinedText, [
      "partner",
      "partnership",
      "collaborate",
      "collaboration",
      "co-sell",
      "co market",
      "channel partner"
    ])
  ) {
    return {
      kind: "find_partners",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Hiring talent
  if (
    checkboxTokens.includes("hiring") ||
    containsAny(combinedText, [
      "hire",
      "hiring",
      "talent",
      "recruit",
      "add to my team",
      "fill roles"
    ])
  ) {
    return {
      kind: "find_talent",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Job seeking
  if (
    checkboxTokens.includes("job_seeking") ||
    containsAny(combinedText, [
      "find a job",
      "job search",
      "looking for a role",
      "open to work",
      "job opportunity"
    ])
  ) {
    return {
      kind: "find_job",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Investors / funding
  if (
    checkboxTokens.includes("investment") ||
    containsAny(combinedText, [
      "investor",
      "fundraise",
      "raise money",
      "raise capital",
      "vc",
      "angel",
      "seed round",
      "series a"
    ])
  ) {
    return {
      kind: "find_investors",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Users / beta users / testers
  if (
    checkboxTokens.includes("beta_users") ||
    containsAny(combinedText, [
      "beta",
      "pilot",
      "early users",
      "testers",
      "user feedback",
      "product feedback"
    ])
  ) {
    return {
      kind: "find_users",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Press / media
  if (
    checkboxTokens.includes("press") ||
    containsAny(combinedText, [
      "press",
      "media",
      "journalist",
      "pr",
      "publicity",
      "coverage"
    ])
  ) {
    return {
      kind: "find_press",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Learn a skill / mentorship (ANY industry)
  if (
    checkboxTokens.includes("mentorship") ||
    checkboxTokens.includes("technical_mentor") ||
    containsAny(combinedText, [
      "learn",
      "mentor",
      "mentorship",
      "improve my skills",
      "skill up",
      "get better at",
      "coaching"
    ])
  ) {
    return {
      kind: "learn_skill",
      topic: extractTopic(profile),
      rawText: combinedText,
      tags: allTags
    }
  }

  // Fallback: general networking
  return {
    kind: "general",
    topic: extractTopic(profile),
    rawText: combinedText,
    tags: allTags
  }
}

function extractTopic(profile: ViewerProfile): string | undefined {
  // Try to extract topic from industry tags, company summary, or need tags
  const industryTags = profile.industryTags || []
  if (industryTags.length > 0) {
    return industryTags.slice(0, 2).join(" / ")
  }

  const companySummary = profile.companySummary
  if (companySummary) {
    // Extract first meaningful phrase
    const firstSentence = companySummary.split(/[.!?]/)[0]?.trim()
    if (firstSentence && firstSentence.length < 100) {
      return firstSentence
    }
  }

  const needTags = profile.needTags || []
  if (needTags.length > 0) {
    return needTags.slice(0, 2).join(" / ")
  }

  return undefined
}

// -----------------------------------------------------------------------------
// Main Processing Function
// -----------------------------------------------------------------------------

async function processUser(eventId: string, userId: string, forceRecompute: boolean) {
  const supabase = getClient()

  // Load viewer profile
  const viewerProfile = await loadViewerProfile(supabase, eventId, userId)
  if (!viewerProfile) {
    return { processed: 0, inserted: 0, reason: "viewer_not_found" }
  }

  // Detect want
  const want = detectWant(viewerProfile)
  console.log("viewer_want_detected", {
    eventId,
    userId,
    wantKind: want.kind,
    topic: want.topic,
    tagsCount: want.tags.length
  })

  // Check idempotence: if user already has 3 matches, check if recomputation is needed
  const { data: existingMatches } = await supabase
    .from("connections")
    .select("a_id,b_id,match_score,created_at")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(1)

  const existingCount = existingMatches?.length ?? 0
  
  if (!forceRecompute && existingCount >= SUGGESTIONS_PER_USER) {
    // Check if recomputation is needed due to new attendees or profile updates
    const lastMatchTime = existingMatches?.[0]?.created_at
    
    if (lastMatchTime) {
      // Check for new attendees since last match
      const { data: newAttendees } = await supabase
        .from("attendance")
        .select("user_id, created_at")
        .eq("event_id", eventId)
        .neq("user_id", userId)
        .gt("created_at", lastMatchTime)
        .limit(1)

      // Check for profile updates since last match
      const { data: updatedProfiles } = await supabase
        .from("attendance")
        .select("user_id, last_profile_change_at")
        .eq("event_id", eventId)
        .neq("user_id", userId)
        .not("last_profile_change_at", "is", null)
        .gt("last_profile_change_at", lastMatchTime)
        .limit(1)

      const hasNewAttendees = (newAttendees?.length ?? 0) > 0
      const hasUpdatedProfiles = (updatedProfiles?.length ?? 0) > 0

      if (!hasNewAttendees && !hasUpdatedProfiles) {
        console.log("skip_recompute_no_changes", {
          eventId,
          userId,
          existingCount,
          lastMatchTime,
          reason: "no_new_attendees_or_updates"
        })
        return {
          processed: existingCount,
          inserted: 0,
          reason: "no_changes_detected"
        }
      }

      console.log("recompute_needed", {
        eventId,
        userId,
        existingCount,
        lastMatchTime,
        hasNewAttendees,
        hasUpdatedProfiles,
        reason: "new_attendees_or_updates_detected"
      })
    } else {
      // No last match time, but we have matches - proceed with recomputation
      console.log("recompute_no_timestamp", {
        eventId,
        userId,
        existingCount,
        reason: "no_match_timestamp_found"
      })
    }
  }

  // Build candidate pool
  const { data: allAttendance } = await supabase
    .from("attendance")
    .select("user_id")
    .eq("event_id", eventId)
    .neq("user_id", userId)

  if (!allAttendance || allAttendance.length === 0) {
    return { processed: 0, inserted: 0, reason: "no_candidates" }
  }

  const candidateUserIds = allAttendance.map((a: any) => a.user_id).filter(Boolean)
  
  // Load candidate profiles
  const { data: candidateData } = await supabase
    .from("attendance")
    .select(PROFILE_SELECT)
    .eq("event_id", eventId)
    .in("user_id", candidateUserIds)

  if (!candidateData || candidateData.length === 0) {
    return { processed: 0, inserted: 0, reason: "no_candidate_profiles" }
  }

  const candidates: CandidateProfile[] = candidateData
    .filter((row: any) => row.users) // Must have user data
    .map((row: any) => {
      const user = row.users
      return {
        eventId: row.event_id,
        id: user.user_id,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
        jobTitle: user.career_title ?? null,
        company: user.company_name ?? null,
        companySummary: user.company_summary ?? null,
        companyUrl: user.company_url ?? null,
        careerYears: user.career_years_experience ?? null,
        offerEmbedding: user.offer_embedding ?? null,
        needEmbedding: user.need_embedding ?? null,
        profileEmbedding: row.profile_embedding ?? user.profile_embedding ?? null,
        eventNeedEmbedding: row.event_need_embedding ?? null,
        eventOfferEmbedding: row.event_offer_embedding ?? null,
        offerTags: mergeUnique(user.offer_tags, row.event_offer_tags),
        wantTags: mergeUnique(user.want_tags, row.event_want_tags),
        needTags: mergeUnique(user.need_tags, row.event_need_tags),
        industryTags: mergeUnique(user.industry_tags, row.event_industry_tags),
        hobbyTags: mergeUnique(user.hobby_tags, row.event_hobby_tags),
        hobbies: mergeUnique(user.hobbies, row.event_hobby_tags),
        businessNeed: row.business_need_text ?? null,
        whyAttending: row.why_attending_text ?? null,
        roleIntent: row.event_role_intent ?? null,
        availabilityStatus: row.event_availability_status ?? null,
        personalityEmbedding: user.personality_embedding ?? null,
        connectionTypes: row.connection_types_selected ?? null,
        followUps: (row.connection_followups_json as Record<string, string>) ?? null,
        linkedinSkills: user.linkedin_skills || [],
        offerSummary: user.offer_summary_text ?? null,
        wantSummary: user.want_summary_text ?? null
      }
    })

  console.log("candidate_pool_built", {
    eventId,
    userId,
    poolSize: candidates.length
  })

  // Score all candidates using rule-based scoring (for pre-filtering)
  const initialScored = scoreCandidates(viewerProfile, want, candidates)
  
  // Pre-filter to top 25 candidates for AI evaluation
  const PRE_FILTER_LIMIT = 25
  const preFilteredCandidates = preFilterCandidates(initialScored, PRE_FILTER_LIMIT)
  
  console.log("pre_filtering_complete", {
    eventId,
    userId,
    totalCandidates: candidates.length,
    preFilteredCount: preFilteredCandidates.length
  })

  // Try AI matching if available, otherwise use rule-based scoring
  const openai = getOpenAIClient()
  let scored: ScoredCandidate[]
  let usingAI = false
  
  if (openai && preFilteredCandidates.length > 0) {
    try {
      // Extract candidate profiles from pre-filtered scored candidates
      const candidateProfiles = preFilteredCandidates.map(s => s.candidate)
      
      // Use AI to score the pre-filtered candidates
      const aiScored = await scoreCandidatesWithAI(viewerProfile, want, candidateProfiles, openai)
      
      // Combine AI-scored candidates with remaining candidates (with lower scores)
      const aiScoredIds = new Set(aiScored.map(s => s.candidate.id))
      const remainingScored = initialScored.filter(s => !aiScoredIds.has(s.candidate.id))
      
      // AI-scored candidates first, then remaining rule-based scored candidates
      scored = [...aiScored, ...remainingScored]
      usingAI = true
      
      console.log("ai_matching_used", {
        eventId,
        userId,
        aiScoredCount: aiScored.length,
        remainingCount: remainingScored.length
      })
    } catch (error) {
      console.error("ai_matching_failed_fallback", {
        eventId,
        userId,
        error: error?.message ?? String(error)
      })
      // Fallback to rule-based scoring
      scored = initialScored
      usingAI = false
    }
  } else {
    // No OpenAI available or no candidates to evaluate
    scored = initialScored
    usingAI = false
    
    if (!openai) {
      console.log("ai_matching_skipped_no_openai", { eventId, userId })
    }
  }

  // Select top 3 deterministically (continuous ranking: sort by score, take top N)
  // No minimum score requirement - candidates compete relatively, not absolutely
  let selected = selectTopN(scored, SUGGESTIONS_PER_USER, want)

  // Guarantee 3 matches if we have enough candidates
  if (candidates.length >= SUGGESTIONS_PER_USER && selected.length < SUGGESTIONS_PER_USER) {
    console.warn("FORCE_FILL_MATCHES", {
      eventId,
      userId,
      availableCandidates: candidates.length,
      selectedCount: selected.length,
      attempting_fill: true
    })

    const selectedIds = new Set(selected.map((s) => s.candidate.id))
    const remaining = scored
      .filter((s) => !selectedIds.has(s.candidate.id))
      .sort(deterministicCompare)

    const needed = SUGGESTIONS_PER_USER - selected.length
    if (remaining.length >= needed) {
      selected = [...selected, ...remaining.slice(0, needed)]
      console.log("FORCE_FILL_MATCHES_SUCCESS", {
        eventId,
        userId,
        filled: needed,
        final_count: selected.length
      })
    } else {
      console.error("FORCE_FILL_MATCHES_FAILED", {
        eventId,
        userId,
        needed,
        available: remaining.length,
        total_candidates: candidates.length
      })
    }
  }

  console.log("matches_selected", {
    eventId,
    userId,
    selectedCount: selected.length,
    wantKind: want.kind,
    poolSize: candidates.length,
    top3Scores: selected.slice(0, 3).map((s) => ({
      id: s.candidate.id,
      wantFit: Number(s.breakdown.wantFit.toFixed(3)),
      totalScore: Number(s.breakdown.totalScore.toFixed(3))
    }))
  })

  // Upsert matches
  const inserted = await upsertMatches(supabase, eventId, userId, selected, want, viewerProfile, usingAI)

  // Debug logging for match breakdown with persona intelligence
  console.log("debug_match_breakdown", {
    eventId,
    userId,
    want,
    viewerPersona: selected[0]?.breakdown.wantFitComponents.viewerPersona,
    matches: selected.map((m) => ({
      candidateId: m.candidate.id,
      name: `${m.candidate.firstName} ${m.candidate.lastName}`,
      title: m.candidate.jobTitle,
      company: m.candidate.company,
      breakdown: {
        wantFit: m.breakdown.wantFit.toFixed(3),
        mutualValue: m.breakdown.mutualValue.toFixed(3),
        relationshipFit: m.breakdown.relationshipFit.toFixed(3),
        totalScore: m.breakdown.totalScore.toFixed(3),
        roleBonus: m.breakdown.wantFitComponents.roleBonus,
        personaBoost: m.breakdown.wantFitComponents.personaBoost?.toFixed(3),
        personaBases: m.breakdown.wantFitComponents.personaBases,
      },
      roles: {
        viewer: m.breakdown.wantFitComponents.viewerRole,
        candidate: m.breakdown.wantFitComponents.candidateRole,
      },
    })),
  })

  // Generate reason summaries for return (sequential to avoid rate limits)
  const reasonSummaries = []
  for (const s of selected) {
    const summary = await buildReasonSummary(want, s, viewerProfile)
    reasonSummaries.push(summary)
  }

  return {
    processed: selected.length,
    inserted,
    matches: selected.map((s, index) => ({
      id: s.candidate.id,
      score: s.breakdown.totalScore,
      reason_summary: reasonSummaries[index]
    }))
  }
}

// -----------------------------------------------------------------------------
// Scoring Functions
// -----------------------------------------------------------------------------

function computeWantFit(
  viewerWant: ViewerWant,
  viewerProfile: ViewerProfile,
  candidate: CandidateProfile
): ScoreBreakdown["wantFitComponents"] {
  // 1) Semantic similarity: viewer need ↔ candidate offer
  const viewerNeedEmbedding =
    viewerProfile.eventNeedEmbedding ?? viewerProfile.needEmbedding
  const candidateOfferEmbedding =
    candidate.eventOfferEmbedding ?? candidate.offerEmbedding

  let semantic = 0
  if (viewerNeedEmbedding && candidateOfferEmbedding) {
    semantic = Math.max(0, cosineSimilarity(viewerNeedEmbedding, candidateOfferEmbedding))
  }

  // 2) Tag overlap between want tags and candidate's offer / industry / skills
  const viewerWantTags = new Set(viewerWant.tags.map(canon))

  const candidateTagSet = new Set(
    mergeUnique(
      candidate.offerTags,
      candidate.industryTags,
      candidate.linkedinSkills
    ).map(canon)
  )

  const tagOverlap = jaccardSimilarity(viewerWantTags, candidateTagSet)

  // 3) Role + intent bonus
  let roleBonus = 0

  const title = (candidate.jobTitle || "").toLowerCase()
  const connectionTokens = (candidate.connectionTypes ?? []).map(canon)

  // Helper flags
  const isExec =
    title.includes("founder") ||
    title.includes("co-founder") ||
    title.includes("ceo") ||
    title.includes("cto") ||
    title.includes("cpo") ||
    title.includes("chief") ||
    title.includes("vp") ||
    title.includes("head") ||
    title.includes("director")

  const isPartnershipy =
    title.includes("partnership") ||
    title.includes("alliances") ||
    title.includes("biz dev") ||
    title.includes("business development") ||
    title.includes("ecosystem")

  const isBuyerFacing =
    title.includes("sales") ||
    title.includes("account executive") ||
    title.includes("ae") ||
    title.includes("customer success") ||
    title.includes("cs") ||
    title.includes("growth")

  const wantsPartners = connectionTokens.includes("partnerships")
  const wantsClients = connectionTokens.includes("clients") || connectionTokens.includes("commercial")
  const wantsInvestment = connectionTokens.includes("investment")
  const wantsMentorship = connectionTokens.includes("mentorship")

  if (viewerWant.kind === "find_clients") {
    // Buyers / decision-makers in any industry
    if (isExec && isBuyerFacing) roleBonus = 0.25
    else if (isExec || isBuyerFacing) roleBonus = 0.18
  } else if (viewerWant.kind === "find_partners") {
    // People who can actually *partner* with you
    if (isExec && isPartnershipy) roleBonus = 0.25
    else if (isPartnershipy || (isExec && wantsPartners)) roleBonus = 0.2
    else if (isExec) roleBonus = 0.12
  } else if (viewerWant.kind === "find_talent") {
    if (title.includes("recruiter") || title.includes("talent") || title.includes("people ops") || title.includes("hr")) {
      roleBonus = 0.18
    }
  } else if (viewerWant.kind === "find_investors") {
    if (
      title.includes("investor") ||
      title.includes("vc") ||
      title.includes("angel") ||
      title.includes("fund") ||
      wantsInvestment
    ) {
      roleBonus = 0.25
    }
  } else if (viewerWant.kind === "learn_skill") {
    // Senior / experienced people make better mentors
    if (isExec || title.includes("principal") || title.includes("lead") || title.includes("senior") || wantsMentorship) {
      roleBonus = 0.18
    }
  }

  // Normalize roleBonus to [0, 1] and fold in
  const normalizedRole = Math.max(0, Math.min(1, 0.5 + roleBonus))
  const wantFit = Math.max(
    0,
    Math.min(1, 0.65 * semantic + 0.25 * tagOverlap + 0.10 * normalizedRole)
  )

  return { semantic, tagOverlap, roleBonus, wantFit }
}

function computeMutualValue(
  viewerProfile: ViewerProfile,
  candidate: CandidateProfile
): number {
  // Semantic: viewer offer -> candidate need
  const viewerOfferEmbedding = viewerProfile.eventOfferEmbedding ?? viewerProfile.offerEmbedding
  const candidateNeedEmbedding = candidate.eventNeedEmbedding ?? candidate.needEmbedding

  let semantic = 0
  if (viewerOfferEmbedding && candidateNeedEmbedding) {
    semantic = Math.max(0, cosineSimilarity(viewerOfferEmbedding, candidateNeedEmbedding))
  }

  // Tag overlap
  const viewerOfferTags = new Set((viewerProfile.offerTags || []).map(canon))
  const candidateNeedTags = new Set((candidate.needTags || []).map(canon))
  const tagOverlap = jaccardSimilarity(viewerOfferTags, candidateNeedTags)

  // Shared industry
  const viewerIndustryTags = new Set((viewerProfile.industryTags || []).map(canon))
  const candidateIndustryTags = new Set((candidate.industryTags || []).map(canon))
  const sharedIndustry = jaccardSimilarity(viewerIndustryTags, candidateIndustryTags)

  return 0.5 * semantic + 0.3 * tagOverlap + 0.2 * sharedIndustry
}

function computeRelationshipFit(
  viewerProfile: ViewerProfile,
  candidate: CandidateProfile
): number {
  // Shared interests
  const viewerHobbies = new Set([
    ...(viewerProfile.hobbyTags || []),
    ...(viewerProfile.hobbies || [])
  ].map(canon))
  const candidateHobbies = new Set([
    ...(candidate.hobbyTags || []),
    ...(candidate.hobbies || [])
  ].map(canon))
  const sharedInterests = jaccardSimilarity(viewerHobbies, candidateHobbies)

  // Personality similarity (if embeddings exist)
  let personality = 0
  if (viewerProfile.personalityEmbedding && candidate.personalityEmbedding) {
    personality = Math.max(0, cosineSimilarity(viewerProfile.personalityEmbedding, candidate.personalityEmbedding))
  }

  return 0.5 * sharedInterests + 0.5 * personality
}

function scoreCandidates(
  viewerProfile: ViewerProfile,
  want: ViewerWant,
  candidates: CandidateProfile[]
): ScoredCandidate[] {
  // Compute viewer persona once (cached for all candidates)
  const viewerRole = canonicalizeRole(viewerProfile.jobTitle)
  const viewerTextForSector = [
    viewerProfile.businessNeed ?? "",
    normalizeCompanyInput(viewerProfile.company) ?? "",
    (viewerProfile.needTags ?? []).join(",")
  ].join(" ")
  
  // Map want.kind to intent for persona derivation
  const intentMap: Record<WantKind, string> = {
    find_clients: "commercial",
    find_partners: "commercial",
    find_talent: "recruiting",
    find_job: "job_seeking",
    find_investors: "commercial",
    find_users: "general",
    find_press: "general",
    learn_skill: "mentorship",
    general: "general"
  }
  const viewerIntent = intentMap[want.kind] || "general"
  const viewerPersona = deriveBuyerPersona(viewerTextForSector, viewerRole, viewerIntent)

  return candidates.map((candidate) => {
    const wantFitComponents = computeWantFit(want, viewerProfile, candidate)

    const wantFit = wantFitComponents.wantFit
    const mutualValue = computeMutualValue(viewerProfile, candidate)
    const relationshipFit = computeRelationshipFit(viewerProfile, candidate)

    // Base score calculation (no thresholds - continuous ranking)
    let totalScore: number

    switch (want.kind) {
      case "find_partners":
        // For partners: mutual value is key
        totalScore = 0.45 * wantFit + 0.4 * mutualValue + 0.15 * relationshipFit
        break

      case "find_clients":
        // For clients: "can they buy" dominates, but still require some mutual fit
        totalScore = 0.6 * wantFit + 0.3 * mutualValue + 0.1 * relationshipFit
        break

      case "find_investors":
        totalScore = 0.55 * wantFit + 0.3 * mutualValue + 0.15 * relationshipFit
        break

      case "learn_skill":
        // For mentors: relationship/personality matters more
        totalScore = 0.4 * wantFit + 0.25 * mutualValue + 0.35 * relationshipFit
        break

      default:
        // General networking
        totalScore = 0.5 * wantFit + 0.3 * mutualValue + 0.2 * relationshipFit
        break
    }

    // ============================================================
    // Buyer-Persona Intelligence Layer - Business Pillar Boosts
    // ============================================================
    // These boosts are clamped within +0.08 cap
    let personaBoost = 0
    const personaBases: string[] = []

    // Canonicalize candidate role
    const candidateRole = canonicalizeRole(candidate.jobTitle)
    const candidateCompanyLower = normalizeCompanyInput(candidate.company ?? "").toLowerCase()
    const candidateIndustryTags = candidate.industryTags ?? []
    const candidateConnectionTypes = (candidate.connectionTypes ?? []).map(canon)

    // Seller (commercial:clients) - match buyer functions and leadership
    if (want.kind === "find_clients" && viewerPersona.leader_required) {
      // Candidate function matches buyer functions
      if (viewerPersona.buyer_functions.includes(candidateRole.role_function)) {
        personaBoost += 0.03
        personaBases.push("buyer_function_match")
      }
      
      // Leadership title when leader_required
      if (isLeadershipTitle(candidateRole.role_seniority)) {
        personaBoost += 0.02
        personaBases.push("leadership_match")
      }
      
      // Sector match (viewer sector tokens ↔ candidate tags/company)
      if (viewerPersona.sector !== "unknown" && candidateIndustryTags.length > 0) {
        const sectorTokens = viewerPersona.sector.split("_")
        const sectorMatch = sectorTokens.some(token => 
          candidateIndustryTags.some(tag => tag.toLowerCase().includes(token)) ||
          candidateCompanyLower.includes(token)
        )
        if (sectorMatch) {
          personaBoost += 0.01
          personaBases.push("sector_match")
        }
      }
    }

    // Partner matching (commercial:partners) - prioritize partnership/BD roles and execs
    if (want.kind === "find_partners") {
      const isPartnershipy = candidateRole.role_function === "partnerships" || 
        (candidate.jobTitle?.toLowerCase().includes("partnership") ?? false) ||
        (candidate.jobTitle?.toLowerCase().includes("alliances") ?? false) ||
        (candidate.jobTitle?.toLowerCase().includes("biz dev") ?? false) ||
        (candidate.jobTitle?.toLowerCase().includes("business development") ?? false) ||
        candidateConnectionTypes.some(t => t.includes("partnership"))
      
      const wantsPartners = candidateConnectionTypes.some(t => 
        t.includes("partnership") || t.includes("partners")
      )
      
      // Strong boost for partnership-focused roles
      if (isPartnershipy && isLeadershipTitle(candidateRole.role_seniority)) {
        personaBoost += 0.05
        personaBases.push("partnership_exec_match")
      } else if (isPartnershipy) {
        personaBoost += 0.04
        personaBases.push("partnership_role_match")
      } else if (isLeadershipTitle(candidateRole.role_seniority) && wantsPartners) {
        personaBoost += 0.03
        personaBases.push("exec_wants_partners")
      } else if (isLeadershipTitle(candidateRole.role_seniority)) {
        personaBoost += 0.02
        personaBases.push("exec_for_partnerships")
      }
      
      // Same function boost (partners often collaborate within same domain)
      if (viewerRole.role_function === candidateRole.role_function && 
          viewerRole.role_function !== "unknown") {
        personaBoost += 0.02
        personaBases.push("same_function_partner")
      }
    }

    // Job-seeking: recruiter or hiring manager in same function
    if (want.kind === "find_job") {
      const candidateIsRecruiter = candidateRole.role_function === "hr_talent" || 
        (candidate.jobTitle?.toLowerCase().includes("recruiter") ?? false)
      const candidateIsHiring = candidateIsRecruiter || 
        candidateConnectionTypes.includes("recruit") ||
        (candidate.needTags ?? []).some(t => t.toLowerCase().includes("hiring"))
      
      if (candidateIsRecruiter && candidateRole.role_function === viewerRole.role_function) {
        personaBoost += 0.06
        personaBases.push("recruiter_function_match")
      } else if (candidateIsHiring && candidateRole.role_function === viewerRole.role_function) {
        personaBoost += 0.04
        personaBases.push("hiring_manager_function_match")
      } else if (candidateRole.role_function === viewerRole.role_function && isLeadershipTitle(candidateRole.role_seniority)) {
        personaBoost += 0.03
        personaBases.push("hiring_leader_function_match")
      }
    }

    // Recruiter: candidate is job seeker / role match
    if (want.kind === "find_talent") {
      if (candidateConnectionTypes.includes("find_job") || candidateConnectionTypes.includes("job_seeking")) {
        if (candidateRole.role_function === viewerRole.role_function) {
          personaBoost += 0.05
          personaBases.push("job_seeker_function_match")
        }
      }
    }

    // Mentorship: same function + seniority gap ≥3y
    if (want.kind === "learn_skill") {
      if (candidateRole.role_function === viewerRole.role_function) {
        const viewerYears = viewerProfile.careerYears ?? 0
        const candidateYears = candidate.careerYears ?? 0
        const seniorityGap = candidateYears - viewerYears
        if (seniorityGap >= 3) {
          personaBoost += 0.04
          personaBases.push("mentor_seniority_gap")
        }
      }
    }

    // Penalties: clear off-function pair with no product/industry rationale
    if (viewerRole.role_function !== "unknown" && candidateRole.role_function !== "unknown") {
      const functionMismatch = viewerRole.role_function !== candidateRole.role_function
      const industryOverlap = jaccardSimilarity(
        new Set((viewerProfile.industryTags ?? []).map(canon)),
        new Set(candidateIndustryTags.map(canon))
      )
      const noIndustryOverlap = industryOverlap < 0.1
      const noNeedMatch = !mutualValue || mutualValue < 0.2
      
      // Only penalize if there's no clear reason for the mismatch
      if (functionMismatch && noIndustryOverlap && noNeedMatch && 
          viewerRole.role_function !== "exec" && candidateRole.role_function !== "exec") {
        personaBoost -= 0.02
        personaBases.push("function_mismatch_penalty")
      }
    }

    // Clamp persona boost to stay within +0.08 total cap
    personaBoost = Math.max(-0.02, Math.min(0.08, personaBoost))
    totalScore = Math.max(0, Math.min(1, totalScore + personaBoost))

    return {
      candidate,
      breakdown: {
        wantFit,
        mutualValue,
        relationshipFit,
        totalScore,
        wantFitComponents: {
          ...wantFitComponents,
          personaBoost,
          personaBases,
          viewerRole,
          candidateRole,
          viewerPersona
        }
      }
    }
  })
}

// -----------------------------------------------------------------------------
// Helper Functions for AI Matching
// -----------------------------------------------------------------------------

function categorizeConnectionType(
  connectionTypes: string[] | null,
  businessNeed: string | null
): string {
  if (!connectionTypes || connectionTypes.length === 0) {
    return businessNeed ? "Business Opportunities" : "General Networking"
  }
  
  const types = connectionTypes.map(t => t.toLowerCase())
  
  if (types.some(t => t.includes("mentor") || t.includes("mentorship"))) {
    return "Mentorship"
  }
  if (types.some(t => t.includes("recruit") || t.includes("hiring") || t.includes("job"))) {
    return "Recruiting/Job Seeking"
  }
  if (types.some(t => t.includes("client") || t.includes("partner") || t.includes("business"))) {
    return "Business Opportunities"
  }
  
  return "General Networking"
}

function determineSeniorityLevel(
  jobTitle: string | null,
  careerYears: number | null
): string {
  if (!jobTitle) {
    if (careerYears && careerYears < 2) return "Junior"
    if (careerYears && careerYears >= 10) return "Senior"
    return "Mid"
  }
  
  const title = jobTitle.toLowerCase()
  
  // Very Senior
  if (title.includes("ceo") || title.includes("founder") || title.includes("co-founder") ||
      title.includes("president") || title.includes("chief") || title.includes("vp ") ||
      title.includes("vice president")) {
    return "Very Senior"
  }
  
  // Senior
  if (title.includes("director") || title.includes("head of") || title.includes("senior") ||
      (careerYears && careerYears >= 8)) {
    return "Senior"
  }
  
  // Junior
  if (title.includes("intern") || title.includes("student") || title.includes("junior") ||
      title.includes("associate") || (careerYears && careerYears < 2)) {
    return "Junior"
  }
  
  // Mid-level
  return "Mid"
}

function preFilterCandidates(
  scored: ScoredCandidate[],
  limit: number
): ScoredCandidate[] {
  const sorted = [...scored].sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore)
  return sorted.slice(0, limit)
}

// -----------------------------------------------------------------------------
// Selection
// -----------------------------------------------------------------------------

function selectTopN(
  scored: ScoredCandidate[],
  n: number,
  _want?: ViewerWant
): ScoredCandidate[] {
  const sorted = [...scored].sort(deterministicCompare)
  if (sorted.length >= n) return sorted.slice(0, n)
  return sorted
}

// -----------------------------------------------------------------------------
// AI-Based Matchmaking with Decision Tree Logic
// -----------------------------------------------------------------------------

interface AIMatchResult {
  candidateId: string
  score: number
  explanation: string
  excluded: boolean
  exclusionReason?: string
}

async function scoreCandidatesWithAI(
  viewerProfile: ViewerProfile,
  want: ViewerWant,
  candidates: CandidateProfile[],
  openai: OpenAI
): Promise<ScoredCandidate[]> {
  
  // Determine primary goal from businessNeed or connectionTypes
  const primaryGoal = viewerProfile.businessNeed || 
    (viewerProfile.connectionTypes && viewerProfile.connectionTypes.length > 0 
      ? viewerProfile.connectionTypes[0] 
      : "General Networking")
  
  // Determine connection type category
  const connectionType = categorizeConnectionType(viewerProfile.connectionTypes, viewerProfile.businessNeed)
  
  // Determine seniority level for guardrails
  const viewerSeniority = determineSeniorityLevel(viewerProfile.jobTitle, viewerProfile.careerYears)
  
  // Build comprehensive prompt with decision tree logic
  const systemPrompt = `You are the Intro Matchmaker AI, an expert system designed to create the most relevant and satisfying professional connections at events. Your primary goal is to find the best possible match (User B) for User A's explicit goal, ensuring practical value by prioritizing contextual fit (Company Specialization + Expertise) over superficial titles. Avoiding mismatches is as important as finding good matches.

================================================================================
MATCHING RULES (BY PRIORITY)
================================================================================

PRIORITY 1 (HIGHEST): Business Need (Primary Filter)
- If User A has a specific business need (e.g., "Need a patent attorney"), the match MUST have their Expertise/Skills AND Company Specialization directly aligned with solving that need.
- Job Title alone is INSUFFICIENT. You MUST verify both Expertise/Skills AND Company Specialization match the need.
- Example: If User A needs "patent attorney", a candidate with job title "Attorney" but whose company specializes in employment law should be EXCLUDED.

PRIORITY 2 (HIGH): Contextual Relevance
- Matching is based on the COMBINATION of Job Title + Expertise/Skills + Company Specialization.
- You MUST look at these three layers together to determine true capability and domain context.
- DO NOT rely on job title alone. Always cross-reference with Expertise/Skills and Company Specialization.

PRIORITY 3 (MEDIUM): General Connections
- If the goal is "General Networking", prioritize matches based on:
  * Shared Interests/Hobbies (for vibe/chemistry)
  * Similar Functional Backgrounds/Fields
  * Aligned Seniority (peers preferred)

PRIORITY 4 (MEDIUM): Business Opportunities
- Matching requires aligning on a value exchange based on specific needs (e.g., selling, co-founding, partnering).
- Use Company Specialization and Role Relevance as the primary signals.
- Look for complementary services, shared customer bases, or specific decision-making roles.

PRIORITY 5 (MEDIUM): Mentorship
- For mentees, find mentors with:
  * Relevant Years of Experience
  * An accessible seniority gap (not too disconnected)
  * Expertise in the domains they wish to mentor in

PRIORITY 6 (HIGH): Explanation Quality
- The output MUST generate a clear, concise, and persuasive explanation (max 3 sentences).
- AVOID simply restating job titles.
- FOCUS on practical value and contextual evidence (Expertise and Company Specialization).
- Explain WHY the match is valuable, not just WHAT their title is.

================================================================================
GUARDRAILS (STRICTLY ENFORCED - NO EXCEPTIONS)
================================================================================

GUARDRAIL 1: Irrelevant Domain Exclusion
- STRICTLY EXCLUDE candidates whose company specialization or primary skills CONTRADICT User A's specific need, even if the job title is identical.
- Example: If User A needs "patent attorney" and a candidate is an "Attorney" but their company specializes in employment law, they MUST be EXCLUDED.
- Rationale: Prevents useless matches like matching a founder needing IP law with an employment lawyer.

GUARDRAIL 2: Seniority Mismatch
- STRICTLY AVOID matching very junior users (e.g., Student, IC) with very senior users (e.g., VP, CEO).
- EXCEPTIONS (only if ALL conditions met):
  * The senior person is explicitly marked for "Mentorship" OR
  * The connection type is explicitly 'Recruiting/Job Seeking' with a relevant recruiter
- Rationale: Prevents the event from being seen as a detractor by senior attendees.

GUARDRAIL 3: Title Overweighting
- DO NOT assume a job title (e.g., "Marketing Director") automatically equates to a specific expertise (e.g., "SEO expert").
- Contextual data (Expertise/Skills + Company Specialization) MUST confirm the ability.
- If you cannot confirm capability from contextual data, score lower or exclude.
- Rationale: Addresses the problem of assuming capability wrongly based on title alone.

GUARDRAIL 4: Avoid Repetitive Explanations
- DO NOT generate explanations that just repeat job titles or superficial profile data.
- FOCUS on value and contextual fit.
- Explain the SPECIFIC connection between User A's need and User B's demonstrated capability (from Expertise/Skills + Company Specialization).
- Rationale: Addresses the problem of AI generating wrong or unhelpful explanations.

================================================================================
OUTPUT FORMAT
================================================================================

Return a JSON object with this structure:
{
  "matches": [
    {
      "candidateId": "uuid",
      "score": 0.0-1.0,
      "explanation": "Max 3 sentences. Focus on practical value and contextual evidence (Expertise and Company Specialization), NOT job titles. Explain WHY the match is valuable.",
      "excluded": false
    }
  ],
  "excluded": [
    {
      "candidateId": "uuid",
      "exclusionReason": "Specific reason referencing which guardrail was violated (e.g., 'Company specialization in employment law contradicts need for patent attorney')"
    }
  ]
}

SCORING GUIDELINES:
- 0.9-1.0: Perfect match (meets all criteria, strong contextual fit, all three layers align)
- 0.7-0.89: Good match (meets most criteria, good contextual fit)
- 0.5-0.69: Acceptable match (some fit, may have gaps in one layer)
- 0.0-0.49: Poor match (should be excluded or scored very low)

REMEMBER: Job Title + Expertise/Skills + Company Specialization must be evaluated TOGETHER. Never rely on job title alone.`

  const userPrompt = `USER A (Viewer) Profile:
- Name: ${viewerProfile.firstName || ''} ${viewerProfile.lastName || ''}
- Job Title: ${viewerProfile.jobTitle || 'Not specified'}
- Company: ${viewerProfile.company || 'Not specified'}
- Company Specialization: ${viewerProfile.companySummary || 'Not specified'}
- Years of Experience: ${viewerProfile.careerYears || 'Unknown'}
- Seniority Level: ${viewerSeniority}
- Primary Goal: ${primaryGoal}
- Connection Type: ${connectionType}
- Business Need: ${viewerProfile.businessNeed || 'Not specified'}
- Why Attending: ${viewerProfile.whyAttending || 'Not specified'}
- Expertise/Skills: ${[...viewerProfile.offerTags, ...viewerProfile.linkedinSkills].join(', ') || 'Not specified'}
- Industries: ${viewerProfile.industryTags.join(', ') || 'Not specified'}
- Interests/Hobbies: ${[...viewerProfile.hobbyTags, ...viewerProfile.hobbies].join(', ') || 'Not specified'}
- Looking for: ${viewerProfile.needTags.join(', ') || 'Not specified'}
- Can offer: ${viewerProfile.offerTags.join(', ') || 'Not specified'}

CANDIDATES TO EVALUATE (${candidates.length} total):
${candidates.map((c, idx) => `
${idx + 1}. Candidate ID: ${c.id}
   - Name: ${c.firstName || ''} ${c.lastName || ''}
   - Job Title: ${c.jobTitle || 'Not specified'}
   - Company: ${c.company || 'Not specified'}
   - Company Specialization: ${c.companySummary || 'Not specified'}
   - Years of Experience: ${c.careerYears || 'Unknown'}
   - Expertise/Skills: ${[...c.offerTags, ...c.linkedinSkills].join(', ') || 'Not specified'}
   - Industries: ${c.industryTags.join(', ') || 'Not specified'}
   - Interests/Hobbies: ${[...c.hobbyTags, ...c.hobbies].join(', ') || 'Not specified'}
   - Looking for: ${c.wantTags.join(', ') || 'Not specified'}
   - Can offer: ${c.offerTags.join(', ') || 'Not specified'}
   - Connection Types: ${c.connectionTypes?.join(', ') || 'Not specified'}
`).join('\n')}

Evaluate each candidate following the decision tree rules. Return JSON with matches (sorted by score descending) and excluded candidates.`

  try {
    console.log("ai_matching_started", {
      viewerId: viewerProfile.id,
      candidateCount: candidates.length,
      connectionType,
      viewerSeniority
    })

    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature: 0.2, // Lower temperature for more consistent scoring
      max_tokens: 2000, // Adjust based on candidate count
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    })

    const result = JSON.parse(response.choices[0].message.content)
    
    // Create a map of candidate IDs to AI results
    const aiResultsMap = new Map<string, AIMatchResult>()
    
    // Process matches
    if (result.matches && Array.isArray(result.matches)) {
      result.matches.forEach((match: AIMatchResult) => {
        aiResultsMap.set(match.candidateId, match)
      })
    }
    
    // Process excluded (mark them with score 0)
    if (result.excluded && Array.isArray(result.excluded)) {
      result.excluded.forEach((excluded: { candidateId: string; exclusionReason: string }) => {
        aiResultsMap.set(excluded.candidateId, {
          candidateId: excluded.candidateId,
          score: 0,
          explanation: `Excluded: ${excluded.exclusionReason}`,
          excluded: true,
          exclusionReason: excluded.exclusionReason
        })
      })
    }
    
    const excludedCount = result.excluded?.length || 0
    const matchedCount = result.matches?.length || 0
    
    console.log("ai_matching_completed", {
      viewerId: viewerProfile.id,
      matchedCount,
      excludedCount,
      totalEvaluated: candidates.length
    })
    
    // Convert to ScoredCandidate format
    const scored: ScoredCandidate[] = candidates.map(candidate => {
      const aiResult = aiResultsMap.get(candidate.id)
      
      if (!aiResult) {
        // Fallback: candidate wasn't in AI response, give neutral score
        console.warn("ai_matching_missing_candidate", {
          candidateId: candidate.id,
          viewerId: viewerProfile.id
        })
        return {
          candidate,
          breakdown: {
            wantFit: 0.5,
            mutualValue: 0.5,
            relationshipFit: 0.5,
            totalScore: 0.5,
            wantFitComponents: {
              semantic: 0.5,
              tagOverlap: 0.5,
              roleBonus: 0,
              wantFit: 0.5
            }
          }
        }
      }
      
      // Use AI score and explanation
      return {
        candidate,
        breakdown: {
          wantFit: aiResult.score,
          mutualValue: aiResult.excluded ? 0 : aiResult.score * 0.8, // Estimate
          relationshipFit: aiResult.excluded ? 0 : aiResult.score * 0.7, // Estimate
          totalScore: aiResult.excluded ? 0 : aiResult.score,
          wantFitComponents: {
            semantic: aiResult.score,
            tagOverlap: aiResult.score * 0.8,
            roleBonus: 0,
            wantFit: aiResult.score,
            aiExplanation: aiResult.explanation, // Store explanation for later use
            excluded: aiResult.excluded,
            exclusionReason: aiResult.exclusionReason
          }
        }
      }
    })
    
    // Filter out excluded candidates or keep them with score 0 (they'll rank at the bottom)
    return scored.sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore)
    
  } catch (error) {
    console.error("ai_matching_error", {
      viewerId: viewerProfile.id,
      error: error?.message ?? String(error),
      stack: error?.stack
    })
    // Fallback to original scoring - but we need to return something
    // This should not happen as we'll handle fallback in processUser
    throw error
  }
}

// -----------------------------------------------------------------------------
// Upsert Matches
// -----------------------------------------------------------------------------

async function upsertMatches(
  supabase: any,
  eventId: string,
  viewerId: string,
  matches: ScoredCandidate[],
  want: ViewerWant,
  viewerProfile: ViewerProfile,
  usingAI: boolean = false
): Promise<number> {
  // Delete existing matches for this viewer only
  await supabase
    .from("connections")
    .delete()
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${viewerId},b_id.eq.${viewerId}`)

  if (matches.length === 0) {
    return 0
  }

  // Generate explanations for all matches (sequential to avoid rate limits)
  // Use AI explanation if available, otherwise generate one
  const explanations = []
  for (const match of matches) {
    // Check if AI explanation exists
    const aiExplanation = match.breakdown.wantFitComponents.aiExplanation
    if (aiExplanation) {
      explanations.push(aiExplanation)
      console.log("using_ai_explanation", {
        eventId,
        viewerId,
        candidateId: match.candidate.id
      })
    } else {
      // Fallback to existing explanation generation
      const explanation = await buildReasonSummary(want, match, viewerProfile)
      explanations.push(explanation)
    }
  }

  // Insert new matches
  const rows = matches.map((match, index) => {
    const pair = viewerId < match.candidate.id
      ? { a: viewerId, b: match.candidate.id }
      : { a: match.candidate.id, b: viewerId }

    return {
      event_id: eventId,
      a_id: pair.a,
      b_id: pair.b,
      connection_kind: "system_match",
      created_by_user_id: viewerId,
      match_score: match.breakdown.totalScore,
      match_score_breakdown_json: {
        wantFit: match.breakdown.wantFit,
        mutualValue: match.breakdown.mutualValue,
        relationshipFit: match.breakdown.relationshipFit,
        totalScore: match.breakdown.totalScore,
        wantFitComponents: match.breakdown.wantFitComponents,
        want: want,
        // Buyer-Persona Intelligence Layer data
        role_canonicalization: {
          viewer: match.breakdown.wantFitComponents.viewerRole,
          candidate: match.breakdown.wantFitComponents.candidateRole
        },
        buyer_persona: match.breakdown.wantFitComponents.viewerPersona,
        persona_boost: match.breakdown.wantFitComponents.personaBoost,
        persona_bases: match.breakdown.wantFitComponents.personaBases,
        selection_rule_version: "business_pool_persona_v1"
      },
      match_explanation_text: explanations[index],
      match_algorithm_version: usingAI ? "v4_ai_decision_tree" : "v3_persona_intelligence"
    }
  })

  const { error } = await supabase.from("connections").insert(rows)
  if (error) {
    console.error("upsert_matches_error", { eventId, viewerId, error: error.message })
    throw error
  }

  return rows.length
}

async function generateExplanationWithOpenAI(
  want: ViewerWant,
  match: ScoredCandidate,
  viewerProfile?: ViewerProfile
): Promise<string | null> {
  const openai = getOpenAIClient()
  if (!openai) {
    return null // Fallback to hardcoded
  }

  const candidate = match.candidate
  const candidateName = candidate.firstName || candidate.lastName 
    ? `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim() 
    : candidate.jobTitle || "This person"
  const candidateTitle = candidate.jobTitle || "professional"
  const candidateCompany = candidate.company || "their company"
  const candidateSummary = candidate.companySummary || "Not specified"
  
  const viewerName = viewerProfile?.firstName || viewerProfile?.lastName
    ? `${viewerProfile.firstName || ""} ${viewerProfile.lastName || ""}`.trim()
    : viewerProfile?.jobTitle || "You"
  const viewerTitle = viewerProfile?.jobTitle || "professional"
  const viewerCompany = viewerProfile?.company || "your company"

  const systemPrompt = `You are a networking assistant helping explain why two attendees at a business event should meet.

Generate a short, natural explanation (max 140 characters) that:
- Highlights why these two people should connect based on the viewer's goals
- Mentions specific overlaps (industries, needs/offers, roles, or shared interests)
- Is conversational and engaging, not robotic
- Avoids generic phrases like "high overlap" or "worth a quick introduction"
- Focuses on concrete value they can provide each other
- Uses "you" to refer to the viewer and the candidate's name/title when relevant

Be specific and concise. Keep it under 140 characters.`

  const wantKindLabels: Record<WantKind, string> = {
    find_clients: "clients",
    find_partners: "partners",
    find_talent: "talent",
    find_job: "a job",
    find_investors: "investors",
    find_users: "users",
    find_press: "press",
    learn_skill: "to learn",
    general: "connections"
  }

  const wantLabel = wantKindLabels[want.kind] || want.kind

  const userPrompt = `Viewer (You):
- Name: ${viewerName}
- Role: ${viewerTitle}
- Company: ${viewerCompany}
- Looking for: ${wantLabel}${want.topic ? ` in ${want.topic}` : ""}
- Goals/Tags: ${want.tags.length > 0 ? want.tags.slice(0, 5).join(", ") : "Not specified"}
- Business need: ${viewerProfile?.businessNeed || "Not specified"}
- Industries: ${(viewerProfile?.industryTags || []).length > 0 ? viewerProfile.industryTags.slice(0, 3).join(", ") : "Not specified"}
- Can offer: ${(viewerProfile?.offerTags || []).length > 0 ? viewerProfile.offerTags.slice(0, 3).join(", ") : "Not specified"}

Candidate (Recommended Match):
- Name: ${candidateName}
- Role: ${candidateTitle}
- Company: ${candidateCompany}
- Company Summary: ${candidateSummary}
- Industries: ${(candidate.industryTags || []).length > 0 ? candidate.industryTags.slice(0, 3).join(", ") : "Not specified"}
- Can offer: ${(candidate.offerTags || []).length > 0 ? candidate.offerTags.slice(0, 3).join(", ") : "Not specified"}
- Looking for: ${(candidate.wantTags || []).length > 0 ? candidate.wantTags.slice(0, 3).join(", ") : "Not specified"}

Generate a short explanation (max 140 characters) of why the viewer should meet this candidate.`

  try {
    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 50, // Rough estimate: ~2.5 tokens per character for 140 characters
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })

    const explanation = response.choices[0]?.message?.content?.trim()
    if (!explanation) return null

    // Ensure it's not too long (max 140 characters)
    if (explanation.length > 140) {
      // Truncate to 140 characters, trying to end at a word boundary
      let truncated = explanation.substring(0, 137)
      const lastSpace = truncated.lastIndexOf(' ')
      if (lastSpace > 100) {
        truncated = truncated.substring(0, lastSpace)
      }
      return truncated + "..."
    }

    return explanation
  } catch (error) {
    console.warn("OpenAI API error:", error)
    return null // Fallback to hardcoded
  }
}

async function buildReasonSummary(want: ViewerWant, match: ScoredCandidate, viewerProfile?: ViewerProfile): Promise<string> {
  // Try OpenAI first
  const aiExplanation = await generateExplanationWithOpenAI(want, match, viewerProfile)
  if (aiExplanation) {
    return aiExplanation
  }

  // Fallback to hardcoded logic
  console.warn("OpenAI explanation failed, using hardcoded fallback")
  
  const candidate = match.candidate
  const name = candidate.firstName || candidate.jobTitle || "They"
  const title = candidate.jobTitle || "professional"
  const company = candidate.company || "their company"

  const wantKindLabels: Record<WantKind, string> = {
    find_clients: "clients",
    find_partners: "partners",
    find_talent: "talent",
    find_job: "a job",
    find_investors: "investors",
    find_users: "users",
    find_press: "press",
    learn_skill: "to learn",
    general: "connections"
  }

  const wantLabel = wantKindLabels[want.kind] || want.kind
  const topicPhrase = want.topic ? ` in ${want.topic}` : ""

  if (want.kind === "learn_skill") {
    return `${name} (${title} at ${company}) can help you learn${topicPhrase ? ` ${want.topic}` : ""} with their experience.`
  }

  if (want.kind === "find_clients") {
    return `You want ${wantLabel}; ${name} (${title} at ${company}) could be a potential customer${topicPhrase}.`
  }

  if (want.kind === "find_partners") {
    return `You want ${wantLabel}; ${name} (${title} at ${company}) could be a good collaborator${topicPhrase}.`
  }

  return `You want ${wantLabel}; ${name} (${title} at ${company}) matches your needs${topicPhrase}.`
}
