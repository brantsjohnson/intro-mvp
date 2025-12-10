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

// Pre-computed keyword Sets for O(1) lookups instead of O(n) string.includes()
const EXEC_KEYWORDS = new Set([
  "founder", "co-founder", "ceo", "cto", "cpo", "chief", "vp", "head", "director"
])

const PARTNERSHIP_KEYWORDS = new Set([
  "partnership", "alliances", "biz dev", "business development", "ecosystem"
])

const BUYER_FACING_KEYWORDS = new Set([
  "sales", "account executive", "ae", "customer success", "cs", "growth"
])

const RECRUITER_KEYWORDS = new Set([
  "recruiter", "talent", "people ops", "hr"
])

const INVESTOR_KEYWORDS = new Set([
  "investor", "vc", "angel", "fund"
])

const SENIORITY_KEYWORDS = new Set([
  "principal", "lead", "senior"
])

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

/**
 * Tokenize a job title into a Set of tokens for fast keyword matching
 * Complexity: O(n) where n is title length, but done once per candidate
 */
function tokenizeTitle(title: string | null): Set<string> {
  if (!title) return new Set()
  const tokens = title.toLowerCase().split(/[\s\-_]+/).filter(t => t.length > 2)
  return new Set(tokens)
}

/**
 * Check if text contains any keywords from the keyword set
 * Uses tokenized title for faster matching
 * Complexity: O(k) where k is number of keywords (small, constant)
 */
function hasKeywords(text: string | null, keywordSet: Set<string>): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()
  // Check if any keyword appears in the text
  return Array.from(keywordSet).some(keyword => lowerText.includes(keyword))
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
  // Quinary: Prefer same-function/domain alignment when available
  const aSameFunction =
    a.breakdown.wantFitComponents.viewerRole?.role_function &&
    a.breakdown.wantFitComponents.candidateRole?.role_function &&
    a.breakdown.wantFitComponents.viewerRole.role_function === a.breakdown.wantFitComponents.candidateRole.role_function
  const bSameFunction =
    b.breakdown.wantFitComponents.viewerRole?.role_function &&
    b.breakdown.wantFitComponents.candidateRole?.role_function &&
    b.breakdown.wantFitComponents.viewerRole.role_function === b.breakdown.wantFitComponents.candidateRole.role_function
  if (aSameFunction !== bSameFunction) {
    return bSameFunction ? 1 : -1
  }
  // Finally: Stable ID ascending
  return a.candidate.id.localeCompare(b.candidate.id)
}

/**
 * Optimized top-K selection using min-heap approach
 * Complexity: O(n log k) where k is typically 3-25, much better than O(n log n) full sort
 */
function quickSelectTopN<T>(
  arr: T[],
  n: number,
  compare: (a: T, b: T) => number
): T[] {
  if (arr.length <= n) {
    // If array is smaller than n, just sort and return
    return [...arr].sort(compare)
  }
  
  // Use a min-heap of size k to track top N elements
  // The heap maintains the smallest element at the top
  const heap: T[] = []
  
  for (const item of arr) {
    if (heap.length < n) {
      // Heap not full, add item and bubble up
      heap.push(item)
      let i = heap.length - 1
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2)
        // Min-heap: parent should be smaller (or equal) than child
        // compare(parent, child) < 0 means parent is "smaller" in our ordering
        if (compare(heap[parent], heap[i]) < 0) {
          [heap[parent], heap[i]] = [heap[i], heap[parent]]
          i = parent
        } else {
          break
        }
      }
    } else if (compare(item, heap[0]) > 0) {
      // New item is better than the worst in heap, replace it
      heap[0] = item
      // Bubble down to maintain heap property
      let i = 0
      while (true) {
        const left = 2 * i + 1
        const right = 2 * i + 2
        let smallest = i
        
        if (left < heap.length && compare(heap[left], heap[smallest]) < 0) {
          smallest = left
        }
        if (right < heap.length && compare(heap[right], heap[smallest]) < 0) {
          smallest = right
        }
        
        if (smallest === i) break
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]]
        i = smallest
      }
    }
  }
  
  // Sort the heap to get final order (O(k log k) where k is small)
  return heap.sort(compare).reverse()
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
  const useAI = payload?.use_ai !== false // Default to true for backward compatibility, but can be set to false

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
    const result = await processUser(eventId, userId, forceRecompute, useAI)
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

