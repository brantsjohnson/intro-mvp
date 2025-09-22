import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, this should be server-side only
})

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
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an expert networking and matchmaking AI. Your job is to create meaningful professional connections between event attendees based on their profiles, career goals, interests, and personality types.

Key principles:
1. Focus on quality over quantity - create 1-3 strong matches per person
2. Consider career complementarity, shared interests, and personality compatibility
3. Respect existing matches - only suggest new ones if they're significantly better
4. Be specific and actionable in your reasoning
5. Avoid generic or vague suggestions
6. Consider networking goals and what each person is looking for

Return your response as a JSON array of match objects.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
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
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an expert networking coach. Generate three specific, actionable insights for two people who have been matched at a networking event.

Your response should be a JSON object with three fields:
- "why": A compelling reason they should meet (1-2 sentences)
- "activities": Specific activities or conversation topics they might enjoy (2-3 suggestions)
- "deeper": One thoughtful, open-ended question to spark meaningful conversation

Be specific, professional, and avoid generic advice. Focus on their actual profiles, interests, and goals.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
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
Please analyze these event attendees and create meaningful matches. Each person should get 1-3 strong matches maximum.

${profilesText}

${existingMatchesText}

Consider these matching criteria:
1. Career complementarity (different but related roles, cross-industry insights)
2. Shared interests and hobbies
3. Personality compatibility (MBTI/Enneagram)
4. Networking goals alignment
5. Geographic proximity (if relevant)
6. Expertise overlap or complementarity

Return a JSON array of match objects. Each match should have:
- "personA": profile ID
- "personB": profile ID  
- "bases": array of match reasons (e.g., ["career", "interests", "personality"])
- "summary": one sentence explaining why they should meet
- "panels": object with "why", "activities", "deeper" fields

Example format:
[
  {
    "personA": "profile-id-1",
    "personB": "profile-id-2", 
    "bases": ["career", "interests"],
    "summary": "Both work in complementary tech roles and share a passion for outdoor activities, making them ideal networking partners.",
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

Generate three specific insights that will help them connect meaningfully at this networking event.
`
  }

  private validateAndFormatMatches(matches: any[], profiles: ProfileData[]): MatchCandidate[] {
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const validMatches: MatchCandidate[] = []

    for (const match of matches) {
      if (!match.personA || !match.personB || !profileMap.has(match.personA) || !profileMap.has(match.personB)) {
        continue
      }

      if (match.personA === match.personB) {
        continue // Skip self-matches
      }

      validMatches.push({
        profile: profileMap.get(match.personB)!,
        bases: match.bases || [],
        summary: match.summary || 'Great networking opportunity',
        panels: match.panels || {
          why: 'You have complementary backgrounds and interests.',
          activities: 'Discuss your shared interests and professional experiences.',
          deeper: 'What drives you most in your current role?'
        }
      })
    }

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

        // Check for shared hobbies
        const commonHobbies = profileA.hobbies.filter(h => profileB.hobbies.includes(h))
        if (commonHobbies.length > 0) {
          bases.push('interests')
          score += 0.3
        }

        // Check for career complementarity
        if (profileA.company !== profileB.company) {
          bases.push('career')
          score += 0.4
        }

        // Check for personality compatibility
        if (profileA.mbti && profileB.mbti) {
          bases.push('personality')
          score += 0.3
        }

        if (score > 0.5 && bases.length > 0) {
          matches.push({
            profile: profileB,
            bases,
            summary: `Great networking opportunity based on ${bases.join(' and ')} compatibility.`,
            panels: {
              why: `${profileA.first_name} and ${profileB.first_name} have complementary backgrounds that could lead to valuable professional connections.`,
              activities: 'Discuss your shared interests and professional experiences.',
              deeper: 'What drives you most in your current role?'
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
    return {
      why: `${profileA.first_name} and ${profileB.first_name} have complementary backgrounds that could lead to valuable professional connections.`,
      activities: 'Discuss your shared interests and professional experiences.',
      deeper: 'What drives you most in your current role?'
    }
  }
}
