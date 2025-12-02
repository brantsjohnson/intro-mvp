import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import OpenAI from "https://esm.sh/openai@4"
import { loadCandidateProfiles } from "./lib/profiles.ts"
import { CandidateProfile } from "./lib/types.ts"

// -----------------------------------------------------------------------------
// Constants & Configuration
// -----------------------------------------------------------------------------

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini"

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
}

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable")
}

// -----------------------------------------------------------------------------
// Supabase Client
// -----------------------------------------------------------------------------

function getSupabaseClient() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-client-info": "intro-matchmaker-ai-v1",
      },
    },
  })
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface MatchResult {
  match_user_id: string
  explanation: string
  match_reasons: string[]
}

interface ProcessResult {
  userId: string
  matchesCreated: number
  matchesUpdated: number
  error?: string
  diagnostic?: {
    candidateCount: number
    aiMatchesReturned: number
    validMatchesCount: number
    validationIssues?: string[]
  }
}

interface ResponseBody {
  ok: boolean
  event_id: string
  user_id: string
  matches_created: number
  matches_updated: number
  diagnostic?: ProcessResult["diagnostic"]
}

// -----------------------------------------------------------------------------
// HTTP Handler
// -----------------------------------------------------------------------------

serve(async (req: Request) => {
  console.log("matchmaker_invoked", {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  })

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      {
        status: 405,
        headers: CORS_HEADERS,
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
        headers: CORS_HEADERS,
      }
    )
  }

  const eventId = payload?.event_id
  const userId = payload?.user_id

  if (!eventId || !userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "event_id and user_id are required" }),
      {
        status: 400,
        headers: CORS_HEADERS,
      }
    )
  }

  const started = Date.now()
  try {
    const result = await processUserMatching(eventId, userId)
    const runtime = Date.now() - started

    return new Response(
      JSON.stringify({
        ...result,
        runtime_ms: runtime,
      }),
      {
        status: 200,
        headers: CORS_HEADERS,
      }
    )
  } catch (error: any) {
    console.error("matchmaker_error", {
      eventId,
      userId,
      error: error?.message ?? String(error),
      stack: error?.stack,
    })
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message ?? String(error),
      }),
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    )
  }
})

// -----------------------------------------------------------------------------
// Main Processing Function
// -----------------------------------------------------------------------------

async function processUserMatching(
  eventId: string,
  userId: string
): Promise<ResponseBody> {
  const supabase = getSupabaseClient()
  
  // Verify OpenAI API key is available
  if (!OPENAI_API_KEY || OPENAI_API_KEY.trim() === "") {
    console.error("OPENAI_API_KEY is missing or empty")
    throw new Error("OpenAI API key is not configured. Please set OPENAI_API_KEY in Supabase project settings.")
  }
  
  // Initialize OpenAI client - this will make actual API calls
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  console.log(`✅ OpenAI client initialized successfully`)
  console.log(`📊 Using model: ${OPENAI_MODEL}`)
  console.log(`🔑 API key present: ${OPENAI_API_KEY ? 'Yes' : 'No'} (length: ${OPENAI_API_KEY?.length || 0})`)
  console.log(`Processing matching for user ${userId} in event ${eventId}`)

  // Get all attendees for the event to find candidates
  const { data: allAttendees, error: attendeesError } = await supabase
    .from("attendance")
    .select("user_id")
    .eq("event_id", eventId)

  if (attendeesError) {
    throw new Error(`Failed to load attendees for event_id ${eventId}: ${attendeesError.message}`)
  }

  if (!allAttendees || allAttendees.length === 0) {
    throw new Error(`No attendees found for event_id ${eventId}`)
  }

  // Get candidate user IDs (all other users in the event)
  const candidateUserIds = allAttendees
    .map((a: { user_id: string }) => a.user_id)
    .filter((id: string) => id !== userId)

  if (candidateUserIds.length === 0) {
    return {
      ok: true,
      event_id: eventId,
      user_id: userId,
      matches_created: 0,
      matches_updated: 0,
      diagnostic: {
        candidateCount: 0,
        aiMatchesReturned: 0,
        validMatchesCount: 0,
      },
    }
  }

  // Process matches for this single user
  const result = await processUserMatches(
    supabase,
    openai,
    eventId,
    userId,
    candidateUserIds
  )

  return {
    ok: true,
    event_id: eventId,
    user_id: userId,
    matches_created: result.matchesCreated,
    matches_updated: result.matchesUpdated,
    diagnostic: result.diagnostic,
  }
}