// Pull the entire attendance row plus the full users row so downstream logic
// has access to all onboarding answers without having to enumerate columns.
const PROFILE_SELECT = `
  *,
  users:user_id (*)
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
    // Vector fields intentionally omitted to avoid pulling embeddings
    offerEmbedding: null,
    needEmbedding: null,
    profileEmbedding: null,
    eventNeedEmbedding: null,
    eventOfferEmbedding: null,
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
    personalityEmbedding: null,
    connectionTypes: attendance.connection_types_selected ?? null,
    followUps: (attendance.connection_followups_json as Record<string, string>) ?? null,
    linkedinSkills: user.linkedin_skills || [],
    // Preserve raw rows so any new onboarding fields remain accessible
    rawUser: user,
    rawAttendance: attendance
  }
}

// -----------------------------------------------------------------------------
// Want Detection
// -----------------------------------------------------------------------------

function detectWant(profile: ViewerProfile): ViewerWant {
  // Convert to Set once for O(1) lookups instead of O(n) array.includes()
  const checkboxTokenSet = new Set((profile.connectionTypes ?? []).map(canon))

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
    checkboxTokenSet.has("clients") ||
    checkboxTokenSet.has("commercial") ||
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
    checkboxTokenSet.has("partnerships") ||
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
    checkboxTokenSet.has("hiring") ||
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
    checkboxTokenSet.has("job_seeking") ||
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
    checkboxTokenSet.has("investment") ||
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
    checkboxTokenSet.has("beta_users") ||
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
    checkboxTokenSet.has("press") ||
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
    checkboxTokenSet.has("mentorship") ||
    checkboxTokenSet.has("technical_mentor") ||
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

async function processUser(eventId: string, userId: string, forceRecompute: boolean, useAI: boolean = true) {
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
    .select("a_id,b_id,match_score,created_at,match_algorithm_version,match_explanation_text")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(SUGGESTIONS_PER_USER)

  const existingCount = existingMatches?.length ?? 0
  
  // Check if we have existing AI-generated matches that we can reuse
  if (!forceRecompute && useAI && existingCount >= SUGGESTIONS_PER_USER) {
    const hasAIMatches = existingMatches?.some(m => 
      m.match_algorithm_version === "v4_ai_decision_tree" && 
      m.match_explanation_text
    )
    
    if (hasAIMatches) {
      console.log("reusing_existing_ai_matches", { 
        eventId, 
        userId,
        matchCount: existingCount,
        reason: "existing_ai_matches_found"
      })
      return {
        processed: existingCount,
        inserted: 0,
        skipped: true,
        reason: "existing_ai_matches_found"
      }
    }
  }
  
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
        // Vector fields intentionally omitted to avoid pulling embeddings
        offerEmbedding: null,
        needEmbedding: null,
        profileEmbedding: null,
        eventNeedEmbedding: null,
        eventOfferEmbedding: null,
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
        personalityEmbedding: null,
        connectionTypes: row.connection_types_selected ?? null,
        followUps: (row.connection_followups_json as Record<string, string>) ?? null,
        linkedinSkills: user.linkedin_skills || [],
        offerSummary: user.offer_summary_text ?? null,
        wantSummary: user.want_summary_text ?? null,
        rawUser: user,
        rawAttendance: row
      }
    })

  console.log("candidate_pool_built", {
    eventId,
    userId,
    poolSize: candidates.length
  })

  // Score all candidates using rule-based scoring (for pre-filtering)
  const initialScored = scoreCandidates(viewerProfile, want, candidates)
  
  // Pre-filter to top candidates for AI evaluation (bias toward engineers for mentorship seekers)
  const isMentorshipIntent = want.kind === "learn_skill"
  const viewerIsEngineer = isEngineeringRole(viewerProfile)
  const engineeringCandidatesCount = candidates.filter((c) => isEngineeringRole(c)).length
  const PRE_FILTER_LIMIT = viewerIsEngineer && isMentorshipIntent ? 50 : 25

  const scoredForPrefilter =
    viewerIsEngineer && isMentorshipIntent
      ? initialScored.map((s) => {
          const engineer = isEngineeringRole(s.candidate)
          const bonus = engineer ? 0.1 : 0
          return {
            ...s,
            breakdown: {
              ...s.breakdown,
              totalScore: (s.breakdown.totalScore || 0) + bonus
            }
          }
        })
      : initialScored

  const preFilteredCandidates = preFilterCandidates(scoredForPrefilter, PRE_FILTER_LIMIT)
  const engineeringInPrefilter = preFilteredCandidates.filter((c) => isEngineeringRole(c.candidate)).length
  
  console.log("pre_filtering_complete", {
    eventId,
    userId,
    totalCandidates: candidates.length,
    preFilteredCount: preFilteredCandidates.length,
    preFilterLimit: PRE_FILTER_LIMIT,
    viewerIsEngineer,
    isMentorshipIntent,
    engineeringCandidatesCount,
    engineeringInPrefilter
  })

  // Try AI matching if available and enabled, otherwise use rule-based scoring
  const openai = getOpenAIClient()
  let scored: ScoredCandidate[]
  let usingAI = false
  
  if (openai && preFilteredCandidates.length > 0 && useAI) {
    try {
      // Extract candidate profiles from pre-filtered scored candidates
      const candidateProfiles = preFilteredCandidates.map(s => s.candidate)
      
      // Use AI to score the pre-filtered candidates
      const aiScored = await scoreCandidatesWithAI(
        viewerProfile,
        want,
        candidateProfiles,
        openai,
        PRE_FILTER_LIMIT
      )
      // Use AI results only (authoritative). Sort for determinism.
      const aiScoredSorted = aiScored.sort(deterministicCompare)
      scored = aiScoredSorted
      usingAI = true
      
      console.log("ai_matching_used", {
        eventId,
        userId,
        aiScoredCount: aiScored.length,
        remainingCount: 0,
        aiAuthoritative: true
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
      console.log("ai_matching_fallback_rule_based", {
        eventId,
        userId,
        reason: error?.message ?? String(error)
      })
    }
  } else {
    // No OpenAI available or no candidates to evaluate
    scored = initialScored
    usingAI = false
    
    if (!useAI) {
      console.log("ai_matching_skipped_use_ai_false", { 
        eventId, 
        userId,
        reason: "use_ai flag is set to false - using rule-based scoring only"
      })
    } else if (!openai) {
      console.warn("ai_matching_skipped_no_openai", { 
        eventId, 
        userId,
        reason: "OPENAI_API_KEY environment variable is not set in Supabase Edge Function",
        fix: "Set the OPENAI_API_KEY secret using: supabase secrets set OPENAI_API_KEY"
      })
    } else if (preFilteredCandidates.length === 0) {
      console.log("ai_matching_skipped_no_candidates", { 
        eventId, 
        userId,
        reason: "No pre-filtered candidates available for AI evaluation"
      })
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

  // Generate reason summaries for return using unified explanation generation
  // Always use buildReasonSummary which calls generateExplanationWithOpenAI (140 char limit)
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
  // Convert to Set once for O(1) lookups instead of O(n) array.includes()
  const connectionTokenSet = new Set((candidate.connectionTypes ?? []).map(canon))
  // Tokenize title once for faster keyword matching
  const titleTokens = tokenizeTitle(candidate.jobTitle)

  // Helper flags - use Set-based keyword matching for O(1) lookups
  const isExec = hasKeywords(candidate.jobTitle, EXEC_KEYWORDS)
  const isPartnershipy = hasKeywords(candidate.jobTitle, PARTNERSHIP_KEYWORDS)
  const isBuyerFacing = hasKeywords(candidate.jobTitle, BUYER_FACING_KEYWORDS)

  const wantsPartners = connectionTokenSet.has("partnerships")
  const wantsClients = connectionTokenSet.has("clients") || connectionTokenSet.has("commercial")
  const wantsInvestment = connectionTokenSet.has("investment")
  const wantsMentorship = connectionTokenSet.has("mentorship")

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
    if (hasKeywords(candidate.jobTitle, RECRUITER_KEYWORDS)) {
      roleBonus = 0.18
    }
  } else if (viewerWant.kind === "find_investors") {
    if (hasKeywords(candidate.jobTitle, INVESTOR_KEYWORDS) || wantsInvestment) {
      roleBonus = 0.25
    }
  } else if (viewerWant.kind === "learn_skill") {
    // Senior / experienced people make better mentors
    if (isExec || hasKeywords(candidate.jobTitle, SENIORITY_KEYWORDS) || wantsMentorship) {
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
    const candidateRole = canonicalizeRole(candidate.jobTitle)
    const roleKnown = viewerRole.role_function !== "unknown" && candidateRole.role_function !== "unknown"
    const sameFunction = roleKnown && viewerRole.role_function === candidateRole.role_function
    const functionMismatch = roleKnown && viewerRole.role_function !== candidateRole.role_function
    const explicitNeedTargetsCandidate = roleKnown
      ? [
          ...(viewerProfile.needTags || []),
          ...(want.tags || []),
          viewerProfile.businessNeed || ""
        ]
          .filter(Boolean)
          .map((t) => (typeof t === "string" ? t.toLowerCase() : ""))
          .some((text) => text.includes(candidateRole.role_function))
      : false

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

    // Prioritize same-function/domain matches by default; allow cross-function when explicitly requested.
    if (roleKnown) {
      if (sameFunction) {
        totalScore += 0.1
      } else if (!explicitNeedTargetsCandidate) {
        totalScore -= 0.05
      }
      totalScore = Math.max(0, Math.min(1, totalScore))
    }

    // ============================================================
    // Buyer-Persona Intelligence Layer - Business Pillar Boosts
    // ============================================================
    // These boosts are clamped within +0.08 cap
    let personaBoost = 0
    const personaBases: string[] = []

    const candidateCompanyLower = normalizeCompanyInput(candidate.company ?? "").toLowerCase()
    const candidateIndustryTags = candidate.industryTags ?? []
    // Convert to Set once for O(1) lookups instead of O(n) array.includes()
    const candidateConnectionTypeSet = new Set((candidate.connectionTypes ?? []).map(canon))
    // Convert buyer_functions to Set for O(1) lookups
    const buyerFunctionsSet = new Set(viewerPersona.buyer_functions)

    // Seller (commercial:clients) - match buyer functions and leadership
    if (want.kind === "find_clients" && viewerPersona.leader_required) {
      // Candidate function matches buyer functions
      if (buyerFunctionsSet.has(candidateRole.role_function)) {
        personaBoost += 0.03
        personaBases.push("buyer_function_match")
      }
      
      // Leadership title when leader_required
      if (isLeadershipTitle(candidateRole.role_seniority)) {
        personaBoost += 0.02
        personaBases.push("leadership_match")
      }
      
      // Sector match (viewer sector tokens ↔ candidate tags/company)
      // Optimized: Use Set intersections instead of nested loops
      if (viewerPersona.sector !== "unknown" && candidateIndustryTags.length > 0) {
        const sectorTokens = viewerPersona.sector.split("_")
        const sectorTokenSet = new Set(sectorTokens)
        const candidateTagSet = new Set(
          candidateIndustryTags.map(tag => tag.toLowerCase())
        )
        // Tokenize company name for Set-based matching
        const companyTokens = new Set(
          candidateCompanyLower.split(/[\s\-_]+/).filter(t => t.length > 2)
        )
        
        // Check for matches using Set operations: O(n) instead of O(n²)
        const sectorMatch = Array.from(sectorTokenSet).some(token =>
          candidateTagSet.has(token) ||
          Array.from(candidateTagSet).some(tag => tag.includes(token)) ||
          companyTokens.has(token) ||
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
        hasKeywords(candidate.jobTitle, PARTNERSHIP_KEYWORDS) ||
        Array.from(candidateConnectionTypeSet).some(t => t.includes("partnership"))
      
      const wantsPartners = Array.from(candidateConnectionTypeSet).some(t => 
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
        hasKeywords(candidate.jobTitle, RECRUITER_KEYWORDS)
      const candidateIsHiring = candidateIsRecruiter || 
        candidateConnectionTypeSet.has("recruit") ||
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
      if (candidateConnectionTypeSet.has("find_job") || candidateConnectionTypeSet.has("job_seeking")) {
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
  
  // Convert to Set for O(1) lookups
  const typeSet = new Set(connectionTypes.map(t => t.toLowerCase()))
  
  // Use Set-based checks instead of array.some() with includes()
  const hasMentor = Array.from(typeSet).some(t => t.includes("mentor") || t.includes("mentorship"))
  const hasRecruit = Array.from(typeSet).some(t => t.includes("recruit") || t.includes("hiring") || t.includes("job"))
  const hasBusiness = Array.from(typeSet).some(t => t.includes("client") || t.includes("partner") || t.includes("business"))
  
  if (hasMentor) {
    return "Mentorship"
  }
  if (hasRecruit) {
    return "Recruiting/Job Seeking"
  }
  if (hasBusiness) {
    return "Business Opportunities"
  }
  
  return "General Networking"
}

// Additional keyword sets for seniority determination
const VERY_SENIOR_KEYWORDS = new Set([
  "ceo", "founder", "co-founder", "president", "chief", "vp ", "vice president"
])

const SENIOR_KEYWORDS = new Set([
  "director", "head of", "senior"
])

const JUNIOR_KEYWORDS = new Set([
  "intern", "student", "junior", "associate"
])

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
  
  // Very Senior - use keyword Set for faster matching
  if (hasKeywords(jobTitle, VERY_SENIOR_KEYWORDS)) {
    return "Very Senior"
  }
  
  // Senior
  if (hasKeywords(jobTitle, SENIOR_KEYWORDS) || (careerYears && careerYears >= 8)) {
    return "Senior"
  }
  
  // Junior
  if (hasKeywords(jobTitle, JUNIOR_KEYWORDS) || (careerYears && careerYears < 2)) {
    return "Junior"
  }
  
  // Mid-level
  return "Mid"
}

// Identify engineering/software roles from title or skill tags
function isEngineeringRole(profile: {
  jobTitle?: string | null
  offerTags?: string[]
  linkedinSkills?: string[]
  industryTags?: string[]
}): boolean {
  const text = [
    profile.jobTitle || "",
    ...(profile.offerTags || []),
    ...(profile.linkedinSkills || []),
    ...(profile.industryTags || [])
  ]
    .join(" ")
    .toLowerCase()

  return /\b(software|engineer|engineering|developer|devops|sre|backend|front[- ]?end|frontend|full[- ]?stack|fullstack|mobile|ios|android|qa|testing|platform|systems)\b/.test(
    text
  )
}

function preFilterCandidates(
  scored: ScoredCandidate[],
  limit: number
): ScoredCandidate[] {
  // Use optimized top-K selection instead of full sort
  // O(n log k) instead of O(n log n) where k is typically 25
  return quickSelectTopN(
    scored,
    limit,
    (a, b) => b.breakdown.totalScore - a.breakdown.totalScore
  )
}

/**
 * Extract the function/role that User A is looking for when hiring
 * Returns a human-readable description of what they need
 */
function extractHiringFunction(
  businessNeed: string | null,
  needTags: string[]
): string | null {
  if (!businessNeed && (!needTags || needTags.length === 0)) {
    return null
  }
  
  const combinedText = [
    businessNeed || "",
    ...(needTags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  
  // Function detection patterns (ordered by specificity)
  const functionPatterns: Array<{ pattern: RegExp; label: string }> = [
    // Engineering/Software Development
    { pattern: /\b(engineer|engineering|developer|dev|software engineer|software developer|programmer|coder|full.?stack|backend|frontend|fullstack|devops|sre|architect)\b/i, label: "engineering/software development" },
    // Data Science
    { pattern: /\b(data scientist|data science|ml engineer|machine learning|ai engineer|data engineer)\b/i, label: "data science/machine learning" },
    // Marketing
    { pattern: /\b(marketer|marketing|growth|demand gen|content|seo|sem|brand|social media)\b/i, label: "marketing" },
    // Sales
    { pattern: /\b(sales|account executive|ae|sdr|bdr|business development|bd|revenue)\b/i, label: "sales" },
    // Product
    { pattern: /\b(product manager|pm|product|product owner)\b/i, label: "product management" },
    // Design
    { pattern: /\b(designer|design|ux|ui|creative)\b/i, label: "design" },
    // Data Analytics
    { pattern: /\b(data analyst|analyst|analytics|bi|business intelligence)\b/i, label: "data analytics" },
    // Customer Success
    { pattern: /\b(customer success|csm|cs)\b/i, label: "customer success" },
    // Operations
    { pattern: /\b(operations|ops|operations manager)\b/i, label: "operations" },
  ]
  
  // Check for explicit function mentions
  for (const { pattern, label } of functionPatterns) {
    if (pattern.test(combinedText)) {
      return label
    }
  }
  
  return null
}

/**
 * Merge two sorted arrays of candidates
 * Complexity: O(n + m) instead of O((n+m) log(n+m)) for concatenation + sort
 */
function mergeSortedCandidates(
  aiScored: ScoredCandidate[],
  remainingScored: ScoredCandidate[]
): ScoredCandidate[] {
  // Both arrays should already be sorted by deterministicCompare
  const result: ScoredCandidate[] = []
  let i = 0
  let j = 0
  
  while (i < aiScored.length && j < remainingScored.length) {
    // Compare using deterministicCompare (returns < 0 if a < b)
    if (deterministicCompare(aiScored[i], remainingScored[j]) < 0) {
      result.push(aiScored[i++])
    } else {
      result.push(remainingScored[j++])
    }
  }
  
  // Add remaining elements
  while (i < aiScored.length) result.push(aiScored[i++])
  while (j < remainingScored.length) result.push(remainingScored[j++])
  
  return result
}

// -----------------------------------------------------------------------------
// Selection
// -----------------------------------------------------------------------------

function selectTopN(
  scored: ScoredCandidate[],
  n: number,
  _want?: ViewerWant
): ScoredCandidate[] {
  // Use optimized top-K selection instead of full sort
  // O(n log k) instead of O(n log n) where k is typically 3
  return quickSelectTopN(scored, n, deterministicCompare)
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
  openai: OpenAI,
  preFilterLimit: number
): Promise<ScoredCandidate[]> {
  
  // Filter out candidates from the same company
  const normalizeCompany = (company: string | null): string => {
    if (!company) return ""
    return company.toLowerCase().trim().replace(/[^a-z0-9]+/g, "")
  }
  
  const viewerCompanyNormalized = normalizeCompany(viewerProfile.company)
  const filteredCandidates = candidates.filter(candidate => {
    const candidateCompanyNormalized = normalizeCompany(candidate.company)
    // Exclude if companies match (case-insensitive, ignoring special characters)
    return candidateCompanyNormalized === "" || candidateCompanyNormalized !== viewerCompanyNormalized
  })
  // Cap candidates sent to AI to reduce prompt size and cost
  const aiCandidates = filteredCandidates.slice(0, 25)
  
  const excludedSameCompanyCount = candidates.length - filteredCandidates.length
  if (excludedSameCompanyCount > 0) {
    console.log("excluded_same_company_candidates", {
      viewerId: viewerProfile.id,
      viewerCompany: viewerProfile.company,
      excludedCount: excludedSameCompanyCount
    })
  }
  
  // If all candidates were filtered out, return empty array
  if (filteredCandidates.length === 0) {
    return []
  }
  
  // Determine primary goal from businessNeed or connectionTypes
  const primaryGoal = viewerProfile.businessNeed || 
    (viewerProfile.connectionTypes && viewerProfile.connectionTypes.length > 0 
      ? viewerProfile.connectionTypes[0] 
      : "General Networking")
  
  // Determine connection type category
  const connectionType = categorizeConnectionType(viewerProfile.connectionTypes, viewerProfile.businessNeed)
  
  // Determine seniority level for guardrails
  const viewerSeniority = determineSeniorityLevel(viewerProfile.jobTitle, viewerProfile.careerYears)
  
  // Extract hiring function if user is hiring
  const hiringFunction = want.kind === "find_talent" 
    ? extractHiringFunction(viewerProfile.businessNeed, viewerProfile.needTags)
    : null
  
  // Build comprehensive prompt with decision tree logic
  const systemPrompt = `You are the Intro Matchmaker AI, an expert system designed to create the most relevant and satisfying professional connections at events. Your primary goal is to find the best possible match (User B) for User A's explicit goal, ensuring practical value by prioritizing contextual fit (Company Specialization + Expertise) over superficial titles. Avoiding mismatches is as important as finding good matches.

