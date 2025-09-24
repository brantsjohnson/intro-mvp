// Supabase Edge Function for scalable matchmaking
// Processes users directly without queue system - ALL PROCESSING IN CLOUD

import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import OpenAI from "https://esm.sh/openai@4"

// Configuration
const BATCH_SIZE = parseInt(Deno.env.get("BATCH_SIZE") ?? "5", 10)
const MAX_RUNTIME_MS = parseInt(Deno.env.get("MAX_RUNTIME_MS") ?? "30000", 10) // 30 seconds

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
  if (me.networking_goals && candidate.networking_goals) {
    const goalOverlap = me.networking_goals.filter(goal => 
      candidate.networking_goals.includes(goal)
    ).length
    const goalScore = (goalOverlap / Math.max(me.networking_goals.length, candidate.networking_goals.length)) * weights.goals
    totalScore += goalScore
    if (goalScore > 0) bases.push('career')
  }

  // Career overlap (25% weight)
  if (me.job_title && candidate.job_title && me.job_title === candidate.job_title) {
    totalScore += weights.career
    bases.push('career')
  }

  // Personality compatibility (25% weight)
  if (me.mbti && candidate.mbti) {
    const personalityScore = calculatePersonalityScore(me.mbti, candidate.mbti) * weights.personality
    totalScore += personalityScore
    if (personalityScore > 0) bases.push('personality')
  }

  // Interests overlap (20% weight)
  if (me.hobbies && candidate.hobbies) {
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
      // Use 'personality' as fallback instead of 'general' since it's a valid enum value
      const baseBases = bases.length > 0 ? bases : ['personality']
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

    const prompt = `You are writing match explanations for a networking app called Intro. Write in a warm, human tone—not corporate or stuffy. Be specific to these two people.

Person A (${me.full_name || 'User'}):
- Role: ${me.job_title || 'Professional'}
- Personality: ${me.mbti || 'Not specified'}
- Goals: ${me.networking_goals?.join(', ') || 'Building connections'}
- Interests: ${me.hobbies?.join(', ') || 'Various interests'}
- What they do: ${me.what_do_you_do || 'Professional work'}

Person B (${them.full_name || 'Match'}):
- Role: ${them.job_title || 'Professional'}
- Personality: ${them.mbti || 'Not specified'}
- Goals: ${them.networking_goals?.join(', ') || 'Building connections'}
- Interests: ${them.hobbies?.join(', ') || 'Various interests'}
- What they do: ${them.what_do_you_do || 'Professional work'}

Connection bases: ${bases.join(', ')}

Generate a JSON response with these exact keys:
{
  "summary": "1 sentence capturing the core connection without job titles",
  "why_meet": "3–4 sentences",
  "shared_activities": ["2–3 unique sentences specific to this pair"],
  "dive_deeper": "1 personal, vulnerable question"
}`

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
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
      return {
        summary: String(parsed.summary || '').trim(),
        why_meet: String(parsed.why_meet || '').trim(),
        shared_activities: Array.isArray(parsed.shared_activities) ? parsed.shared_activities.slice(0, 3) : [],
        dive_deeper: String(parsed.dive_deeper || '').trim(),
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError)
      // Fallback response
      return {
        summary: `${me.full_name || 'You'} and ${them.full_name || 'they'} share complementary skills and could learn from each other's different approaches.`,
        why_meet: 'You share complementary focus areas and could learn from each other\'s different approaches.',
        shared_activities: ['Compare favorite shows', 'Trade local food spots'],
        dive_deeper: 'What would make this week feel genuinely worthwhile for you?',
      }
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    // Fallback response
    return {
      summary: `${me.full_name || 'You'} and ${them.full_name || 'they'} share complementary skills and could learn from each other's different approaches.`,
      why_meet: 'You share complementary focus areas and could learn from each other\'s different approaches.',
      shared_activities: ['Compare favorite shows', 'Trade local food spots'],
      dive_deeper: 'What would make this week feel genuinely worthwhile for you?',
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
        return { ...match, panels }
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
    const { event_id } = await req.json()
    
    if (!event_id) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "event_id is required" 
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    console.log(`Starting direct matchmaking for event ${event_id}`)
    
    // Get all users for the event
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    
    const { data: eventUsers, error: usersError } = await supabase
      .from('all_events_members')
      .select('user_id')
      .eq('event_id', event_id)
    
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
        await processUser(user_id, event_id)
        processed++
        console.log(`Processed user ${user_id} (${processed}/${eventUsers.length})`)
        
        // Check if we're approaching timeout
        if (Date.now() - startTime > MAX_RUNTIME_MS - 5000) {
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