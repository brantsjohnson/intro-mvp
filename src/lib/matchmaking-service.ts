import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

type Weights = {
  goals: number
  career: number
  personality: number
  interests: number
}

const DEFAULT_WEIGHTS: Weights = {
  goals: 5,
  career: 3,
  personality: 1,
  interests: 1,
}

type Member = {
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
  event_id: string
  event_name: string
  event_code: string
  matchmaking_enabled: boolean
  joined_at: string
  is_present: boolean
  full_name: string | null
  job_description: string | null
}

export type MatchPanels = {
  why_meet: string
  shared_activities: string[]
  dive_deeper: string
  summary: string
}

export type ScoredCandidate = {
  candidate: Member
  score: number
  bases: string[]
  panels: MatchPanels
  summary: string
}

export class MatchmakingService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async getEventIdFromCode(eventCode: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('events')
      .select('id')
      .eq('code', eventCode.toUpperCase())
      .maybeSingle()
    if (error || !data) return null
    return data.id
  }

  async loadMember(eventId: string, userId: string): Promise<Member | null> {
    const { data, error } = await this.supabase
      .from('all_events_members')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return null
    return data as Member
  }

  async loadCandidates(eventId: string, excludeUserId: string): Promise<Member[]> {
    const { data, error } = await this.supabase
      .from('all_events_members')
      .select('*')
      .eq('event_id', eventId)
      .neq('user_id', excludeUserId)
    if (error || !data) return []
    return data as Member[]
  }

  private tokenize(s?: string | null): string[] {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  }

  private overlap(a: string[] = [], b: string[] = []): number {
    const setB = new Set(b.map((x) => x.toLowerCase()))
    let n = 0
    for (const x of a) if (setB.has(x.toLowerCase())) n++
    return n
  }

  private scoreCandidate(me: Member, them: Member, weights: Weights): { score: number; bases: string[] } {
    const bases: string[] = []
    let score = 0

    // Goals overlap
    const meGoals = (me.networking_goals || []).map(String)
    const themTags = (them.expertise_tags || []).map(String)
    const goalHit = this.overlap(meGoals, themTags)
    if (goalHit > 0) {
      score += goalHit * weights.goals
      bases.push('goals')
    }

    // Career similarity (title/company/what_do_you_do tokens)
    const meCareer = [
      ...this.tokenize(me.job_title),
      ...this.tokenize(me.company),
      ...this.tokenize(me.what_do_you_do),
    ]
    const themCareer = [
      ...this.tokenize(them.job_title),
      ...this.tokenize(them.company),
      ...this.tokenize(them.what_do_you_do),
    ]
    const careerHit = this.overlap(meCareer, themCareer)
    if (careerHit > 0) {
      score += Math.min(careerHit, 5) * weights.career
      bases.push('career')
    }

    // Personality simple compatibility (shared letters or same enneagram core)
    const meMbti = (me.mbti || '').toUpperCase()
    const themMbti = (them.mbti || '').toUpperCase()
    const mbtiShared = Array.from(new Set(meMbti.split(''))).filter((c) => themMbti.includes(c)).length
    if (mbtiShared >= 2) {
      score += weights.personality
      bases.push('personality')
    }
    const meEn = (me.enneagram || '').replace(/[^0-9]/g, '')
    const themEn = (them.enneagram || '').replace(/[^0-9]/g, '')
    if (meEn && themEn && meEn === themEn) {
      score += weights.personality
      if (!bases.includes('personality')) bases.push('personality')
    }

    // Interests overlap (hobbies)
    const hobbyHit = this.overlap((me.hobbies || []).map(String), (them.hobbies || []).map(String))
    if (hobbyHit > 0) {
      score += hobbyHit * weights.interests
      bases.push('interests')
    }

    return { score, bases }
  }

  private openaiOrNull(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY
    if (!key) return null
    return new OpenAI({ apiKey: key })
  }

  private getModel(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o'
  }

  private buildInsightPrompt(me: Member, them: Member, weights: Weights): string {
    // System Prompt — Human, Insightful Matches (v4)
    return [
      'Context: Past outputs were too short, generic, and overly business-focused. Fix this by producing human, specific, insight-rich matches that help two people want to talk.',
      'Role: You are a perceptive, friendly connector—the sharp friend who sees why two people would actually click (professionally and personally).',
      'Inputs you may use: networking goals, career/what they do, job title/company/location, expertise tags, hobbies & interest details, personality (MBTI/Enneagram), "who they want to meet" text, event context if present. If something is missing, ignore it; do not invent facts.',
      `Weights (internal guidance) → goals:${weights.goals} career:${weights.career} personality:${weights.personality} interests:${weights.interests}.`,
      'Bases to show: Only include true bases among ["career","interests","personality"]. Min 1, max 3. Your prose must provide evidence for each base.',
      'Sections to generate (JSON ONLY):',
      '{"summary":"1 sentence capturing the core connection without job titles","why_meet":"3–4 sentences","shared_activities":["2–3 unique sentences specific to this pair"],"dive_deeper":"1 personal, vulnerable question"}',
      'Summary: One powerful sentence that captures the essence of why they should connect. Focus on the core value without mentioning job titles or companies. Be specific and compelling.',
      'Why You Two Should Meet: Start from networking goals (if any) and clearly state the bridge. Add a non-obvious angle from personality/hobbies/career style. Sound human; no brochure talk.',
      'Activities You Might Enjoy: Give 2–3 concrete, unique ideas specific to this pair. Consider their hobbies, location, personalities. Write as sentences, not bullets; no symbols like + or •. Avoid generic suggestions like "grab coffee" or "trade shows".',
      'Where To Dive Deeper: Offer one personal, vulnerable question that invites real stories. Focus on mentors, life-changing moments, personal growth, or meaningful experiences. Make it intimate and conversational, like something a close friend would ask. Avoid interview-style questions.',
      'Style & language rules: Do not truncate; respect sentence counts. Tone is friendly, plain, specific. Call out concerts/pets/TV/food when relevant. Read between the lines (roles as clues).',
      'BANNED words/phrases: networking, collaborate/collaboration, synergy, leverage, alignment, industry insights, engage/engagement, ecosystem, thought leadership, circle back, value-add, unlock, go-to-market ideas.',
      'BANNED generic activities: "grab coffee", "trade shows", "compare notes", "brainstorm", "discuss", "exchange ideas".',
      'Formatting: Natural sentences only. No bullets, plus signs, or pseudo-JSON.',
      'If data is thin: still write the sections with required sentence counts; be honest and simple, but never generic.',
      'QA: Show only true bases, Summary is 1 sentence without job titles, Why is 3–4 sentences grounded in goals + a non-obvious angle, Activities are 2–3 unique sentences specific to this pair, Dive Deeper is 1 personal vulnerable question, no banned jargon, mention at least one hobby/personality detail when available.',
      'Viewer:',
      JSON.stringify({
        full_name: me.full_name,
        job_title: me.job_title,
        company: me.company,
        what_do_you_do: me.what_do_you_do,
        networking_goals: me.networking_goals,
        mbti: me.mbti,
        enneagram: me.enneagram,
        hobbies: me.hobbies,
        expertise_tags: me.expertise_tags,
      }),
      'Suggested:',
      JSON.stringify({
        full_name: them.full_name,
        job_title: them.job_title,
        company: them.company,
        what_do_you_do: them.what_do_you_do,
        networking_goals: them.networking_goals,
        mbti: them.mbti,
        enneagram: them.enneagram,
        hobbies: them.hobbies,
        expertise_tags: them.expertise_tags,
      }),
    ].join('\n')
  }

  private async generatePanels(me: Member, them: Member, weights: Weights): Promise<MatchPanels> {
    const client = this.openaiOrNull()
    if (!client) {
      // Deterministic fallback that references concrete fields so outputs differ per pair
      const viewerGoal = (me.networking_goals || [])[0] || 'your priority'
      const theirSkill = (them.expertise_tags || [])[0] || (them.what_do_you_do || 'their experience')
      const hobby = ((me.hobbies || []).find(h => (them.hobbies || []).includes(h))) || 'a session you both find useful'
      return {
        why_meet: `${me.full_name || 'You'} is focused on ${viewerGoal}, and ${them.full_name || 'they'} brings ${theirSkill}. Given your roles (${me.job_title || 'your role'} and ${them.job_title || 'their role'}) there's clear room to trade tactics and intros. Personality overlap hints you'll click—keep it practical and human.`,
        shared_activities: [`Trade recs for underrated local food spots`, `Swap notes on ${theirSkill.toString().toLowerCase()}`, `Plan ${hobby.toString().toLowerCase()}`],
        dive_deeper: 'When has your natural style made things easier—and when did it get in the way?',
        summary: 'They share complementary focus areas and could learn from each other\'s different approaches.'
      }
    }

    const prompt = this.buildInsightPrompt(me, them, weights)
    const res = await client.chat.completions.create({
      model: this.getModel(),
      messages: [
        { role: 'system', content: 'Generate helpful, specific, human outputs; avoid boilerplate.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.95,
      presence_penalty: 0.4,
      frequency_penalty: 0.7,
      max_tokens: 700,
    })
    const text = res.choices?.[0]?.message?.content || '{}'

    const tryParse = (t: string) => {
      try { return JSON.parse(t) } catch { return null }
    }

    let parsed = tryParse(text)
    if (!parsed) {
      // Attempt to extract JSON block if model wrapped in fences or prefixed text
      const match = text.match(/\{[\s\S]*\}/)
      if (match) parsed = tryParse(match[0])
    }

    if (!parsed) {
      return {
        why_meet: text.slice(0, 300),
        shared_activities: ['Compare favorite shows', 'Trade local food spots', 'Brainstorm a dream event'],
        dive_deeper: 'What would make this week feel genuinely worthwhile for you?',
        summary: 'They share common interests and could learn from each other\'s experiences.'
      }
    }

    let panels: MatchPanels = {
      why_meet: String(parsed.why_meet || '').trim(),
      shared_activities: Array.isArray(parsed.shared_activities) ? parsed.shared_activities.slice(0, 3) : [],
      dive_deeper: String(parsed.dive_deeper || '').trim(),
      summary: String(parsed.summary || '').trim(),
    }

    const validated = await this.validateAndRepairPanels(client, me, them, panels)
    return validated
  }

  private sentenceCount(text: string): number {
    const s = (text || '').replace(/\s+/g, ' ').trim()
    if (!s) return 0
    return (s.match(/[\.\?\!](\s|$)/g) || []).length || 1
  }

  private containsBanned(text: string): boolean {
    const banned = [
      'networking', 'collaborate', 'collaboration', 'synergy', 'leverage', 'alignment', 'industry insights',
      'engage', 'engagement', 'ecosystem', 'thought leadership', 'circle back', 'value-add', 'unlock', 'go-to-market ideas'
    ]
    const t = (text || '').toLowerCase()
    return banned.some(w => t.includes(w))
  }

  private async validateAndRepairPanels(client: OpenAI, me: Member, them: Member, panels: MatchPanels): Promise<MatchPanels> {
    const summaryOk = this.sentenceCount(panels.summary) === 1 && panels.summary.length > 20
    const whyOk = this.sentenceCount(panels.why_meet) >= 3
    const actsOk = panels.shared_activities && panels.shared_activities.length >= 2
    const actsAsSentences = Array.isArray(panels.shared_activities) && panels.shared_activities.every(a => /[\.\!\?]$/.test(String(a).trim()))
    const actsUnique = Array.isArray(panels.shared_activities) && !panels.shared_activities.some(a => 
      String(a).toLowerCase().includes('grab coffee') || 
      String(a).toLowerCase().includes('trade shows') ||
      String(a).toLowerCase().includes('compare notes')
    )
    const deepOk = this.sentenceCount(panels.dive_deeper) >= 1
    const noBanned = !this.containsBanned(panels.summary + ' ' + panels.why_meet + ' ' + panels.dive_deeper + ' ' + (panels.shared_activities || []).join(' '))

    console.log('Validation check:', { summaryOk, whyOk, actsOk, actsAsSentences, actsUnique, deepOk, noBanned })
    console.log('Current panels:', JSON.stringify(panels, null, 2))

    if (summaryOk && whyOk && actsOk && actsAsSentences && actsUnique && deepOk && noBanned) return panels

    // Repair pass
    const repair = await client.chat.completions.create({
      model: this.getModel(),
      messages: [
        { role: 'system', content: 'You are revising content to meet strict QA. Keep it human, specific, and follow the exact sentence counts. No bullets, no symbols.' },
        { role: 'user', content: [
          'Revise this JSON to meet the rules.',
          'Rules:',
          '- summary: 1 sentence capturing the core connection without job titles, be specific and compelling.',
          '- why_meet: 3-4 sentences, start from viewer goals, add non-obvious angle from personality/hobbies/career style, no jargon.',
          '- shared_activities: 2-3 unique sentences specific to this pair, avoid generic suggestions like "grab coffee" or "trade shows".',
          '- dive_deeper: 1 personal, vulnerable question that invites real stories, not interview-style.',
          '- BANNED words: networking, collaborate/collaboration, synergy, leverage, alignment, industry insights, engage/engagement, ecosystem, thought leadership, circle back, value-add, unlock, go-to-market ideas.',
          '- BANNED generic activities: "grab coffee", "trade shows", "compare notes", "brainstorm", "discuss", "exchange ideas".',
          'Viewer:',
          JSON.stringify({
            full_name: me.full_name, job_title: me.job_title, company: me.company, what_do_you_do: me.what_do_you_do,
            networking_goals: me.networking_goals, mbti: me.mbti, enneagram: me.enneagram, hobbies: me.hobbies, expertise_tags: me.expertise_tags,
          }),
          'Suggested:',
          JSON.stringify({
            full_name: them.full_name, job_title: them.job_title, company: them.company, what_do_you_do: them.what_do_you_do,
            networking_goals: them.networking_goals, mbti: them.mbti, enneagram: them.enneagram, hobbies: them.hobbies, expertise_tags: them.expertise_tags,
          }),
          'Draft:', JSON.stringify(panels),
          'Return JSON only.'
        ].join('\n') },
      ],
      temperature: 0.9,
      presence_penalty: 0.4,
      frequency_penalty: 0.7,
      max_tokens: 700,
    })
    const t = repair.choices?.[0]?.message?.content || ''
    try {
      const j = JSON.parse(t)
      const repaired: MatchPanels = {
        why_meet: String(j.why_meet || '').trim(),
        shared_activities: Array.isArray(j.shared_activities) ? j.shared_activities.slice(0, 3) : [],
        dive_deeper: String(j.dive_deeper || '').trim(),
        summary: String(j.summary || '').trim(),
      }
      // Final soft guard
      if (!repaired.shared_activities.length) {
        repaired.shared_activities = ['Trade favorite shows or documentaries and what hooked you.', 'Grab coffee and compare what each of you is building this month.']
      }
      if (!repaired.why_meet) {
        repaired.why_meet = 'You share complementary focus areas and a people-first style. Start with honest goals, then compare how each of you approaches tough decisions.'
      }
      if (!repaired.summary) {
        repaired.summary = 'They share complementary skills and could learn from each other\'s different approaches.'
      }
      if (!repaired.dive_deeper) {
        repaired.dive_deeper = 'When did your first instinct about what people would care about turn out wrong, and what changed next?'
      }
      return repaired
    } catch {
      return panels
    }
  }

  async computeTopMatchesForUser(eventId: string, userId: string, weights: Partial<Weights> = {}): Promise<ScoredCandidate[]> {
    const w = { ...DEFAULT_WEIGHTS, ...weights }
    const me = await this.loadMember(eventId, userId)
    if (!me) return []
    const candidates = await this.loadCandidates(eventId, userId)

    const scored = candidates
      .map((c) => {
        const s = this.scoreCandidate(me, c, w)
        return { candidate: c, score: s.score, bases: s.bases }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    const withInsights: ScoredCandidate[] = []
    for (const s of scored) {
      const panels = await this.generatePanels(me, s.candidate, w)
      const summary = panels.why_meet
      withInsights.push({ ...s, panels, summary })
    }
    return withInsights
  }

  private normalizePair(a: string, b: string): { a: string; b: string } {
    return a < b ? { a, b } : { a: b, b: a }
  }

  private buildSummaryFromWhy(why: string): string {
    const text = (why || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    const parts = text.split(/(?<=[\.!\?])\s+/).filter(Boolean)
    const take = Math.min(3, Math.max(2, parts.length))
    return parts.slice(0, take).join(' ').trim()
  }

  async upsertUserMatches(eventId: string, userId: string, ranked: ScoredCandidate[]): Promise<void> {
    // Delete existing matches for this user in this event
    const { error: deleteError } = await this.supabase
      .from('matches')
      .delete()
      .eq('event_id', eventId)
      .or(`a.eq.${userId},b.eq.${userId}`)

    if (deleteError) {
      console.error('Error deleting existing matches:', deleteError)
      throw new Error(`Failed to delete existing matches: ${deleteError.message}`)
    }

    // Insert new matches for the user
    const matchInserts = ranked.map(item => {
      const pair = this.normalizePair(userId, item.candidate.user_id)
      return {
        event_id: eventId,
        a: pair.a,
        b: pair.b,
        bases: item.bases,
        summary: item.panels.summary || this.buildSummaryFromWhy(item.panels.why_meet),
        panels: {
          why_meet: item.panels.why_meet,
          shared_activities: item.panels.shared_activities,
          dive_deeper: item.panels.dive_deeper,
        },
        is_system: true,
      }
    })

    console.log('Attempting to insert matches:', JSON.stringify(matchInserts, null, 2))
    
    const { data, error } = await this.supabase
      .from('matches')
      .insert(matchInserts)
      .select()
    
    if (error) {
      console.error('Match insert error:', error)
      throw new Error(`Failed to insert matches: ${error.message}`)
    }
    
    console.log('Successfully inserted matches:', data)
  }
}