CRITICAL: Always use gender-neutral language in all explanations and descriptions. Never assume someone's gender based on their name, title, or any other information. Use "they/them/their" pronouns, or refer to people by their name, title, or role. Never use "he/him/his" or "she/her" unless explicitly specified (which it never will be in this context).

MATCHING RULES (PRIORITY ORDER)
1) Want/Need Alignment (hard filter)
- User A want comes from businessNeed + needTags + wantTags.
- Only match if you can cite at least one explicit overlap between User A’s want and User B’s offerTags/linkedinSkills/industryTags/companySummary/connectionTypes.
- If no overlap evidence, exclude or score very low.

2) Function/Domain Fit
- Prefer same-function/domain matches by default. Only choose adjacent functions when businessNeed/needTags/wantTags explicitly call for that function; for mentorship/learn_skill, strongly prefer same-function and justify any exception.
- Do NOT rely on title alone—confirm with skills/company specialization.

3) General Networking (fallback when no explicit need)
- Use shared industry/skills/interests as secondary signals; keep seniority roughly aligned unless mentorship.

GUARDRAILS
- Input candidate list is unordered; independently score each and return the best 3 (if available).
- Same-function default: if no explicit cross-function need is stated, pick same-function/domain first; justify any cross-function choice with the explicit need that triggered it.
- Same-company: exclude always.
- No title hallucination: don’t assume capabilities not in skills/tags/company summary.
- Seniority: avoid pairing very junior with very senior unless mentorship is explicit.
- If you pick a non-obvious adjacent role, justify with the specific overlap.

