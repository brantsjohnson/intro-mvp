import { DEFAULT_RULE_WEIGHTS, MatchingRuleWeights, HOBBY_ALIASES, ALIGNED_HOBBY_CATEGORIES, ADJACENT_FUNCTIONS } from "@/lib/matching-rules"
import { ProfileData } from "@/lib/ai-service"

type Basis = "career" | "interests" | "personality"

function toLowerArray(values: string[] | null | undefined): string[] {
  return (values || []).map(v => v.toLowerCase())
}

function inferFunctionArea(profile: ProfileData): string {
  const haystack = [profile.job_title, profile.what_do_you_do].filter(Boolean).join(" ").toLowerCase()
  if (/(marketing|growth|brand|demand gen|performance)/.test(haystack)) return "marketing"
  if (/(sales|account executive|seller|bd|business development|revenue)/.test(haystack)) return "sales"
  if (/(product manager|product management|pm|product lead|product)/.test(haystack)) return "product"
  if (/(engineer|developer|software|cto|technical|devops)/.test(haystack)) return "engineering"
  if (/(design|designer|ux|ui|creative)/.test(haystack)) return "design"
  if (/(finance|cfo|accounting|fp&a|financial)/.test(haystack)) return "finance"
  if (/(operations|ops|coo|logistics|supply)/.test(haystack)) return "operations"
  if (/(data|analytics|bi|ml|ai)/.test(haystack)) return "data"
  if (/(people|hr|talent|recruit)/.test(haystack)) return "people"
  return "other"
}