// -----------------------------------------------------------------------------
// Process Matches for a Single User
// -----------------------------------------------------------------------------

async function processUserMatches(
  supabase: ReturnType<typeof getSupabaseClient>,
  openai: OpenAI,
  eventId: string,
  userId: string,
  candidateUserIds: string[]
): Promise<ProcessResult> {
  console.log(`Processing matches for user ${userId} in event ${eventId}`)
  
  // Load target user profile - use CandidateProfile to get offerSummary/wantSummary
  // This filters by event_id from the attendance table
  const viewerProfiles = await loadCandidateProfiles(supabase, eventId, [userId])
  if (!viewerProfiles || viewerProfiles.length === 0) {
    throw new Error(`Failed to load profile for user ${userId} in event ${eventId}. User may not be registered for this event.`)
  }
  const viewer = viewerProfiles[0]
  
  // Verify the viewer's event_id matches
  if (viewer.eventId !== eventId) {
    throw new Error(`User ${userId} profile loaded for wrong event. Expected ${eventId}, got ${viewer.eventId}`)
  }

  // Load all candidate profiles (filtered by event_id from attendance table)
  const candidateProfiles = await loadCandidateProfiles(
    supabase,
    eventId,
    candidateUserIds
  )

  console.log(`Loaded ${candidateProfiles.length} candidate profiles for user ${userId} in event ${eventId}`)
  
  // Verify all candidates belong to the correct event
  const wrongEventCandidates = candidateProfiles.filter(c => c.eventId !== eventId)
  if (wrongEventCandidates.length > 0) {
    console.warn(`Found ${wrongEventCandidates.length} candidates with mismatched event_id`)
  }

  if (candidateProfiles.length === 0) {
    console.log(`No candidates found for user ${userId} (need at least 2 users in event to create matches)`)
    return {
      userId,
      matchesCreated: 0,
      matchesUpdated: 0,
    }
  }
  
  if (candidateProfiles.length < 3) {
    console.log(`Only ${candidateProfiles.length} candidate(s) available (will return up to ${candidateProfiles.length} matches)`)
  }

  // Delete all existing system matches for this user FIRST (clean slate before rematching)
  console.log(`Deleting existing system matches for user ${userId}...`)
  const { data: existingMatches, error: selectError } = await supabase
    .from("connections")
    .select("connection_id")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)

  const existingCount = existingMatches?.length || 0
  
  if (existingCount > 0) {
    const { error: deleteError } = await supabase
      .from("connections")
      .delete()
      .eq("event_id", eventId)
      .eq("connection_kind", "system_match")
      .or(`a_id.eq.${userId},b_id.eq.${userId}`)

    if (deleteError) {
      console.error(`Failed to delete existing matches for user ${userId}:`, deleteError)
      throw new Error(`Failed to delete existing matches: ${deleteError.message}`)
    }
    console.log(`Deleted ${existingCount} existing match(es) for user ${userId}`)
  } else {
    console.log(`No existing matches found for user ${userId}`)
  }

  // Get AI matches
  console.log(`Calling AI to find matches for user ${userId}...`)
  const aiMatchesResult = await getAIMatchesWithDiagnostics(openai, viewer, candidateProfiles)
  const aiMatches = aiMatchesResult.matches
  const diagnostics = aiMatchesResult.diagnostics
  console.log(`AI returned ${aiMatches.length} matches for user ${userId}`)

  if (aiMatches.length === 0) {
    return {
      userId,
      matchesCreated: 0,
      matchesUpdated: 0,
      diagnostic: {
        candidateCount: candidateProfiles.length,
        aiMatchesReturned: diagnostics.rawMatchesCount,
        validMatchesCount: 0,
        validationIssues: diagnostics.validationIssues.length > 0 ? diagnostics.validationIssues : undefined,
      },
    }
  }

  // Create new connections for all AI matches
  let matchesCreated = 0

  for (const match of aiMatches) {
    const [aId, bId] = userId < match.match_user_id
      ? [userId, match.match_user_id]
      : [match.match_user_id, userId]

    const connectionData: any = {
      event_id: eventId,
      a_id: aId,
      b_id: bId,
      connection_kind: "system_match",
      match_explanation_text: match.explanation,
      match_algorithm_version: "ai-v1",
    }

    const { error: insertError } = await supabase
      .from("connections")
      .insert(connectionData)

    if (insertError) {
      console.error(
        `Failed to create connection for ${userId}/${match.match_user_id}:`,
        insertError
      )
      // Log the error but continue with other matches
      continue
    }

    matchesCreated++
    console.log(`Created match: ${userId} <-> ${match.match_user_id}`)
  }
  
  console.log(`Successfully created ${matchesCreated} out of ${aiMatches.length} matches`)

  return {
    userId,
    matchesCreated,
    matchesUpdated: 0, // Always 0 since we replace, not update
    diagnostic: {
      candidateCount: candidateProfiles.length,
      aiMatchesReturned: diagnostics.rawMatchesCount,
      validMatchesCount: aiMatches.length,
      validationIssues: diagnostics.validationIssues.length > 0 ? diagnostics.validationIssues : undefined,
    },
  }
}