OUTPUT
- JSON { matches: [{ candidateId, score 0-1, explanation, excluded:false }], excluded:[{ candidateId, exclusionReason }] }
- Explanation: 1–3 sentences, must cite the concrete overlap (e.g., “You need backend mentorship; B lists Go/Node backend and leads platform at X”). Avoid generic phrases.
- Scoring: 0.9–1.0 strong overlap; 0.7–0.89 good; 0.5–0.69 partial; <0.5 weak/exclude.`

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
${want.kind === "find_talent" && hiringFunction ? `- ⚠️ HIRING INTENT: User A is HIRING and looking for: ${hiringFunction}. STRICTLY match candidates in this function only.` : want.kind === "find_talent" ? `- ⚠️ HIRING INTENT: User A is HIRING. Match candidates based on their explicit business need and function requirements.` : ''}
- Why Attending: ${viewerProfile.whyAttending || 'Not specified'}
- Expertise/Skills: ${[...viewerProfile.offerTags, ...viewerProfile.linkedinSkills].join(', ') || 'Not specified'}
- Industries: ${viewerProfile.industryTags.join(', ') || 'Not specified'}
- Interests/Hobbies: ${[...viewerProfile.hobbyTags, ...viewerProfile.hobbies].join(', ') || 'Not specified'}
- Looking for: ${viewerProfile.needTags.join(', ') || 'Not specified'}
- Can offer: ${viewerProfile.offerTags.join(', ') || 'Not specified'}

CANDIDATES TO EVALUATE (unordered, up to ${aiCandidates.length}):
${aiCandidates.map((c) => `
- Candidate ID: ${c.id}
  Name: ${c.firstName || ''} ${c.lastName || ''}
  Job Title: ${c.jobTitle || 'Not specified'}
  Company: ${c.company || 'Not specified'}
  Company Specialization: ${c.companySummary || 'Not specified'}
  Years of Experience: ${c.careerYears || 'Unknown'}
  Expertise/Skills: ${[...c.offerTags, ...c.linkedinSkills].join(', ') || 'Not specified'}
  Industries: ${c.industryTags.join(', ') || 'Not specified'}
  Interests/Hobbies: ${[...c.hobbyTags, ...c.hobbies].join(', ') || 'Not specified'}
  Looking for: ${c.wantTags.join(', ') || 'Not specified'}
  Can offer: ${c.offerTags.join(', ') || 'Not specified'}
  Connection Types: ${c.connectionTypes?.join(', ') || 'Not specified'}