function sameOrAdjacentFunctions(a: string, b: string): boolean {
  if (a === b) return true
  return ADJACENT_FUNCTIONS.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

function deriveCareerStage(profile: ProfileData): "early" | "mid" | "exec" | "unknown" {
  const t = [profile.job_title, profile.what_do_you_do].filter(Boolean).join(" ").toLowerCase()
  if (/(intern|assistant|junior|jr)/.test(t)) return "early"
  if (/(manager|senior|lead|ic|individual contributor)/.test(t)) return "mid"
  if (/(head|director|vp|chief|cxo|founder|owner|principal)/.test(t)) return "exec"
  return "unknown"
}

function tokenize(values: string[]): string[] {
  return values.flatMap(v => v.split(/[\s,/;&]+/)).map(s => s.trim().toLowerCase()).filter(Boolean)
}

function hasGoalToExpertiseBridge(a: ProfileData, b: ProfileData): boolean {
  const goalsA = tokenize(toLowerArray(a.networking_goals))
  const goalsB = tokenize(toLowerArray(b.networking_goals))
  const expA = tokenize(toLowerArray(a.expertise))
  const expB = tokenize(toLowerArray(b.expertise))
  const matchAB = goalsA.some(g => expB.includes(g))
  const matchBA = goalsB.some(g => expA.includes(g))
  return matchAB || matchBA
}

function potentialCollab(a: ProfileData, b: ProfileData): boolean {
  const textA = [a.job_title, a.company, a.what_do_you_do].filter(Boolean).join(" ").toLowerCase()
  const textB = [b.job_title, b.company, b.what_do_you_do].filter(Boolean).join(" ").toLowerCase()
  const isAgencyA = /(agency|studio|consult|freelance)/.test(textA)
  const isAgencyB = /(agency|studio|consult|freelance)/.test(textB)
  const isCMOorMarketingLead = /(cmo|marketing (lead|head|director|vp))/.test(textA) || /(cmo|marketing (lead|head|director|vp))/.test(textB)
  const buildsSaaS = /(saas|platform|product)/.test(textA) || /(saas|platform|product)/.test(textB)
  return (isAgencyA && isCMOorMarketingLead) || (isAgencyB && isCMOorMarketingLead) || (buildsSaaS && (isAgencyA || isAgencyB))
}

function bothSeekingSameDomain(a: ProfileData, b: ProfileData): boolean {
  const gA = tokenize(toLowerArray(a.networking_goals))
  const gB = tokenize(toLowerArray(b.networking_goals))
  if (gA.length === 0 || gB.length === 0) return false
  const setB = new Set(gB)
  return gA.some(x => setB.has(x))
}

function buyerVendorBridge(a: ProfileData, b: ProfileData): boolean {
  const textA = [a.job_title, a.what_do_you_do].filter(Boolean).join(" ").toLowerCase()
  const textB = [b.job_title, b.what_do_you_do].filter(Boolean).join(" ").toLowerCase()
  const isBuyerA = /(cmo|vp marketing|head of marketing|procurement|buyer|decision[- ]?maker)/.test(textA)
  const isBuyerB = /(cmo|vp marketing|head of marketing|procurement|buyer|decision[- ]?maker)/.test(textB)
  const seeksClientsA = tokenize(toLowerArray(a.networking_goals)).some(t => /(client|customers|pipeline|acquisition)/.test(t))
  const seeksClientsB = tokenize(toLowerArray(b.networking_goals)).some(t => /(client|customers|pipeline|acquisition)/.test(t))
  return (seeksClientsA && isBuyerB) || (seeksClientsB && isBuyerA)
}

function usefulContrastScore(aFunc: string, bFunc: string): number {
  if (aFunc === bFunc) return 0
  // Technical vs creative heuristic
  const technical = new Set(["engineering", "data"])
  const creative = new Set(["marketing", "design", "product"])
  const aTech = technical.has(aFunc), bTech = technical.has(bFunc)
  const aCreative = creative.has(aFunc), bCreative = creative.has(bFunc)
  if ((aTech && bCreative) || (bTech && aCreative)) return 1
  // Different company sizes not available; treat different functions as mild contrast
  return 0.5
}

function mapHobbyToCategory(h: string): string {
  const key = h.toLowerCase()
  return HOBBY_ALIASES[key] || h
}

function alignedHobbiesCategories(aHobbies: string[], bHobbies: string[]): boolean {
  const aCats = new Set(aHobbies.map(mapHobbyToCategory))
  const bCats = new Set(bHobbies.map(mapHobbyToCategory))
  return ALIGNED_HOBBY_CATEGORIES.some(([x, y]) => (aCats.has(x) && bCats.has(y)) || (aCats.has(y) && bCats.has(x)))
}

export interface PairScore {
  bases: Basis[]
  careerScore: number
  interestsScore: number
  totalScore: number
  summary: string
  panels: { why: string; activities: string; deeper: string }
}

export function scorePair(a: ProfileData, b: ProfileData, weights: MatchingRuleWeights = DEFAULT_RULE_WEIGHTS): PairScore | null {
  const aFunc = inferFunctionArea(a)
  const bFunc = inferFunctionArea(b)
  const aStage = deriveCareerStage(a)
  const bStage = deriveCareerStage(b)
  const aHobbies = toLowerArray(a.hobbies)
  const bHobbies = toLowerArray(b.hobbies)

  // Career components
  let career = 0
  // NORTH STAR: goals/objectives first
  if (hasGoalToExpertiseBridge(a, b)) career += weights.career.goalToExpertise
  if (bothSeekingSameDomain(a, b)) career += weights.career.bothSeekingSame
  if (buyerVendorBridge(a, b)) career += weights.career.buyerVendor
  if (sameOrAdjacentFunctions(aFunc, bFunc)) career += weights.career.adjacentFunctions
  if (aStage !== "unknown" && aStage === bStage) career += weights.career.sharedCareerStage
  if (potentialCollab(a, b)) career += weights.career.potentialCollaborations
  career += weights.career.usefulContrasts * usefulContrastScore(aFunc, bFunc)

  // Interests components
  let interests = 0
  const sharedHobbies = aHobbies.filter(h => bHobbies.includes(h))
  if (sharedHobbies.length > 0) {
    // Cap contribution from shared hobbies to avoid over-weighting long lists
    const capped = Math.min(sharedHobbies.length, 3)
    interests += weights.interests.sharedHobbies * (capped / 3)
  }
  if (alignedHobbiesCategories(aHobbies, bHobbies)) interests += weights.interests.alignedCategories

  // Simple personality-adjacent hobby signal
  if (aHobbies.some(h => /(vinyl|improv|marathon)/.test(h)) || bHobbies.some(h => /(vinyl|improv|marathon)/.test(h))) {
    interests += weights.interests.personalityAdjacent
  }

  const bases: Basis[] = []
  if (career >= weights.thresholds.careerMin) bases.push("career")
  if (interests >= weights.thresholds.interestsMin) bases.push("interests")
  const total = career + interests
  if (bases.length === 0 || total < weights.thresholds.pairTotalMin) return null

  // Build concise insights
  const aName = a.first_name
  const bName = b.first_name
  const whyParts: string[] = []
  if (bases.includes("career")) {
    if (hasGoalToExpertiseBridge(a, b)) {
      whyParts.push(`You want what ${bName} has done — start there`)
    } else if (buyerVendorBridge(a, b)) {
      whyParts.push(`${aName} wants clients; ${bName} is a buyer — quick win`)
    } else if (bothSeekingSameDomain(a, b)) {
      whyParts.push(`You both came looking for the same thing — trade what works`)
    } else {
      whyParts.push(`${aName} (${aFunc}) and ${bName} (${bFunc}) see the same problem from different seats`)
    }
  }
  if (bases.includes("interests") && sharedHobbies.length > 0) {
    const list = sharedHobbies.slice(0, 2).join(", ")
    whyParts.push(`you both enjoy ${list}`)
  }
  const why = whyParts.length > 0 ? whyParts.join("; ") + "." : `${aName} and ${bName} have a practical overlap.`

  const activities = bases.includes("interests") && sharedHobbies.length > 0
    ? `Trade ${sharedHobbies[0]} recs, then each share one quick win from this year.`
    : `Do a 5‑minute swap: one tactic that worked lately, and one you’re testing next.`

  const deeper = bases.includes("career")
    ? `What’s one play you refined this year and why did it stick?`
    : `What hobby taught you something useful about how you work?`

  const summary = bases.includes("career")
    ? `${aName} can learn from ${bName}’s path; ${bases.includes("interests") ? "shared interests make it easy to start." : "short, tactical chat recommended."}`
    : `Easy rapport via shared interests; swap quick ideas and keep it light.`

  return {
    bases,
    careerScore: career,
    interestsScore: interests,
    totalScore: total,
    summary,
    panels: { why, activities, deeper }
  }
}

export function scoreAllPairs(profiles: ProfileData[], weights: MatchingRuleWeights = DEFAULT_RULE_WEIGHTS) {
  const results: Array<{ personA: string; personB: string; bases: Basis[]; summary: string; panels: { why: string; activities: string; deeper: string } }> = []
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i]
      const b = profiles[j]
      const scored = scorePair(a, b, weights)
      if (scored) {
        results.push({ personA: a.id, personB: b.id, bases: scored.bases, summary: scored.summary, panels: scored.panels })
      }
    }
  }
  return results
}