// -----------------------------------------------------------------------------
// AI Matching Logic
// -----------------------------------------------------------------------------

async function getAIMatches(
  openai: OpenAI,
  viewer: CandidateProfile,
  candidates: CandidateProfile[]
): Promise<MatchResult[]> {
  const result = await getAIMatchesWithDiagnostics(openai, viewer, candidates)
  return result.matches
}

async function getAIMatchesWithDiagnostics(
  openai: OpenAI,
  viewer: CandidateProfile,
  candidates: CandidateProfile[]
): Promise<{ matches: MatchResult[]; diagnostics: { rawMatchesCount: number; validationIssues: string[] } }> {
  const diagnostics: { rawMatchesCount: number; validationIssues: string[] } = {
    rawMatchesCount: 0,
    validationIssues: [],
  }
  const systemPrompt = `You are an expert matchmaker for business networking events. Your job is to analyze a person's needs and wants, then find the top 3 best matches from a list of candidates.

You receive structured JSON:
{
  "viewer": { "id": "...", "firstName": "...", "wantSummary": "...", ... },
  "candidates": [ { "id": "...", "firstName": "...", "offerSummary": "...", ... }, ... ],
  "suggestionsPerUser": 3
}

CRITICAL: Use candidates[i].id EXACTLY for match_user_id. Do not modify, abbreviate, or transform it in any way.

Focus on:
1. Person 1's wants and needs (especially wantSummary and wantTags)
2. How each candidate can help Person 1 achieve their goals
3. Shared interests, complementary skills, and industry overlap
4. Mutual benefit potential

Return exactly 3 matches ranked by how well they help Person 1. Each match should have:
- match_user_id: Use candidate.id EXACTLY as provided (required - must match exactly)
- explanation: A clear, specific explanation (2-3 sentences) focused on why this match will help Person 1. Write from Person 1's perspective: "This match will help you because..."
- match_reasons: An array of 2-4 specific reasons why this is a good match

Output JSON only, no markdown, no code blocks. Format:
{
  "matches": [
    {
      "match_user_id": "use-candidate-id-exactly-as-provided",
      "explanation": "...",
      "match_reasons": ["reason1", "reason2", ...]
    },
    ...
  ]
}`

  // Prepare structured JSON payload
  const payload = {
    viewer: {
      id: viewer.id,
      firstName: viewer.firstName,
      lastName: viewer.lastName,
      jobTitle: viewer.jobTitle,
      company: viewer.company,
      companySummary: viewer.companySummary,
      companyUrl: viewer.companyUrl,
      careerYears: viewer.careerYears,
      wantSummary: viewer.wantSummary,
      wantTags: viewer.wantTags,
      offerSummary: viewer.offerSummary,
      offerTags: viewer.offerTags,
      needTags: viewer.needTags,
      industryTags: viewer.industryTags,
      hobbies: viewer.hobbies,
      hobbyTags: viewer.hobbyTags,
      businessNeed: viewer.businessNeed,
      whyAttending: viewer.whyAttending,
      roleIntent: viewer.roleIntent,
      availabilityStatus: viewer.availabilityStatus,
    },
    candidates: candidates.map(c => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      jobTitle: c.jobTitle,
      company: c.company,
      companySummary: c.companySummary,
      companyUrl: c.companyUrl,
      careerYears: c.careerYears,
      offerSummary: c.offerSummary,
      offerTags: c.offerTags,
      wantSummary: c.wantSummary,
      wantTags: c.wantTags,
      needTags: c.needTags,
      industryTags: c.industryTags,
      hobbies: c.hobbies,
      hobbyTags: c.hobbyTags,
      businessNeed: c.businessNeed,
      whyAttending: c.whyAttending,
      roleIntent: c.roleIntent,
      availabilityStatus: c.availabilityStatus,
    })),
    suggestionsPerUser: 3,
  }

  const userPrompt = `Here is structured JSON for the viewer and candidates.

Use candidate.id as the only source of truth for match_user_id.

Find the top 3 best matches for Person 1. Focus on how each candidate can help Person 1 achieve their goals, especially their wants: ${viewer.wantSummary || "See wantTags below"}.

${JSON.stringify(payload, null, 2)}`

  try {
    console.log(`Calling OpenAI API with model ${OPENAI_MODEL}...`)
    console.log(`Payload size: ${JSON.stringify(payload).length} characters`)
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    })
    
    console.log(`OpenAI API call successful. Usage: ${JSON.stringify(response.usage)}`)

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.warn("No content in OpenAI response")
      console.warn("Response:", JSON.stringify(response, null, 2))
      return []
    }
    
    console.log(`OpenAI response length: ${content.length} characters`)

    const parsed = JSON.parse(content)
    const matches = parsed.matches || []
    diagnostics.rawMatchesCount = matches.length

    console.log(`Parsed ${matches.length} matches from AI response`)

    // Validate and normalize matches
    const validMatches: MatchResult[] = []
    // Normalize all candidate IDs to trimmed strings for robust comparison
    const candidateIds = new Set(candidates.map(c => String(c.id).trim()))
    
    console.log(`Candidate IDs (normalized): ${Array.from(candidateIds).slice(0, 5).join(', ')}...`)
    
    for (const match of matches.slice(0, 3)) {
      const matchUserId = String(match.match_user_id || "").trim()
      
      if (!matchUserId) {
        const issue = `Match missing match_user_id: ${JSON.stringify(match)}`
        console.warn(issue)
        diagnostics.validationIssues.push(issue)
        continue
      }
      
      if (!candidateIds.has(matchUserId)) {
        // Try name-based fallback matching (Fix 2)
        const nameMatch = candidates.find(c => {
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase().trim()
          const matchUserIdLower = matchUserId.toLowerCase().trim()
          return (
            fullName &&
            (matchUserIdLower.includes(fullName) || fullName.includes(matchUserIdLower))
          )
        })
        
        if (nameMatch) {
          const fallbackId = String(nameMatch.id).trim()
          console.warn(`Using name-based fallback: AI returned "${matchUserId}" but matched to ID "${fallbackId}" (${nameMatch.firstName} ${nameMatch.lastName})`)
          diagnostics.validationIssues.push(`ID mismatch resolved via name fallback: "${matchUserId}" -> "${fallbackId}"`)
          
          // Use the fallback ID
          const finalMatchUserId = fallbackId
          
          if (!match.explanation) {
            const issue = `Match missing explanation for user ${finalMatchUserId}`
            console.warn(issue)
            diagnostics.validationIssues.push(issue)
            continue
          }
          
          validMatches.push({
            match_user_id: finalMatchUserId,
            explanation: String(match.explanation).trim(),
            match_reasons: Array.isArray(match.match_reasons)
              ? match.match_reasons.map(String)
              : [],
          })
          continue
        }
        
        // No fallback match found - log detailed error
        const issue = `Match user_id "${matchUserId}" not found in candidate list. Sample candidate IDs: ${Array.from(candidateIds).slice(0, 5).join(", ")}`
        console.warn(issue)
        diagnostics.validationIssues.push(issue)
        continue
      }
      
      // ID matched successfully
      if (!match.explanation) {
        const issue = `Match missing explanation for user ${matchUserId}`
        console.warn(issue)
        diagnostics.validationIssues.push(issue)
        continue
      }
      
      validMatches.push({
        match_user_id: matchUserId,
        explanation: String(match.explanation).trim(),
        match_reasons: Array.isArray(match.match_reasons)
          ? match.match_reasons.map(String)
          : [],
      })
    }

    console.log(`Validated ${validMatches.length} matches`)
    return { matches: validMatches, diagnostics }
  } catch (error) {
    console.error("AI matching failed:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
      
      // Check for specific OpenAI API errors
      if (error.message.includes("API key") || error.message.includes("authentication")) {
        diagnostics.validationIssues.push(`OpenAI API authentication error: ${error.message}. Check OPENAI_API_KEY in Supabase project settings.`)
      } else if (error.message.includes("rate limit") || error.message.includes("quota")) {
        diagnostics.validationIssues.push(`OpenAI API rate limit/quota error: ${error.message}`)
      } else {
        diagnostics.validationIssues.push(`AI matching error: ${error.message}`)
      }
    }
    return { matches: [], diagnostics }
  }
}

