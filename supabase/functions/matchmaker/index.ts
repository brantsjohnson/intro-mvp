// Supabase Edge Function for scalable matchmaking
// Processes users directly without queue system - ALL PROCESSING IN CLOUD

import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import OpenAI from "https://esm.sh/openai@4"

// Configuration
const BATCH_SIZE = parseInt(Deno.env.get("BATCH_SIZE") ?? "5", 10)
const MAX_RUNTIME_MS = parseInt(Deno.env.get("MAX_RUNTIME_MS") ?? "120000", 10) // 2 minutes

// Types
type Weights = {
  goals: number
  career: number
  personality: number
  interests: number
}

type Candidate = {
  user_id: string
  first_name: string | null
  last_name: string | null
  job_title: string | null
  company: string | null
  what_do_you_do: string | null
  mbti: string | null
  enneagram: string | null
  avatar_url: string | null
  networking_goals: string[] | null
  hobbies: string[] | null
  expertise_tags: string[] | null
  full_name: string | null
  job_description: string | null
  is_present: boolean
}

type ScoredMatch = {
  match_user_id: string
  score: number
  bases: string[]
}

type MatchPanels = {
  why_meet: string
  shared_activities: string[]
  dive_deeper: string
  summary: string
  bases: string[]
}

const DEFAULT_WEIGHTS: Weights = {
  goals: 0.3,
  career: 0.25,
  personality: 0.25,
  interests: 0.2
}

// Scoring functions (duplicated from score.ts)
function scoreCandidate(me: Candidate, candidate: Candidate, weights: Weights = DEFAULT_WEIGHTS): { score: number; bases: string[] } {
  const bases: string[] = []
  let totalScore = 0

  // Goals overlap (30% weight) - map to 'career' since networking goals are career-focused
  if (me.networking_goals && candidate.networking_goals && me.networking_goals.length > 0 && candidate.networking_goals.length > 0) {
    const goalOverlap = me.networking_goals.filter(goal => 
      candidate.networking_goals.includes(goal)
    ).length
    const goalScore = (goalOverlap / Math.max(me.networking_goals.length, candidate.networking_goals.length)) * weights.goals
    totalScore += goalScore
    if (goalScore > 0) bases.push('career')
  }

  // Career overlap (25% weight) - more lenient matching
  if (me.job_title && candidate.job_title) {
    // Exact match
    if (me.job_title === candidate.job_title) {
      totalScore += weights.career
      bases.push('career')
    }
    // Similar job titles (contains same words)
    else if (me.job_title.toLowerCase().includes(candidate.job_title.toLowerCase()) || 
             candidate.job_title.toLowerCase().includes(me.job_title.toLowerCase())) {
      totalScore += weights.career * 0.5
      bases.push('career')
    }
  }

  // Personality compatibility (25% weight)
  if (me.mbti && candidate.mbti) {
    const personalityScore = calculatePersonalityScore(me.mbti, candidate.mbti) * weights.personality
    totalScore += personalityScore
    if (personalityScore > 0) bases.push('personality')
  }

  // Interests overlap (20% weight) - more lenient matching
  if (me.hobbies && candidate.hobbies && me.hobbies.length > 0 && candidate.hobbies.length > 0) {
    const interestOverlap = me.hobbies.filter(hobby => 
      candidate.hobbies.includes(hobby)
    ).length
    const interestScore = (interestOverlap / Math.max(me.hobbies.length, candidate.hobbies.length)) * weights.interests
    totalScore += interestScore
    if (interestScore > 0) bases.push('interests')
  }

  return { score: totalScore, bases }
}

function calculatePersonalityScore(mbti1: string, mbti2: string): number {
  // Simple MBTI compatibility scoring
  const compatiblePairs = [
    ['INTJ', 'ENFP'], ['ENTP', 'INFJ'], ['ENFJ', 'INTP'], ['ENTJ', 'INFP'],
    ['ISFP', 'ESTJ'], ['ISTP', 'ESTP'], ['ISFJ', 'ESFP'], ['ISTJ', 'ESFJ']
  ]
  
  for (const pair of compatiblePairs) {
    if ((mbti1 === pair[0] && mbti2 === pair[1]) || (mbti1 === pair[1] && mbti2 === pair[0])) {
      return 1.0
    }
  }
  
  // Same type gets medium score
  if (mbti1 === mbti2) return 0.5
  
  return 0
}

