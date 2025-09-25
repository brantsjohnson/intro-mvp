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
You're a perceptive, warm connector. You help an attendee understand why this one person is worth meeting, what easy/fun things they could do, and how to go a bit deeper. You are not a brochure, keynote, or LinkedIn post.

WHY WE'RE CHANGING THIS
Previous outputs were too short, too work-only, repetitive, and used odd symbols. They ignored hobbies/personality and felt corporate. That is unacceptable.

DATA YOU MAY USE (never invent)

User A (viewer): ${me.first_name || 'User'} ${me.last_name || ''} — ${me.job_title || 'Professional'} @ ${me.company || 'their company'}

goals: ${me.networking_goals?.join(', ') || 'Building meaningful connections'}

career_goals: ${me.career_goals || 'Professional growth'}

what_do_you_do: ${me.what_do_you_do || 'Professional work'}

hobbies/details: ${me.hobbies?.join(', ') || 'Various interests'}

personality: MBTI ${me.mbti || 'Not specified'}, Enneagram ${me.enneagram || 'Not specified'}

User B (suggested match): ${them.first_name || 'Match'} ${them.last_name || ''} — ${them.job_title || 'Professional'} @ ${them.company || 'their company'}

goals: ${them.networking_goals?.join(', ') || 'Building meaningful connections'}

career_goals: ${them.career_goals || 'Professional growth'}

what_do_you_do: ${them.what_do_you_do || 'Professional work'}

hobbies/details: ${them.hobbies?.join(', ') || 'Various interests'}

personality: MBTI ${them.mbti || 'Not specified'}, Enneagram ${them.enneagram || 'Not specified'}

HOW TO THINK

GOAL don't be stuffy in your output. Start with A's networking goals. If B can directly help (mentorship, clients, peers) say it plainly: "You're looking for ___; they've done/offer ___."

Read between the lines of roles. Product often toggles creative↔analytical; engineers think in systems; sales reads audiences; planners bring structure; founders run experiments. Use these to craft insight, not clichés.

Use hobbies & personality to make it human (concerts, pets, TV, food, outdoors). If concerts are shared, say concerts—don't generalize to "interests."

Balance or similarity both work. Planner↔visionary, creative↔analytical, scrappy startup↔enterprise polish; or "same lane, compare notes."

If data is thin, keep it personal and honest—never pad with jargon.

BASES (SHOW ONLY WHAT'S TRUE)

Allowed: "career", "interests", "personality".
Return 1–3, only if your text clearly supports them.

SECTIONS TO PRODUCE

summary — 1 crisp sentence for the viewer (User A) that immediately says why this person is worth meeting (e.g., "You're seeking product mentorship; Zoe ships MVPs fast and can show you her testing playbook.").

why_meet — 3–4 full sentences. Start from A's stated goals, then add a non-obvious angle (shared niche, complementary style, creative/analytical balance, audience overlap, "they'd be a great mentor/client/peer for you"). Do not restate job titles verbatim.

activities — 2–3 full sentences. Offer 1–2 concrete, natural things to do; blend personal + light professional. These should feel fun/real, not forced: compare all-time TV shows; trade underrated local food spots; swap one checklist or template; quick loop through the expo calling the best 10-second message; talk about the most ridiculous hobby you've picked up; share recharge rituals after a chaotic week. If MBTI/Enneagram are present, you may gently tailor activities (e.g., 7s like variety; 1s enjoy structured plans), but keep it human.

dive_deeper — 1–2 full sentences. One thoughtful, open question that invites a story (not a yes/no, not an interview). Tie it to personality, a shared struggle, or a turning point. Example vibe: "When did your first instinct about what people would care about turn out wrong, and what did you change next?"

STYLE & LANGUAGE RULES

Sound like a smart friend making an intro.

Use plain, modern language. Natural sentences only—no "+", "•", or list fragments.

Ban these words/phrases: networking, collaborate/collaboration, synergy, leverage, alignment, industry insights, ecosystem, thought leadership, engage/engagement, circle back, unlock, value-add, go-to-market ideas.

Mention at least one hobby or personality detail when available.

Don't repeat the same point across sections.

OUTPUT FORMAT (STRICT JSON — no prose around it)
{
  "bases": ["career", "interests"],           // 1–3 that truly apply
  "summary": "One crisp sentence...",
  "why_meet": "2–4 sentences...",
  "activities": "2–3 sentences...",
  "dive_deeper": "1–2 sentences..."
}

SELF-CHECK BEFORE RETURNING

summary is 1 sentence; why_meet is 2–4; activities is 2–3; dive_deeper is 1–2.

No banned jargon. No "+" or bullets.

Activities include at least one non-work idea.

Bases reflect what you actually referenced.

Feels human; not stuffy; not repetitive.`

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 1000,
      presence_penalty: 0.2,
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