// -----------------------------------------------------------------------------
// Helper: Build Profile Text
// -----------------------------------------------------------------------------

function buildProfileText(profile: CandidateProfile, isViewer: boolean): string {
  const parts: string[] = []

  parts.push(`User ID: ${profile.id}`)
  
  if (profile.firstName || profile.lastName) {
    parts.push(`Name: ${[profile.firstName, profile.lastName].filter(Boolean).join(" ")}`)
  }

  if (profile.jobTitle) {
    parts.push(`Job Title: ${profile.jobTitle}`)
  }

  if (profile.company) {
    parts.push(`Company: ${profile.company}`)
  }

  if (profile.companySummary) {
    parts.push(`Company Summary: ${profile.companySummary}`)
  }

  if (profile.companyUrl) {
    parts.push(`Company URL: ${profile.companyUrl}`)
  }

  if (profile.careerYears !== null) {
    parts.push(`Years of Experience: ${profile.careerYears}`)
  }

  if (isViewer && profile.wantSummary) {
    parts.push(`\nWHAT THEY WANT (IMPORTANT): ${profile.wantSummary}`)
  }

  if (profile.wantTags && profile.wantTags.length > 0) {
    parts.push(`Want Tags: ${profile.wantTags.join(", ")}`)
  }

  if (isViewer && profile.offerSummary) {
    parts.push(`What They Offer: ${profile.offerSummary}`)
  }

  if (profile.offerTags && profile.offerTags.length > 0) {
    parts.push(`Offer Tags: ${profile.offerTags.join(", ")}`)
  }

  if (profile.needTags && profile.needTags.length > 0) {
    parts.push(`Need Tags: ${profile.needTags.join(", ")}`)
  }

  if (profile.industryTags && profile.industryTags.length > 0) {
    parts.push(`Industries: ${profile.industryTags.join(", ")}`)
  }

  if (profile.hobbies && profile.hobbies.length > 0) {
    parts.push(`Hobbies: ${profile.hobbies.join(", ")}`)
  }

  if (profile.hobbyTags && profile.hobbyTags.length > 0) {
    parts.push(`Hobby Tags: ${profile.hobbyTags.join(", ")}`)
  }

  if (profile.businessNeed) {
    parts.push(`Business Need: ${profile.businessNeed}`)
  }

  if (profile.whyAttending) {
    parts.push(`Why Attending: ${profile.whyAttending}`)
  }

  if (profile.roleIntent) {
    parts.push(`Role Intent: ${profile.roleIntent}`)
  }

  if (profile.availabilityStatus) {
    parts.push(`Availability: ${profile.availabilityStatus}`)
  }

  return parts.join("\n")
}