function scoreCandidatesForUser(me: Candidate, candidates: Candidate[], weights: Weights = DEFAULT_WEIGHTS): ScoredMatch[] {
  return candidates
    .filter(candidate => candidate.user_id !== me.user_id)
    .map((candidate) => {
      const { score, bases } = scoreCandidate(me, candidate, weights)
      // Give a base score of 1 for any user with any data to ensure matches are created
      const baseScore = score > 0 ? score : 1
      // Smart fallback for bases - try to determine the best match reason
      let baseBases = bases
      if (baseBases.length === 0) {
        // If no specific bases found, try to infer from available data
        if (me.job_title && candidate.job_title) {
          baseBases = ['career']
        } else if (me.hobbies && candidate.hobbies && me.hobbies.length > 0 && candidate.hobbies.length > 0) {
          baseBases = ['interests']
        } else if (me.mbti && candidate.mbti) {
          baseBases = ['personality']
        } else {
          baseBases = ['other'] // Default fallback
        }
      }
      return {
        match_user_id: candidate.user_id,
        score: baseScore,
        bases: baseBases
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

async function generatePanels(me: Candidate, them: Candidate, bases: string[]): Promise<MatchPanels> {
  const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
  })

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini"

  try {
    const viewerGoal = me.networking_goals?.[0] || 'building meaningful connections'
    const theirSkill = them.expertise_tags?.[0] || 'their expertise'
    const hobby = me.hobbies?.[0] || 'shared interests'

    const prompt = `SYSTEM ROLE
You are a perceptive, warm connector. Write matchmaking insights that help two attendees see WHY they should talk, WHAT easy things they could do together, and HOW to go a bit deeper. You are not a brochure, not a keynote, and not a corporate press release.

WHAT WENT WRONG BEFORE (DO NOT REPEAT)
- Outputs were too short, generic, and work-only.
- Used odd symbols ("+", bullets) and fragments instead of sentences.
- Ignored hobbies/personality; sounded like LinkedIn.
- Repeated the same advice across sections.

QUALITY BAR (MUST DO)
- Sound like a smart friend who's great at introductions.
- Mix **goals + career** with **personality + hobbies** (human first). Help the user really see why they should be connected. 
- Only show match **bases** that truly apply: "career", "interests", "personality".
- Natural sentences only. No "+", "•", or telegraphic fragments.
- Each section has its own purpose and **does not repeat** the others.

BANNED WORDS/PHRASES
networking, collaborate/collaboration, synergy, leverage, alignment, industry insights, ecosystem, thought leadership, engage/engagement, circle back, unlock, value-add, go-to-market ideas.

INPUTS (you may use any that are present; never invent)
User A: ${me.first_name || 'User'} ${me.last_name || ''} — ${me.job_title || 'Professional'} @ ${me.company || 'their company'}
  goals: ${me.networking_goals?.join(', ') || 'Building meaningful connections'}
  what_do_you_do: ${me.what_do_you_do || 'Professional work'}
  interests: ${me.hobbies?.join(', ') || 'Various interests'}
  personality: MBTI ${me.mbti || 'Not specified'} / Enneagram ${me.enneagram || 'Not specified'}

User B: ${them.first_name || 'Match'} ${them.last_name || ''} — ${them.job_title || 'Professional'} @ ${them.company || 'their company'}
  goals: ${them.networking_goals?.join(', ') || 'Building meaningful connections'}
  what_do_you_do: ${them.what_do_you_do || 'Professional work'}
  hobbies: ${them.hobbies?.join(', ') || 'Various interests'}
  personality: MBTI ${them.mbti || 'Not specified'} / Enneagram ${them.enneagram || 'Not specified'}

HOW TO THINK (ADD INSIGHTS, NOT JUST FACTS)
- Start from **event/networking goals**. If one person seeks mentorship/clients/peers and the other offers relevant experience, say that plainly.
- Read between the lines of roles: product often blends creative ↔ analytical; engineers think in systems; AEs feel audience signals; planners bring structure; founders chase experiments ECT - use these insights for better Dive Deeper questions as well
- Use hobbies/personality to make it human (concerts, pets, outdoors, TV, food etc.). If things like concerts or pets etc are shared, **say it explicitly**.
- Valuable contrast counts: planner ↔ visionary, creative ↔ analytical, startup scrappy ↔ enterprise polish—call out how that balance helps them. But similarity is great too - people bond over shared experiences. 
- If data is thin, keep it simple but still personal. Never pad with jargon. It should always be connection first not business first unless that is their explicit need and the match helps with that.  

SECTIONS TO PRODUCE (REQUIRED)
1) Why You Two Should Meet  —  **2–4 full sentences.**
   - Start with goals (why they're here). State the bridge clearly (A wants __and B has/does so they could provide ___ which could be helpful because___). - don't restate job title though
   - Add ONE non-obvious angle (shared niche interest, complementary style, creative/analytical balance, similar audience, one could be client of theirs).
   - Human tone; avoid buzzwords.

2) Activities You Might Enjoy  —  **2–3 full sentences.**
   - Offer 2–3 concrete, natural ideas. Blend personal + light professional.
   - Examples of style (adapt to their data): compare all-time TV shows; trade underrated local food spots; talk about the most ridiculous hobby you've picked up. - maybe their meyers briggs or enneagram can highlight some hobbies they may enjoy and overlap.
   - No bullets; write as sentences.

3) Where To Dive Deeper  —  **1 or 2 full sentences.**
   - One thoughtful, not a run on sentence that is too stuffy, open question tied to personality, shared struggles, or a turning point. It should invite a real story (not yes/no) it should also not feel like a business interview. 
   - Examples but they should be one question for the two of them, like "You both mentioned you're family people - Who is someone in your family that people don't often realize had a huge impact on you?"

BASES (SHOW ONLY WHAT'S TRUE)
- List 1–3 of: "career", "interests", "personality".
- Only include a base if your text gives clear evidence of it.

OUTPUT FORMAT (STRICT JSON)
Return ONLY this JSON object (no prose around it):

{
  "bases": ["career", "interests"],                  // 1–3 that truly apply
  "summary": "One powerful sentence that captures the essence of why they should connect. Focus on the core value without mentioning job titles or companies. Be specific and compelling.",
  "why_meet": "3–4 sentences…",
  "activities": "2–3 sentences…",
  "dive_deeper": "1–2 sentences…"
}

VALIDATION CHECKS (YOU MUST SELF-CHECK BEFORE RETURNING)
- why_meet has 2–4 sentences; activities has 2–3; dive_deeper has 1–2.
- No banned words. No '+' signs or list bullets. Natural punctuation.
- Each section contains different ideas (no repeats).
- At least one explicit reference to a hobby/personality detail if available.`

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 1000,
    })

    const text = response.choices[0]?.message?.content || ""
    
    // Clean up the response - remove markdown code blocks if present
    let cleanedText = text.trim()
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    // Try to parse JSON response
    try {
      const parsed = JSON.parse(cleanedText)
      
      // Validate and clean the response
      let activities = []
      
      // Handle activities - could be string or array
      if (Array.isArray(parsed.activities)) {
        activities = parsed.activities.slice(0, 3)
      } else if (Array.isArray(parsed.shared_activities)) {
        activities = parsed.shared_activities.slice(0, 3)
      } else if (typeof parsed.activities === 'string' && parsed.activities.trim()) {
        // Split string into sentences and clean up
        activities = parsed.activities
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .slice(0, 3)
      } else if (typeof parsed.shared_activities === 'string' && parsed.shared_activities.trim()) {
        // Split string into sentences and clean up
        activities = parsed.shared_activities
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .slice(0, 3)
      }

      return {
        summary: String(parsed.summary || '').trim(),
        why_meet: String(parsed.why_meet || '').trim(),
        shared_activities: activities,
        dive_deeper: String(parsed.dive_deeper || '').trim(),
        bases: Array.isArray(parsed.bases) ? parsed.bases : ['other'] // Use AI-generated bases
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError)
      // Fallback response - more engaging than generic
      return {
        summary: `${me.full_name || 'You'} and ${them.full_name || 'they'} both bring unique perspectives that could spark interesting conversations and mutual growth.`,
        why_meet: `You both seem to value meaningful connections and have complementary approaches to your work. There's likely an interesting story behind how you each got to where you are today, and those different paths could lead to some great insights for both of you.`,
        shared_activities: [`Find a local spot that neither of you has tried yet and make it your own discovery together`, `Share your favorite podcasts or books and discuss the ideas that stuck with you`],
        dive_deeper: 'What\'s something you learned recently that completely shifted how you think about your work or life?',
        bases: ['other'] // Fallback bases
      }
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    // Fallback response - more engaging than generic
    return {
      summary: `${me.full_name || 'You'} and ${them.full_name || 'they'} both bring unique perspectives that could spark interesting conversations and mutual growth.`,
      why_meet: `You both seem to value meaningful connections and have complementary approaches to your work. There's likely an interesting story behind how you each got to where you are today, and those different paths could lead to some great insights for both of you.`,
      shared_activities: [`Find a local spot that neither of you has tried yet and make it your own discovery together`, `Share your favorite podcasts or books and discuss the ideas that stuck with you`],
      dive_deeper: 'What\'s something you learned recently that completely shifted how you think about your work or life?',
      bases: ['other'] // Fallback bases
    }
  }
}

async function processUser(userId: string, eventId: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  try {
    // 1) Get user data
    const { data: userData, error: userError } = await supabase
      .from('all_events_members')
      .select(`
        user_id,
        first_name,
        last_name,
        job_title,
        company,
        what_do_you_do,
        mbti,
        enneagram,
        avatar_url,
        networking_goals,
        hobbies,
        expertise_tags,
        is_present
      `)
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .single()

    if (userError) {
      console.error(`Error fetching user ${userId}:`, userError)
      throw new Error(`Failed to fetch user data: ${userError.message}`)
    }

    if (!userData) {
      console.error(`No user data found for user ${userId} in event ${eventId}`)
      throw new Error(`No user data found for user ${userId}`)
    }

    const me: Candidate = {
      ...userData,
      full_name: userData.first_name && userData.last_name ? `${userData.first_name} ${userData.last_name}` : userData.first_name || 'Unknown',
      job_description: userData.what_do_you_do || userData.job_title || 'Professional',
      networking_goals: userData.networking_goals || [],
      hobbies: userData.hobbies || [],
      expertise_tags: userData.expertise_tags || []
    }

    // 2) Get all other users in the event
    const { data: candidatesData, error: candidatesError } = await supabase
      .from('all_events_members')
      .select(`
        user_id,
        first_name,
        last_name,
        job_title,
        company,
        what_do_you_do,
        mbti,
        enneagram,
        avatar_url,
        networking_goals,
        hobbies,
        expertise_tags,
        is_present
      `)
      .eq('event_id', eventId)
      .neq('user_id', userId)

    if (candidatesError) {
      console.error(`Error fetching candidates for user ${userId}:`, candidatesError)
      throw new Error(`Failed to fetch candidates: ${candidatesError.message}`)
    }

    const candidates: Candidate[] = (candidatesData || []).map(candidate => ({
      ...candidate,
      full_name: candidate.first_name && candidate.last_name ? `${candidate.first_name} ${candidate.last_name}` : candidate.first_name || 'Unknown',
      job_description: candidate.what_do_you_do || candidate.job_title || 'Professional',
      networking_goals: candidate.networking_goals || [],
      hobbies: candidate.hobbies || [],
      expertise_tags: candidate.expertise_tags || []
    }))

    // 3) Score candidates
    const scoredMatches = scoreCandidatesForUser(me, candidates)
    console.log(`Found ${scoredMatches.length} scored matches for user ${userId}`)

    // 4) Generate AI panels for top matches
    const withPanels = await Promise.all(
      scoredMatches.map(async (match) => {
        const candidate = candidates.find(c => c.user_id === match.match_user_id)
        if (!candidate) return match

        const panels = await generatePanels(me, candidate, match.bases)
        return { ...match, panels, bases: panels.bases } // Use AI-generated bases
      })
    )

    // 5) Delete existing matches for this user
    const { error: deleteError } = await supabase.from("matches")
      .delete()
      .eq("event_id", eventId)
      .or(`a.eq.${userId},b.eq.${userId}`)

    if (deleteError) {
      console.error(`Error deleting existing matches for user ${userId}:`, deleteError)
      throw deleteError
    }

    // 6) Insert new matches
    const matchInserts = withPanels.map((match, index) => {
      const pair = userId < match.match_user_id ? 
        { a: userId, b: match.match_user_id } : 
        { a: match.match_user_id, b: userId }
      
      return {
        event_id: eventId,
        a: pair.a,
        b: pair.b,
        bases: match.bases,
        summary: match.panels.summary,
        why_meet: match.panels.why_meet,
        shared_activities: JSON.stringify(match.panels.shared_activities),
        dive_deeper: match.panels.dive_deeper,
        is_system: true,
      }
    })

    if (matchInserts.length > 0) {
      const { error: insertError } = await supabase.from("matches").insert(matchInserts)
      if (insertError) {
        console.error(`Failed to insert matches for user ${userId}:`, insertError)
        throw insertError
      }
      console.log(`Successfully created ${matchInserts.length} matches for user ${userId}`)
    } else {
      console.log(`No matches to insert for user ${userId}`)
    }

  } catch (error) {
    console.error(`Error processing user ${userId}:`, error)
    throw error
  }
}

serve(async (req) => {
  const startTime = Date.now()
  
  try {
    const { event_id, event_code, user_id, auto_match_new_user } = await req.json()
    
    if (!event_id && !event_code) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "event_id or event_code is required" 
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    let actualEventId = event_id

    // If event_code is provided, look up the event_id
    if (event_code && !event_id) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('code', event_code.toUpperCase())
        .single()

      if (eventError || !eventData) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: `Event not found for code: ${event_code}` 
        }), { 
          status: 404,
          headers: { "Content-Type": "application/json" }
        })
      }

      actualEventId = eventData.id
    }

    console.log(`🔄 FULL EVENT MATCHMAKING: Processing ALL users for event ${actualEventId}`)
    
    // Get all users for the event
    const { data: eventUsers, error: usersError } = await supabase
      .from('all_events_members')
      .select('user_id')
      .eq('event_id', actualEventId)
    
    console.log(`Found ${eventUsers?.length || 0} users in event ${actualEventId}`)
    
    if (usersError) {
      console.error('Error fetching event users:', usersError)
      return new Response(JSON.stringify({ 
        ok: false, 
        error: `Failed to fetch users: ${usersError.message}` 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }

    // Handle auto-matching for new user
    if (auto_match_new_user && user_id) {
      console.log(`🎯 AUTO-MATCHING: Processing ONLY new user ${user_id} for event ${actualEventId}`)
      console.log(`⚠️  This will NOT process other users in the event`)
      
      // Check if event is live (active and within date range)
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('is_active, starts_at, ends_at, matchmaking_enabled')
        .eq('id', actualEventId)
        .single()

      if (eventError || !eventData) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: `Event not found: ${eventError?.message}` 
        }), { 
          status: 404,
          headers: { "Content-Type": "application/json" }
        })
      }

      // Check if event is live and matchmaking is enabled
      const now = new Date()
      const startsAt = new Date(eventData.starts_at)
      const endsAt = new Date(eventData.ends_at)
      
      const isEventLive = eventData.is_active && 
                         eventData.matchmaking_enabled && 
                         now >= startsAt && 
                         now <= endsAt

      if (!isEventLive) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: "Event is not live or matchmaking is disabled" 
        }), { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        })
      }

      // Process just this new user
      try {
        await processUser(user_id, actualEventId)
        console.log(`Successfully auto-matched new user ${user_id}`)
        
        return new Response(JSON.stringify({ 
          ok: true, 
          processed: 1,
          errors: 0,
          event_id: actualEventId,
          user_id: user_id,
          message: "New user auto-matched successfully",
          runtime_ms: Date.now() - startTime
        }), { 
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      } catch (error) {
        console.error(`Error auto-matching user ${user_id}:`, error)
        return new Response(JSON.stringify({ 
          ok: false, 
          error: `Failed to auto-match user: ${error.message}` 
        }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      }
    }
    
    if (!eventUsers || eventUsers.length === 0) {
      return new Response(JSON.stringify({ 
        ok: true, 
        processed: 0, 
        message: "No users found for event" 
      }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }
    
    let processed = 0
    let errors = 0
    
    // Process each user
    for (const { user_id } of eventUsers) {
      try {
        await processUser(user_id, actualEventId)
        processed++
        console.log(`Processed user ${user_id} (${processed}/${eventUsers.length})`)
        
        // Check if we're approaching timeout
        if (Date.now() - startTime > MAX_RUNTIME_MS - 10000) {
          console.log('Approaching timeout, stopping processing')
          break
        }
      } catch (error) {
        console.error(`Error processing user ${user_id}:`, error)
        errors++
      }
    }
    
    const runtime = Date.now() - startTime
    return new Response(JSON.stringify({ 
      ok: true, 
      processed, 
      errors,
      event_id,
      runtime_ms: runtime 
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
    
  } catch (error) {
    console.error('Edge Function error:', error)
    return new Response(JSON.stringify({ 
      ok: false, 
      error: error.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})