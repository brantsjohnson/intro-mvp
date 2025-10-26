// Extracted scoring logic for scalable matchmaking
// This module contains the core scoring algorithm that can be used
// both in the current Next.js API and the new Supabase Edge Function

export type Weights = {
  goals: number
  career: number
  personality: number
  interests: number
}

export const DEFAULT_WEIGHTS: Weights = {
  goals: 5,
  career: 3,
  personality: 1,
  interests: 1,
}

export type Candidate = {
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

export type ScoredMatch = {
  match_user_id: string
  score: number
  bases: string[]
}

export type MatchPanels = {
  why_meet: string
  shared_activities: string[]
  dive_deeper: string
  summary: string
}

/**
 * Tokenize text for comparison
 */
export function tokenize(s?: string | null): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Calculate overlap between two arrays (case-insensitive)
 */
export function overlap(a: string[] = [], b: string[] = []): number {
  const setB = new Set(b.map((x) => x.toLowerCase()))
  let n = 0
  for (const x of a) if (setB.has(x.toLowerCase())) n++
  return n
}

/**
 * Score a single candidate against a user
 */
export function scoreCandidate(
  me: Candidate, 
  them: Candidate, 
  weights: Weights
): { score: number; bases: string[] } {
  const bases: string[] = []
  let score = 0

  // Goals overlap
  const meGoals = (me.networking_goals || []).map(String)
  const themTags = (them.expertise_tags || []).map(String)
  const goalHit = overlap(meGoals, themTags)
  if (goalHit > 0) {
    score += goalHit * weights.goals
    bases.push('goals')
  }

  // Career similarity (title/company/what_do_you_do tokens)
  const meCareer = [
    ...tokenize(me.job_title),
    ...tokenize(me.company),
    ...tokenize(me.what_do_you_do),
  ]
  const themCareer = [
    ...tokenize(them.job_title),
    ...tokenize(them.company),
    ...tokenize(them.what_do_you_do),
  ]
  const careerHit = overlap(meCareer, themCareer)
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
  const hobbyHit = overlap((me.hobbies || []).map(String), (them.hobbies || []).map(String))
  if (hobbyHit > 0) {
    score += hobbyHit * weights.interests
    bases.push('interests')
  }

  return { score, bases }
}

/**
 * Score all candidates for a user and return top K matches
 */
export function scoreCandidatesForUser(
  me: Candidate,
  candidates: Candidate[],
  weights: Weights = DEFAULT_WEIGHTS,
  topK: number = 3
): ScoredMatch[] {
  return candidates
    .map((candidate) => {
      const { score, bases } = scoreCandidate(me, candidate, weights)
      return {
        match_user_id: candidate.user_id,
        score,
        bases
      }
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * Bump rule: only replace current matches if new set improves the worst score
 */
export function mergeWithBumpRule(
  current: ScoredMatch[] = [], 
  incoming: ScoredMatch[], 
  k: number = 3
): ScoredMatch[] {
  const cur = [...current].sort((a,b) => b.score - a.score).slice(0, k)
  const inc = [...incoming].sort((a,b) => b.score - a.score).slice(0, k)
  
  // If we don't have enough current matches, use incoming
  if (cur.length < k) return inc.slice(0, k)
  
  // If incoming best score is better than current worst, merge and re-rank
  if (inc[0]?.score > (cur[k-1]?.score ?? -Infinity)) {
    // Build combined set, dedupe by match_user_id, keep highest scores, take top k
    const map = new Map<string, number>()
    const combined = [...cur, ...inc]
    combined.forEach(m => {
      const key = String(m.match_user_id)
      map.set(key, Math.max(map.get(key) ?? -Infinity, m.score))
    })
    return Array.from(map.entries())
      .map(([match_user_id, score]) => ({ match_user_id, score, bases: [] }))
      .sort((a,b) => b.score - a.score)
      .slice(0, k)
  }
  
  // No improvement, keep current matches
  return cur.map(({ match_user_id, score, bases }) => ({ match_user_id, score, bases }))
}

/**
 * Check if matches have changed (for versioning)
 */
export function hasChanged(a: ScoredMatch[] = [], b: ScoredMatch[] = []): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    if (String(a[i].match_user_id) !== String(b[i].match_user_id)) return true
  }
  return false
}

/**
 * Build a summary from the "why_meet" text
 */
export function buildSummaryFromWhy(why: string): string {
  const text = (why || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const parts = text.split(/(?<=[\.!\?])\s+/).filter(Boolean)
  const take = Math.min(3, Math.max(2, parts.length))
  return parts.slice(0, take).join(' ').trim()
}

/**
 * Normalize pair for consistent ordering
 */
export function normalizePair(a: string, b: string): { a: string; b: string } {
  return a < b ? { a, b } : { a: b, b: a }
}