`).join('\n')}

Evaluate each candidate following the decision tree rules. Return JSON with matches (sorted by score descending) and excluded candidates.`

  try {
    console.log("ai_matching_started", {
      viewerId: viewerProfile.id,
      candidateCount: aiCandidates.length,
      originalCandidateCount: candidates.length,
      excludedSameCompany: excludedSameCompanyCount,
      connectionType,
      viewerSeniority
    })
    console.log("ai_matching_prompt_debug", {
      viewerId: viewerProfile.id,
      wantKind: want.kind,
      hiringFunction,
      preFilterLimit,
      candidatesSentToAI: aiCandidates.length,
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o"
    })

    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
      temperature: 0.2, // Lower temperature for more consistent scoring
      max_tokens: 2000, // Adjust based on candidate count
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    })

    const result = JSON.parse(response.choices[0].message.content)
    console.log("ai_matching_response_received", {
      viewerId: viewerProfile.id,
      candidatesSentToAI: aiCandidates.length,
      matchesReturned: result?.matches?.length ?? 0,
      excludedReturned: result?.excluded?.length ?? 0
    })
    
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
      totalEvaluated: filteredCandidates.length
    })
    
    // Convert to ScoredCandidate format
    // Process all original candidates: exclude same-company ones immediately, use AI results for filtered candidates
    const scored: ScoredCandidate[] = candidates.map(candidate => {
      const candidateCompanyNormalized = normalizeCompany(candidate.company)
      const isSameCompany = candidateCompanyNormalized !== "" && candidateCompanyNormalized === viewerCompanyNormalized
      
      // If same company, exclude immediately
      if (isSameCompany) {
        return {
          candidate,
          breakdown: {
            wantFit: 0,
            mutualValue: 0,
            relationshipFit: 0,
            totalScore: 0,
            wantFitComponents: {
              semantic: 0,
              tagOverlap: 0,
              roleBonus: 0,
              wantFit: 0,
              aiExplanation: `Excluded: Same company as viewer`,
              excluded: true,
              exclusionReason: "Same company exclusion"
            }
          }
        }
      }
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

  // Generate explanations for all matches using generateExplanationWithOpenAI
  // This ensures all matches use the same 140-character limited explanation generation
  // buildReasonSummary already calls generateExplanationWithOpenAI first, then falls back to hardcoded
  const explanations = []
  for (const match of matches) {
    const explanation = await buildReasonSummary(want, match, viewerProfile)
    explanations.push(explanation)
    console.log("using_unified_explanation_generation", {
      eventId,
      viewerId,
      candidateId: match.candidate.id
    })
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

Generate a short, natural explanation (max 160 characters) that:
- Highlights why these two people should connect based on the viewer's goals
- Mentions specific overlaps (industries, needs/offers, roles, or shared interests)
- Is conversational and engaging, not robotic
- Avoids generic phrases like "high overlap" or "worth a quick introduction"
- Focuses on concrete value they can provide each other
- Uses "you" to refer to the viewer and the candidate's name/title when relevant

CRITICAL: Always use gender-neutral language. Never assume someone's gender. Use "they/them/their" pronouns, or refer to people by their name, title, or role. Never use "he/him/his" or "she/her" pronouns.

Be specific and concise. Keep it under 160 characters.`

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

Generate a short explanation (max 160 characters) of why the viewer should meet this candidate.`

  try {
    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
      temperature: 0.7,
      max_tokens: 50, // Limited to 50 tokens for concise explanations (target: ~160 characters)
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })

    const explanation = response.choices[0]?.message?.content?.trim()
    if (!explanation) return null

    // Ensure it's not too long (max 160 characters)
    if (explanation.length > 160) {
      // Truncate to 160 characters, trying to end at a word boundary
      let truncated = explanation.substring(0, 157)
      const lastSpace = truncated.lastIndexOf(' ')
      if (lastSpace > 120) {
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

