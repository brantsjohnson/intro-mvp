import OpenAI from 'openai'

function getOpenAI(): OpenAI | null {
  // Never initialize OpenAI on the client and only if key exists
  const isBrowser = typeof window !== 'undefined'
  const apiKey = process.env.OPENAI_API_KEY
  if (isBrowser || !apiKey) return null
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: false })
}

export interface ProfileData {
  id: string
  first_name: string
  last_name: string
  job_title: string | null
  company: string | null
  what_do_you_do: string | null
  location: string | null
  mbti: string | null
  enneagram: string | null
  networking_goals: string[]
  hobbies: string[]
  expertise: string[]
}

export interface MatchCandidate {
  personA?: string
  personB?: string
  profile: ProfileData
  bases: string[]
  summary: string
  panels: {
    why: string
    activities: string
    deeper: string
  }
}

export interface MatchingRequest {
  eventId: string
  profiles: ProfileData[]
  existingMatches: Array<{
    a: string
    b: string
    bases: string[]
    summary: string
  }>
}

export class AIService {
  async generateMatches(request: MatchingRequest): Promise<MatchCandidate[]> {
    const { profiles, existingMatches } = request
    
    if (profiles.length < 2) {
      return []
    }

    try {
      const prompt = this.buildMatchingPrompt(profiles, existingMatches)
      
      const openai = getOpenAI()
      if (!openai) {
        // No key on server; fallback
        return this.fallbackMatching(profiles)
      }
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a plain‑spoken conversation coach. Your job is to tee up great first chats between two people.

North Star rule (top priority):
- Always check career goals + networking objectives first. If one person’s goal can be answered by the other’s experience, expertise, or role, that is the strongest match. Make this the first thing you say in the Why section. After that, layer in expertise similarities, shared interests, and personality compatibilities.

Key principles:
1. Start from stated goals/objectives (mentorship, clients, partnerships, hiring, learning, investing). Use them to connect A to B.
2. Then weave in career/skills context, MBTI/Enneagram style, and hobbies/interests for rapport or contrast.
3. Point out one useful, non‑obvious opportunity or contrast.
4. Tone: friendly and natural. Sound like a helpful colleague, not a brochure.
5. Be concrete and concise.
6. Forbidden words/phrases: networking, collaborate/collaboration, synergy, leverage, valuable connections, engage/engagement, industry insights.
7. Respect existing matches — only suggest new ones if clearly better.

Output format: Return a JSON array of match objects.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 4000
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No response from AI')
      }

      // Parse the JSON response
      const matches = JSON.parse(response)
      return this.validateAndFormatMatches(matches, profiles)
      
    } catch (error) {
      console.error('AI matching error:', error)
      // Fallback to basic matching if AI fails
      return this.fallbackMatching(profiles)
    }
  }

  async generateProfileInsights(profileA: ProfileData, profileB: ProfileData): Promise<{
    why: string
    activities: string
    deeper: string
  }> {
    try {
      const prompt = this.buildProfileInsightsPrompt(profileA, profileB)
      
      const openai = getOpenAI()
      if (!openai) {
        return this.fallbackProfileInsights(profileA, profileB)
      }
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a plain‑spoken conversation coach. Help two attendees have a great first chat.

North Star rule (top priority): Always check career goals + networking objectives first; if one person’s goal can be answered by the other’s experience, expertise, or role, that is the strongest match. Lead with this in Why.

Write insights that are:
- Anchored in goals FIRST (mentorship, clients, partnerships, hiring, learning, investors)
- Synthesized across career/skills, MBTI/Enneagram, hobbies/interests
- Pointing out hidden opportunities or complementary gaps they might miss
- Friendly, human tone (no corporate or academic vibe)

Return a JSON object with exactly these fields:
{
  "why": "One clear sentence: {A first name} wants {goal}; {B first name} does {specific work or context relevant to that goal}, so {concrete reason they should talk}. Use details beyond job titles—reference an initiative, skill, or interest that makes the fit obvious.",
  "activities": "1–2 casual, non‑stuffy ideas they can do right now. Use hobbies/work styles/MBTI. Examples style: 'walk‑and‑talk and trade one productivity trick', 'swap a quick win from this year', 'compare how you prep for big days'. If ENTJ + ENFJ who both value community: suggest 'do a 10‑minute walk‑and‑plan: pick one small community idea and sketch who/when/where' OR 'host a 5‑minute mini‑round‑table at a nearby table to collect two stories, then trade takeaways'. No maybes, no 'could enjoy', no corporate tone.",
  "deeper": "One open question that invites a story and a bit of vulnerability, tied to their goals, personalities, or skills/hobbies. Examples style: 'What’s a moment you almost changed course and why?', 'What belief about your work did you update this year?', 'What’s a small risk you’re glad you took?' No yes/no."
}

Rules:
- Use their first names in all three fields.
- Name at least one concrete overlap or complement (hobby, skill, goal) when available.
- If no overlaps, lean on complementarity and suggest a mutual‑learning topic.
- Avoid these words entirely: networking, collaborate/collaboration, synergy, leverage, valuable connections, engage/engagement, industry insights.
- Keep total under ~75 words and make it feel human.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 1000
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No response from AI')
      }

      return JSON.parse(response)
      
    } catch (error) {
      console.error('AI profile insights error:', error)
      // Fallback to basic insights
      return this.fallbackProfileInsights(profileA, profileB)
    }
  }

  private buildMatchingPrompt(profiles: ProfileData[], existingMatches: any[]): string {
    const profilesText = profiles.map(profile => `
Profile ID: ${profile.id}
Name: ${profile.first_name} ${profile.last_name}
Job Title: ${profile.job_title || 'Not specified'}
Company: ${profile.company || 'Not specified'}
What they do: ${profile.what_do_you_do || 'Not specified'}
Location: ${profile.location || 'Not specified'}
MBTI: ${profile.mbti || 'Not specified'}
Enneagram: ${profile.enneagram || 'Not specified'}
Networking Goals: ${profile.networking_goals.join(', ') || 'Not specified'}
Hobbies: ${profile.hobbies.join(', ') || 'Not specified'}
Expertise: ${profile.expertise.join(', ') || 'Not specified'}
`).join('\n---\n')

    const existingMatchesText = existingMatches.length > 0 ? `
Existing matches (don't duplicate these):
${existingMatches.map(match => `${match.a} <-> ${match.b} (${match.bases.join(', ')})`).join('\n')}
` : 'No existing matches.'

    return `
Please analyze these attendees and create human, helpful matches (1–3 strong per person).

CRITICAL PRIORITY: Start from career goals & networking objectives. If A wants X and B has experience/role/network for X, that is the strongest possible match. Make the Why section open with: "You want X; they’ve done X." or "You both came for Y."

Then layer in: career/skills context, personality (MBTI/Enneagram) style bridges, and hobbies/interests for rapport. Point out one hidden opportunity or useful contrast for each pairing. Keep tone warm, clear, and buzzword‑free.

${profilesText}

${existingMatchesText}

Consider these matching criteria in this order:
1. Networking goals/objectives alignment (top priority)
2. Expertise & career context (complementary or parallel roles)
3. Interests & hobbies overlaps
4. Personality compatibility (MBTI/Enneagram)
5. Geographic proximity (if relevant)

Return a JSON array of match objects. Each match should have:
- "personA": profile ID
- "personB": profile ID  
- "bases": array of match reasons using ONLY these valid values: ["career", "interests", "personality"]
- "summary": one sentence explaining why they should meet, opening with goal alignment when present (e.g., "You want X; they’ve done X.")
- "panels": object with "why", "activities", "deeper" fields

CRITICAL: The "bases" field must ONLY include the specific categories where there is actual overlap or strong connection:
- "career": Only include if they have complementary or related career paths, similar industries, or relevant professional connections
- "interests": Only include if they share specific hobbies, interests, or activities
- "personality": Only include if they have compatible MBTI types, Enneagram types, or complementary personality traits

Do NOT include a basis unless there is a clear, specific overlap in that category. A user can have 1, 2, or all 3 bases, but never 0.

Guidance: Treat goals/objectives alignment as part of the "career" basis.

Example format:
[
  {
    "personA": "profile-id-1",
    "personB": "profile-id-2", 
    "bases": ["career", "interests"],
      "summary": "They both listed mentorship as a goal; Sarah’s product lens maps to Mike’s engineering challenges, and both enjoy hiking — easy rapport and real cross‑functional value.",
    "panels": {
      "why": "Sarah and Mike both work in tech but in different areas - Sarah in product management and Mike in engineering. This cross-functional perspective could lead to valuable insights for both.",
      "activities": "Discuss the intersection of product and engineering, share experiences with agile methodologies, or plan a hiking trip since you both enjoy outdoor activities.",
      "deeper": "What's the most challenging aspect of bridging the gap between product vision and technical implementation in your experience?"
    }
  }
]
`
  }

  private buildProfileInsightsPrompt(profileA: ProfileData, profileB: ProfileData): string {
    return `
Generate networking insights for these two people:

Person A:
Name: ${profileA.first_name} ${profileA.last_name}
Job: ${profileA.job_title} at ${profileA.company}
What they do: ${profileA.what_do_you_do}
Location: ${profileA.location}
MBTI: ${profileA.mbti}
Enneagram: ${profileA.enneagram}
Networking Goals: ${profileA.networking_goals.join(', ')}
Hobbies: ${profileA.hobbies.join(', ')}
Expertise: ${profileA.expertise.join(', ')}

Person B:
Name: ${profileB.first_name} ${profileB.last_name}
Job: ${profileB.job_title} at ${profileB.company}
What they do: ${profileB.what_do_you_do}
Location: ${profileB.location}
MBTI: ${profileB.mbti}
Enneagram: ${profileB.enneagram}
Networking Goals: ${profileB.networking_goals.join(', ')}
Hobbies: ${profileB.hobbies.join(', ')}
Expertise: ${profileB.expertise.join(', ')}

Include the exact names of any overlapping hobbies, interests, networking goals, or expertise tags.
If there are none, highlight one complementary difference and what each can teach the other.
Keep the output concise and concrete as per the required JSON format.
`
  }

  private validateAndFormatMatches(matches: any[], profiles: ProfileData[]): MatchCandidate[] {
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const validMatches: MatchCandidate[] = []

    console.log('AI returned matches:', matches)
    console.log('Available profiles:', profiles.map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}` })))

    for (const match of matches) {
      if (!match.personA || !match.personB || !profileMap.has(match.personA) || !profileMap.has(match.personB)) {
        console.log('Skipping invalid match:', match)
        continue
      }

      if (match.personA === match.personB) {
        console.log('Skipping self-match:', match)
        continue // Skip self-matches
      }

      // Validate and filter bases to only include valid enum values and order with career first
      const validBases = ['career', 'interests', 'personality']
      const filteredBases = (match.bases || [])
        .map((b: string) => b.toLowerCase())
        .filter((basis: string) => validBases.includes(basis))
        .sort((a: string, b: string) => ['career','interests','personality'].indexOf(a) - ['career','interests','personality'].indexOf(b))

      validMatches.push({
        personA: match.personA,
        personB: match.personB,
        profile: profileMap.get(match.personB)!,
        bases: filteredBases.length > 0 ? filteredBases : ['career'],
        summary: match.summary || 'Start with goals, then layer in career context and shared interests.',
        panels: match.panels || {
          why: 'Begin with goals: if one wants something the other has done, compare notes.',
          activities: 'Do a quick 10‑minute swap of one tactic or resource each.',
          deeper: 'What drives you most in your current role?'
        }
      })
    }

    console.log('Valid matches after processing:', validMatches)
    return validMatches
  }

  private fallbackMatching(profiles: ProfileData[]): MatchCandidate[] {
    // Simple fallback matching based on basic criteria
    const matches: MatchCandidate[] = []
    
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const profileA = profiles[i]
        const profileB = profiles[j]
        
        const bases: string[] = []
        let score = 0

        // 1) Goals/objectives alignment (top priority)
        const goalsA = (profileA.networking_goals || []).map(g => g.toLowerCase())
        const goalsB = (profileB.networking_goals || []).map(g => g.toLowerCase())
        const sharedGoals = goalsA.filter(g => goalsB.includes(g))
        if (sharedGoals.length > 0) {
          if (!bases.includes('career')) bases.push('career')
          score += 0.5
        }

        // 2) Expertise & career context
        const hasCareerSignal = (profileA.company && profileB.company && profileA.company !== profileB.company) ||
          (profileA.job_title && profileB.job_title && profileA.job_title !== profileB.job_title)
        if (hasCareerSignal) {
          if (!bases.includes('career')) bases.push('career')
          score += 0.2
        }

        // 3) Interests & hobbies
        const commonHobbies = profileA.hobbies.filter(h => profileB.hobbies.includes(h))
        if (commonHobbies.length > 0) {
          bases.push('interests')
          score += 0.2
        }

        // 4) Personality
        if (profileA.mbti && profileB.mbti) {
          bases.push('personality')
          score += 0.1
        }

        if (score >= 0.5 && bases.length > 0) {
          const goalLead = sharedGoals[0]
          matches.push({
            profile: profileB,
            bases: Array.from(new Set(bases)).sort((a, b) => ['career','interests','personality'].indexOf(a) - ['career','interests','personality'].indexOf(b)),
            summary: goalLead
              ? `You both listed ${goalLead} — start there; then compare roles and any shared interests.`
              : `Start with goals; then compare roles, and use ${commonHobbies[0] || 'a shared topic'} as an icebreaker.`,
            panels: {
              why: goalLead
                ? `${profileA.first_name} and ${profileB.first_name} both came for ${goalLead}. That’s your opener.`
                : `Begin with what each of you wants from this event; look for a direct fit in the other’s experience or role.`,
              activities: commonHobbies.length > 0
                ? `Take a 10‑minute walk‑and‑talk and trade one tactic each; end by swapping a ${commonHobbies[0]} tip.`
                : `Do a quick 10‑minute swap: one resource or tactic each; compare how you prep for big days.`,
              deeper: 'What belief about your work did you update this year?'
            }
          })
        }
      }
    }

    return matches
  }

  private fallbackProfileInsights(profileA: ProfileData, profileB: ProfileData): {
    why: string
    activities: string
    deeper: string
  } {
    const sharedHobbies = profileA.hobbies.filter(h => profileB.hobbies.includes(h))
    const sharedExpertise = profileA.expertise.filter(e => profileB.expertise.includes(e))
    const sharedGoals = profileA.networking_goals.filter(g => profileB.networking_goals.includes(g))

    const hasOverlap = sharedHobbies.length > 0 || sharedExpertise.length > 0 || sharedGoals.length > 0

    const firstShared = (arr: string[]) => arr.slice(0, 2).join(', ')
    const aName = profileA.first_name
    const bName = profileB.first_name
    const aFirstGoal = profileA.networking_goals[0]
    const bFirstGoal = profileB.networking_goals[0]

    const why = sharedGoals.length > 0
      ? `You both came for ${firstShared(sharedGoals)} — start there.`
      : (aFirstGoal
        ? `${aName} wants ${aFirstGoal}; ${bName} has relevant experience at ${profileB.company || (profileB.job_title || 'their role')}.`
        : (bFirstGoal
          ? `${bName} wants ${bFirstGoal}; ${aName} has relevant experience at ${profileA.company || (profileA.job_title || 'their role')}.`
          : `${aName} and ${bName} work in complementary areas — a quick exchange could surface useful tactics.`))

    const activities = hasOverlap
      ? `Take a 10‑minute walk‑and‑talk; trade one tactic each related to ${firstShared(sharedGoals.length ? sharedGoals : sharedExpertise.length ? sharedExpertise : sharedHobbies)}.`
      : `Do a quick 10‑minute swap: ${aName} shares one tactic from ${profileA.company || 'your team'}; ${bName} shares a recent win from ${profileB.company || 'your team'}; swap one resource each.`

    const deeper = hasOverlap
      ? `What’s a recent moment where ${firstShared(sharedGoals.length ? sharedGoals : sharedExpertise)} made a real difference for you?`
      : `What could someone in ${profileA.job_title || 'your role'} learn from ${profileB.job_title || 'their role'} this month?`

    return { why, activities, deeper }
  }
}
