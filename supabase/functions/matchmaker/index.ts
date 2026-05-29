// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type JsonMap = Record<string, unknown>

type CanonicalIntent =
  | "job_search"
  | "internship_search"
  | "hiring"
  | "customer_acquisition"
  | "partnerships"
  | "fundraising_help"
  | "mentorship"
  | "networking"
  | "learning"
  | "unknown"

type Seniority = "student" | "early_career" | "mid" | "senior" | "executive" | "unknown"

type CommercialSubtype =
  | "likely_buyer"
  | "likely_partner"
  | "likely_advisor"
  | "generic_commercial"

type CommercialRoleFamily =
  | "gtm"
  | "partnerships"
  | "operator"
  | "finance_legal"
  | "technical"
  | "people"
  | "unknown"

interface CanonicalProfile {
  id: string
  eventId: string
  firstName: string
  lastName: string
  name: string
  jobTitle: string
  company: string
  companySummary: string
  careerYears: number | null
  whyAttending: string
  businessNeed: string
  connectionTypes: string[]
  needTags: string[]
  wantTags: string[]
  offerTags: string[]
  industryTags: string[]
  linkedinSkills: string[]
  needSummary: string
  offerSummary: string
  needSignal: string
  offerSignal: string
  profileText: string
  primaryIntent: CanonicalIntent
  secondaryIntent: CanonicalIntent | null
  targetRole: string
  targetDomain: string
  targetCompanyType: string
  seniority: Seniority
  canHire: boolean
  canMentor: boolean
  needsJob: boolean
  needsInternship: boolean
  needsCustomers: boolean
  needsPartnerships: boolean
  needsFundraisingHelp: boolean
  needsMentorship: boolean
  needsNetworking: boolean
  offerCapabilityFamily: string
  offerCommercialSubtype: CommercialSubtype
  offerAudienceHint: string
  commercialRoleFamily: CommercialRoleFamily
}

interface ScoredCandidate {
  candidate: CanonicalProfile
  rawScore: number
  normalizedScore: number
  reasons: string[]
  reasonWeights: Record<string, number>
  ruleHits: Record<string, number>
  fallbackUsed?: boolean
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

function getClient() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        "x-client-info": "intro-matchmaker-v5-rules-needs-offers",
      },
    },
  })
}

const SUGGESTIONS_PER_USER = 3
const LLM_RANKER_POOL_SIZE = 12
const LLM_RANKER_POOL_SIZE_LEARNING = 16
const LLM_RANKER_MAX_EXTRAS = 4
const MIN_MATCH_SCORE = 8
const FALLBACK_MIN_SCORE = 3
const MATCH_SCORE_NORMALIZATION_MAX = 60
const MAX_REASON_COUNT = 3
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
const MATCH_EXPLANATION_ALGORITHM_VERSION = "v8_llm_ranker_v6"

const LEGACY_EXPLANATION_PATTERNS = [
  /shared\s+\w+\s+domain\s+context/i,
  /domain context for networking/i,
  /worth a quick intro/i,
  /networking fit on shared/i,
  /general networking overlap/i,
  /commercial fit:/i,
  /fallback match/i,
]

function isStaleMatchExplanation(
  text: string | null | undefined,
  algorithmVersion: string | null | undefined,
): boolean {
  const normalized = cleanText(text || "")
  if (!normalized) return true
  if (algorithmVersion !== MATCH_EXPLANATION_ALGORITHM_VERSION) return true
  if (LEGACY_EXPLANATION_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  const halves = normalized.split(/\.\s+/)
  if (halves.length >= 2 && halves[0] && halves[0] === halves[1]) return true
  return false
}

const COMMERCIAL_INTENTS = new Set<CanonicalIntent>([
  "customer_acquisition",
  "partnerships",
])

const TITLE_EXEC_PATTERNS = [
  /\b(ceo|cfo|coo|cto|cmo|cpo|chief|president|founder|co[-\s]?founder|owner|managing\s+director|general\s+partner)\b/i,
]
const TITLE_SENIOR_PATTERNS = [
  /\b(vp|vice\s+president|head\s+of|director|principal|staff|lead|senior|partner)\b/i,
]
const TITLE_EARLY_PATTERNS = [/\b(intern|student|junior|associate|mba)\b/i]

const HIRING_PATTERNS = [
  /\b(hiring|hire|recruit|recruiting|build\s+team|add\s+to\s+team|open\s+role|looking\s+for\s+talent)\b/i,
]
const JOB_SEEKING_PATTERNS = [
  /\b(open\s+to\s+work|job\s+search|find\s+a\s+job|looking\s+for\s+a\s+role|seeking\s+role|career\s+move)\b/i,
]
const INTERNSHIP_PATTERNS = [/\b(internship|intern|summer\s+intern)\b/i]
const CUSTOMER_PATTERNS = [
  /\b(customers?|clients?|pipeline|sales\s+leads?|lead\s+gen|grow\s+revenue|customer\s+acquisition|new\s+business)\b/i,
]
const PARTNERSHIP_PATTERNS = [
  /\b(partnerships?|partner\s+with|alliances?|channel\s+partner|business\s+development|ecosystem|co-?sell|co-?market)\b/i,
]
const FUNDRAISING_PATTERNS = [
  /\b(fundrais|raise\s+capital|raise\s+money|investors?|vc\b|angel\b|seed\s+round|series\s+[abc])\b/i,
]
const MENTORSHIP_NEED_PATTERNS = [
  /\b(mentor|mentorship|coaching|coach|mentee)\b/i,
]
const MENTORSHIP_OFFER_PATTERNS = [
  /\b(mentor|mentorship|coaching|coach|advisor|advisory)\b/i,
]
const NETWORKING_PATTERNS = [/\b(network|networking|connections?|meet\s+people)\b/i]

const OFFER_FAMILY_PATTERNS: Array<{ family: string; re: RegExp }> = [
  { family: "sales_gtm", re: /\b(sales|revenue|gtm|go[-\s]?to[-\s]?market|account\s+executive|pipeline|growth|demand\s+gen)\b/i },
  { family: "partnerships", re: /\b(partnerships?|alliances?|ecosystem|business\s+development|channel)\b/i },
  { family: "legal_risk", re: /\b(legal|law|attorney|counsel|compliance|risk)\b/i },
  { family: "finance_strategy", re: /\b(finance|financial|cfo|fundraising|capital|investment|fp\&a|accounting)\b/i },
  { family: "people_hr", re: /\b(hr|human\s+resources|people\s+ops|talent|recruiting|hiring)\b/i },
  { family: "technical_product", re: /\b(engineer|engineering|developer|software|ml|ai|product|ux|ui|design)\b/i },
  { family: "creative_brand", re: /\b(brand|creative|content|marketing|pr|media)\b/i },
  { family: "founder_operator", re: /\b(founder|operator|operations|exec|ceo|coo|president)\b/i },
]

const ROLE_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "sales", re: /\b(sales|revenue|account\s+executive|account\s+manager|sdr|bdr)\b/i },
  { key: "partnerships", re: /\b(partnerships?|alliances?|business\s+development|ecosystem)\b/i },
  { key: "marketing", re: /\b(marketing|growth|brand|content|demand\s+gen)\b/i },
  { key: "engineering", re: /\b(engineer|engineering|developer|software|platform|devops)\b/i },
  { key: "product", re: /\b(product|pm\b|product\s+manager)\b/i },
  { key: "design", re: /\b(design|ux|ui|creative)\b/i },
  { key: "finance", re: /\b(finance|accounting|fp\&a|investment|capital)\b/i },
  { key: "legal", re: /\b(legal|law|counsel|compliance)\b/i },
  { key: "hr", re: /\b(hr|talent|recruit)\b/i },
  { key: "operations", re: /\b(operations|ops|operator)\b/i },
  { key: "founder_exec", re: /\b(founder|chief|ceo|cfo|coo|cto|president|owner)\b/i },
]

const DOMAIN_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "ai_ml", re: /\b(ai|ml|machine\s+learning|llm|data\s+science)\b/i },
  { key: "fintech", re: /\b(fintech|payments|banking|finance)\b/i },
  { key: "healthcare", re: /\b(healthcare|health|clinical|patient)\b/i },
  { key: "education", re: /\b(education|edtech|student|school|university|mba)\b/i },
  { key: "media", re: /\b(media|press|journalism|content|publishing)\b/i },
  { key: "startup", re: /\b(startup|founder|seed|series\s+[abc]|venture)\b/i },
  { key: "enterprise", re: /\b(enterprise|b2b|saas|platform)\b/i },
  { key: "nonprofit", re: /\b(nonprofit|charity|ngo|foundation)\b/i },
]

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const PROFILE_SELECT = `
  *,
  users:user_id (*)
`

function safeString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function cleanText(value: unknown): string {
  return safeString(value).replace(/\s+/g, " ").trim()
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const v = cleanText(item)
    if (!v) continue
    out.push(v)
  }
  return out
}

function uniqueLower(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = cleanText(value)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  if (!text) return false
  return patterns.some((re) => re.test(text))
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function mergeTags(...lists: unknown[]): string[] {
  const merged: string[] = []
  for (const list of lists) {
    merged.push(...coerceStringArray(list))
  }
  return uniqueLower(merged)
}

function buildName(firstName: string, lastName: string, fallbackTitle: string): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim()
  if (full) return full
  return fallbackTitle || "Attendee"
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanText(value)
    if (cleaned) return cleaned
  }
  return ""
}

function extractFlowAnswers(flowState: unknown): string[] {
  if (!flowState || typeof flowState !== "object" || Array.isArray(flowState)) return []
  const obj = flowState as JsonMap
  const nodePath = obj.node_path
  if (!Array.isArray(nodePath)) return []

  const answers: string[] = []
  for (const entry of nodePath) {
    if (!entry || typeof entry !== "object") continue
    const answer = cleanText((entry as JsonMap).answer)
    if (!answer) continue
    answers.push(answer)
  }
  return uniqueLower(answers)
}

function normalizeConnectionTypes(types: unknown): string[] {
  return coerceStringArray(types).map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_"))
}

function pickNeedSummary(row: any, flowNeedAnswers: string[]): string {
  return firstNonEmpty(
    row.need_summary_final,
    row.users?.want_summary_text,
    row.business_need_text,
    flowNeedAnswers.length > 0 ? flowNeedAnswers.slice(0, 2).join("; ") : "",
    row.why_attending_text,
  )
}

function pickOfferSummary(row: any, flowOfferAnswers: string[]): string {
  const fromProse = firstNonEmpty(
    row.offer_summary_final,
    row.users?.offer_summary_text,
    flowOfferAnswers.length > 0 ? flowOfferAnswers.slice(0, 2).join("; ") : "",
    row.users?.expertise_summary,
    row.users?.company_summary,
    row.event_profile_summary_text,
  )
  if (fromProse) return fromProse

  const title = cleanText(row.users?.career_title)
  const company = cleanText(row.users?.company_name)
  if (title && company) return `${title} at ${company}`
  return title || company || ""
}

function inferCanHire(
  signalLower: string,
  connectionTypes: string[],
  jobTitle: string,
  needsJob: boolean,
  needsInternship: boolean,
): boolean {
  const titleLower = jobTitle.toLowerCase()
  const leadershipSignal =
    containsAny(titleLower, TITLE_EXEC_PATTERNS) || /\b(manager|director|head|lead|partner)\b/i.test(titleLower)
  const connectionRecruitSignal = connectionTypes.some((t) => t.includes("recruit") || t.includes("hiring"))
  const explicitHiring = containsAny(signalLower, HIRING_PATTERNS)

  // Contradictory self-seeking signals should not be treated as hiring authority.
  if (needsJob || needsInternship) {
    if (!explicitHiring) return false
    if (!leadershipSignal) return false
  }

  if (connectionRecruitSignal && leadershipSignal && !needsJob && !needsInternship) return true
  if (explicitHiring && leadershipSignal) return true
  if (explicitHiring && /\b(we('| a)?re\s+hiring|hiring\s+for|open\s+roles?)\b/i.test(signalLower)) return true

  return false
}

function inferSeniority(
  jobTitle: string,
  careerYears: number | null,
  signalLower: string,
  needsInternship: boolean,
  canHire: boolean,
): Seniority {
  const titleLower = jobTitle.toLowerCase()

  if (containsAny(titleLower, TITLE_EARLY_PATTERNS)) {
    if (/\bstudent\b/i.test(titleLower) || needsInternship) return "student"
    return "early_career"
  }
  if (containsAny(titleLower, TITLE_EXEC_PATTERNS)) return "executive"
  if (containsAny(titleLower, TITLE_SENIOR_PATTERNS)) return "senior"

  if (careerYears != null) {
    if (careerYears < 2) return needsInternship ? "student" : "early_career"
    if (careerYears >= 12) return canHire ? "executive" : "senior"
    if (careerYears >= 6) return "mid"
    if (careerYears >= 2) return "early_career"
  }

  if (canHire && /\b(manager|head|lead|director)\b/i.test(titleLower)) return "senior"
  if (needsInternship && !canHire) return "early_career"
  if (/\bmba\b/i.test(signalLower) && !canHire) return "early_career"

  return "unknown"
}

function inferPrimaryIntent(flags: {
  needsJob: boolean
  needsInternship: boolean
  canHire: boolean
  needsCustomers: boolean
  needsPartnerships: boolean
  needsFundraisingHelp: boolean
  needsMentorship: boolean
  needsNetworking: boolean
  needSignalLower: string
}): CanonicalIntent {
  if (flags.needsJob) return "job_search"
  if (flags.needsInternship) return "internship_search"
  if (flags.canHire) return "hiring"
  if (flags.needsCustomers) return "customer_acquisition"
  if (flags.needsPartnerships) return "partnerships"
  if (flags.needsFundraisingHelp) return "fundraising_help"
  if (flags.needsMentorship) return "mentorship"
  if (flags.needsNetworking) return "networking"
  if (/\blearn\b/i.test(flags.needSignalLower)) return "learning"
  return "unknown"
}

function inferSecondaryIntent(primary: CanonicalIntent, flags: {
  canHire: boolean
  needsCustomers: boolean
  needsPartnerships: boolean
  needsFundraisingHelp: boolean
  needsMentorship: boolean
  needsNetworking: boolean
  needsJob: boolean
  needsInternship: boolean
}): CanonicalIntent | null {
  const candidates: CanonicalIntent[] = []
  if (flags.needsJob) candidates.push("job_search")
  if (flags.needsInternship) candidates.push("internship_search")
  if (flags.canHire) candidates.push("hiring")
  if (flags.needsCustomers) candidates.push("customer_acquisition")
  if (flags.needsPartnerships) candidates.push("partnerships")
  if (flags.needsFundraisingHelp) candidates.push("fundraising_help")
  if (flags.needsMentorship) candidates.push("mentorship")
  if (flags.needsNetworking) candidates.push("networking")
  for (const candidate of [...new Set(candidates)]) {
    if (candidate !== primary) return candidate
  }
  return null
}

function inferCanMentor(
  offerSignalLower: string,
  needSignalLower: string,
  seniority: Seniority,
  canHire: boolean,
  primaryIntent: CanonicalIntent,
): boolean {
  if (primaryIntent === "job_search" || primaryIntent === "internship_search") return false

  const seniorOrExec = seniority === "senior" || seniority === "executive"
  const explicitMentorOffer = containsAny(offerSignalLower, MENTORSHIP_OFFER_PATTERNS) || containsAny(needSignalLower, [/\bi can mentor\b/i])

  // Keep this conservative: require some authority/experience context.
  if (explicitMentorOffer && (seniorOrExec || canHire)) return true
  if (!seniorOrExec) return false
  if (canHire) return true
  return /\b(founder|operator|executive|partner|principal)\b/i.test(offerSignalLower)
}

function inferTargetRole(signalLower: string): string {
  for (const entry of ROLE_PATTERNS) {
    if (entry.re.test(signalLower)) return entry.key
  }
  return "general"
}

function inferTargetDomain(signalLower: string): string {
  for (const entry of DOMAIN_PATTERNS) {
    if (entry.re.test(signalLower)) return entry.key
  }
  return "general"
}

function inferTargetCompanyType(signalLower: string): string {
  if (/\b(startup|venture|seed|series\s+[abc])\b/i.test(signalLower)) return "startup"
  if (/\b(enterprise|fortune\s+500|large\s+company)\b/i.test(signalLower)) return "enterprise"
  if (/\b(agency|consulting|studio|advisory)\b/i.test(signalLower)) return "agency_consulting"
  if (/\b(vc|investor|fund)\b/i.test(signalLower)) return "investors_vc"
  if (/\b(nonprofit|charity|foundation|ngo)\b/i.test(signalLower)) return "nonprofit_org"
  if (/\b(public\s+sector|government)\b/i.test(signalLower)) return "government"
  return "business_general"
}

function inferOfferCapabilityFamily(offerSignalLower: string, jobTitle: string): string {
  const signal = `${offerSignalLower} ${jobTitle.toLowerCase()}`
  for (const entry of OFFER_FAMILY_PATTERNS) {
    if (entry.re.test(signal)) return entry.family
  }
  return "general"
}

function inferCommercialSubtype(profile: CanonicalProfile): CommercialSubtype {
  const text = `${profile.offerSignal} ${profile.jobTitle}`.toLowerCase()
  if (/\b(partnership|alliances|business\s+development|channel|ecosystem)\b/i.test(text)) return "likely_partner"
  if (/\b(account\s+executive|sales|revenue|c\s*r\s*o|chief\s+revenue|buyer|procurement|growth)\b/i.test(text)) return "likely_buyer"
  if (/\b(advisor|operator|consult|legal|finance|founder|executive|partner|principal|coach|mentor)\b/i.test(text) || profile.canMentor) {
    return "likely_advisor"
  }
  return "generic_commercial"
}

function inferCommercialRoleFamily(profile: CanonicalProfile): CommercialRoleFamily {
  const text = `${profile.offerSignal} ${profile.jobTitle} ${profile.targetRole}`.toLowerCase()
  if (/\b(sales|revenue|gtm|account\s+executive|growth|marketing)\b/i.test(text)) return "gtm"
  if (/\b(partnership|alliances|business\s+development|channel|ecosystem)\b/i.test(text)) return "partnerships"
  if (/\b(finance|legal|counsel|compliance|investment|capital)\b/i.test(text)) return "finance_legal"
  if (/\b(people|hr|talent|recruit)\b/i.test(text)) return "people"
  if (/\b(engineer|product|design|technical|developer|ai|ml)\b/i.test(text)) return "technical"
  if (/\b(founder|operator|operations|executive|chief|president|owner)\b/i.test(text)) return "operator"
  return "unknown"
}

function inferOfferAudienceHint(offerSignalLower: string): string {
  if (/\b(job\s+seekers?|interns?|candidates?)\b/i.test(offerSignalLower)) return "job_seekers_interns"
  if (/\b(founders?|startups?)\b/i.test(offerSignalLower)) return "founders_startups"
  if (/\b(sales\s+teams?|revenue\s+teams?)\b/i.test(offerSignalLower)) return "commercial_teams"
  if (/\b(executives?|leaders?)\b/i.test(offerSignalLower)) return "executives"
  return "general"
}

function complementaryDomains(a: string, b: string): boolean {
  if (!a || !b || a === "general" || b === "general") return false
  const pairs = new Set([
    "ai_ml:startup",
    "startup:ai_ml",
    "fintech:enterprise",
    "enterprise:fintech",
    "media:marketing",
    "marketing:media",
  ])
  return pairs.has(`${a}:${b}`)
}

function roleFamily(role: string): string {
  if (/(sales|marketing|partnerships)/i.test(role)) return "commercial"
  if (/(engineering|product|design|data)/i.test(role)) return "technical"
  if (/(finance|legal)/i.test(role)) return "governance"
  if (/(hr|talent|operations)/i.test(role)) return "operations"
  if (/(founder|exec)/i.test(role)) return "leadership"
  return "general"
}

function seniorityFit(source: CanonicalProfile, candidate: CanonicalProfile): boolean {
  if (source.needsMentorship) {
    return candidate.seniority === "senior" || candidate.seniority === "executive"
  }
  if (source.needsJob || source.needsInternship) {
    return candidate.canHire || candidate.seniority === "senior" || candidate.seniority === "executive"
  }
  return true
}

function commercialRoleFamiliesComplementary(a: CommercialRoleFamily, b: CommercialRoleFamily): boolean {
  if (!a || !b || a === "unknown" || b === "unknown") return false
  const pairs = new Set([
    "gtm:partnerships",
    "partnerships:gtm",
    "gtm:operator",
    "operator:gtm",
    "partnerships:operator",
    "operator:partnerships",
    "technical:operator",
    "operator:technical",
    "finance_legal:operator",
    "operator:finance_legal",
  ])
  return pairs.has(`${a}:${b}`)
}

function bothPureSeekers(source: CanonicalProfile, candidate: CanonicalProfile): boolean {
  const sourceOfferSide = source.canHire || source.canMentor || source.offerCapabilityFamily !== "general"
  const candidateOfferSide = candidate.canHire || candidate.canMentor || candidate.offerCapabilityFamily !== "general"
  return !sourceOfferSide && !candidateOfferSide
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function toCanonicalProfile(row: any): CanonicalProfile | null {
  const user = row?.users
  if (!user || !row?.user_id || !row?.event_id) return null

  const flowNeedAnswers = extractFlowAnswers(row.need_flow_state_json)
  const flowOfferAnswers = extractFlowAnswers(row.offer_flow_state_json)

  const firstName = cleanText(user.first_name)
  const lastName = cleanText(user.last_name)
  const jobTitle = cleanText(user.career_title)
  const company = cleanText(user.company_name)
  const companySummary = cleanText(user.company_summary)
  const careerYears = toNumberOrNull(user.career_years_experience)

  const needTags = mergeTags(user.need_tags, row.event_need_tags)
  const wantTags = mergeTags(user.want_tags, row.event_want_tags)
  const offerTags = mergeTags(user.offer_tags, row.event_offer_tags)
  const industryTags = mergeTags(user.industry_tags, row.event_industry_tags)
  const linkedinSkills = mergeTags(user.linkedin_skills)
  const connectionTypes = normalizeConnectionTypes(row.connection_types_selected)

  const whyAttending = cleanText(row.why_attending_text)
  const businessNeed = cleanText(row.business_need_text)
  const needSummary = pickNeedSummary(row, flowNeedAnswers)
  const offerSummary = pickOfferSummary(row, flowOfferAnswers)

  const needSignal = cleanText(
    [
      needSummary,
      businessNeed,
      whyAttending,
      ...needTags,
      ...wantTags,
      ...flowNeedAnswers,
      ...connectionTypes,
      jobTitle,
      companySummary,
    ].join(" "),
  )

  const offerSignal = cleanText(
    [
      offerSummary,
      ...offerTags,
      ...flowOfferAnswers,
      ...linkedinSkills,
      jobTitle,
      companySummary,
    ].join(" "),
  )

  const needSignalLower = needSignal.toLowerCase()
  const offerSignalLower = offerSignal.toLowerCase()

  const needsJob = connectionTypes.includes("find_job") || containsAny(needSignalLower, JOB_SEEKING_PATTERNS)
  const needsInternship = containsAny(needSignalLower, INTERNSHIP_PATTERNS)
  const needsCustomers = connectionTypes.includes("business_opportunities") || containsAny(needSignalLower, CUSTOMER_PATTERNS)
  const needsPartnerships = connectionTypes.includes("partnerships") || containsAny(needSignalLower, PARTNERSHIP_PATTERNS)
  const needsFundraisingHelp = containsAny(needSignalLower, FUNDRAISING_PATTERNS)
  const needsMentorship = connectionTypes.includes("find_mentor") || containsAny(needSignalLower, MENTORSHIP_NEED_PATTERNS)
  const needsNetworking =
    connectionTypes.includes("general") ||
    containsAny(needSignalLower, NETWORKING_PATTERNS) ||
    (!needsJob && !needsInternship && !needsCustomers && !needsPartnerships && !needsFundraisingHelp && !needsMentorship)

  const canHire = inferCanHire(needSignalLower, connectionTypes, jobTitle, needsJob, needsInternship)
  const seniority = inferSeniority(jobTitle, careerYears, needSignalLower, needsInternship, canHire)
  const primaryIntent = inferPrimaryIntent({
    needsJob,
    needsInternship,
    canHire,
    needsCustomers,
    needsPartnerships,
    needsFundraisingHelp,
    needsMentorship,
    needsNetworking,
    needSignalLower,
  })
  const canMentor = inferCanMentor(offerSignalLower, needSignalLower, seniority, canHire, primaryIntent)
  const secondaryIntent = inferSecondaryIntent(primaryIntent, {
    canHire,
    needsCustomers,
    needsPartnerships,
    needsFundraisingHelp,
    needsMentorship,
    needsNetworking,
    needsJob,
    needsInternship,
  })
  const targetRole = inferTargetRole(needSignalLower)
  const targetDomain = inferTargetDomain(`${needSignalLower} ${offerSignalLower}`)
  const targetCompanyType = inferTargetCompanyType(needSignalLower)
  const offerCapabilityFamily = inferOfferCapabilityFamily(offerSignalLower, jobTitle)

  const profile: CanonicalProfile = {
    id: row.user_id,
    eventId: row.event_id,
    firstName,
    lastName,
    name: buildName(firstName, lastName, jobTitle),
    jobTitle,
    company,
    companySummary,
    careerYears,
    whyAttending,
    businessNeed,
    connectionTypes,
    needTags,
    wantTags,
    offerTags,
    industryTags,
    linkedinSkills,
    needSummary,
    offerSummary,
    needSignal,
    offerSignal,
    profileText: cleanText(
      [
        buildName(firstName, lastName, ""),
        jobTitle,
        company,
        needSummary,
        offerSummary,
        targetRole,
        targetDomain,
      ].join(" | "),
    ),
    primaryIntent,
    secondaryIntent,
    targetRole,
    targetDomain,
    targetCompanyType,
    seniority,
    canHire,
    canMentor,
    needsJob,
    needsInternship,
    needsCustomers,
    needsPartnerships,
    needsFundraisingHelp,
    needsMentorship,
    needsNetworking,
    offerCapabilityFamily,
    offerCommercialSubtype: "generic_commercial",
    offerAudienceHint: inferOfferAudienceHint(offerSignalLower),
    commercialRoleFamily: "unknown",
  }

  profile.offerCommercialSubtype = inferCommercialSubtype(profile)
  profile.commercialRoleFamily = inferCommercialRoleFamily(profile)

  return profile
}

function scorePair(source: CanonicalProfile, candidate: CanonicalProfile): ScoredCandidate {
  let score = 0
  const reasonWeights = new Map<string, number>()
  const groupPoints = new Map<string, number>()
  const strongGroups = new Set<string>()

  function addReason(weight: number, reason: string) {
    if (weight <= 0) return
    const current = reasonWeights.get(reason) ?? 0
    if (weight > current) reasonWeights.set(reason, weight)
  }

  function addCapped(group: string, points: number, cap: number, reason: string, isStrong = false) {
    if (points <= 0) return
    const current = groupPoints.get(group) ?? 0
    const remaining = cap - current
    if (remaining <= 0) return
    const applied = Math.min(points, remaining)
    if (applied <= 0) return
    groupPoints.set(group, current + applied)
    score += applied
    addReason(applied, reason)
    if (isStrong) strongGroups.add(group)
  }

  const sourceCommercial =
    source.needsCustomers ||
    source.needsPartnerships ||
    (source.secondaryIntent ? COMMERCIAL_INTENTS.has(source.secondaryIntent) : false)
  const mentorshipPrimary = source.primaryIntent === "mentorship"
  const mentorshipSecondary = source.secondaryIntent === "mentorship"

  if ((source.needsJob || source.needsInternship) && candidate.canHire) {
    addCapped("job_hiring", 24, 32, "Job/internship seeker matched to hiring-capable profile.", true)
  }

  if (source.canHire && (candidate.needsJob || candidate.needsInternship)) {
    addCapped("job_hiring", 10, 32, "Source is hiring-capable and candidate appears role-seeking.", true)
  }

  if (source.needsMentorship) {
    const mentorCap = mentorshipPrimary ? 28 : mentorshipSecondary ? 14 : 6
    if (candidate.canMentor) {
      const points = mentorshipPrimary ? 22 : mentorshipSecondary ? 10 : 4
      addCapped("mentorship", points, mentorCap, "Mentorship seeker matched to mentor-capable profile.", mentorshipPrimary || mentorshipSecondary)
    } else if (candidate.seniority === "senior" || candidate.seniority === "executive") {
      const points = mentorshipPrimary ? 10 : mentorshipSecondary ? 5 : 2
      addCapped("mentorship", points, mentorCap, "Mentorship seeker matched to senior/executive profile.", mentorshipPrimary)
    }
  }

  if (source.needsFundraisingHelp) {
    if (candidate.targetDomain === "startup" || candidate.targetDomain === "fintech") {
      addCapped("fundraising", 12, 22, "Startup/finance context aligns with fundraising needs.", true)
    }
    if (candidate.targetCompanyType === "investors_vc" || candidate.targetCompanyType === "startup") {
      addCapped("fundraising", 7, 22, "Candidate company context supports fundraising guidance.", true)
    }
    if (candidate.seniority === "executive") {
      addCapped("fundraising", 5, 22, "Executive seniority supports fundraising guidance.")
    }
    if (candidate.canMentor) {
      addCapped("fundraising", 4, 22, "Mentor-capable profile can support fundraising prep.")
    }
    if (candidate.offerCommercialSubtype === "likely_partner" || candidate.offerCommercialSubtype === "likely_advisor") {
      addCapped("fundraising", 4, 22, "Commercial advisor/partner orientation is relevant to fundraising.")
    }
  }

  if (sourceCommercial) {
    if (source.needsCustomers) {
      if (candidate.offerCommercialSubtype === "likely_buyer") {
        addCapped("commercial", 8, 20, "Commercial fit: likely buyer-side counterpart.", true)
      } else if (candidate.offerCommercialSubtype === "likely_partner") {
        addCapped("commercial", 6, 20, "Commercial fit: partnership-capable counterpart.", true)
      } else if (candidate.offerCommercialSubtype === "likely_advisor") {
        addCapped("commercial", 4, 20, "Commercial fit: advisor/operator counterpart.")
      }
    }

    if (source.needsPartnerships) {
      if (candidate.offerCommercialSubtype === "likely_partner") {
        addCapped("commercial", 8, 20, "Partnership intent aligned with likely partner profile.", true)
      } else if (candidate.offerCommercialSubtype === "likely_buyer") {
        addCapped("commercial", 6, 20, "Partnership intent aligned with buyer-side profile.")
      } else if (candidate.offerCommercialSubtype === "likely_advisor") {
        addCapped("commercial", 5, 20, "Partnership intent aligned with advisor/operator profile.")
      }
    }

    if (source.secondaryIntent && COMMERCIAL_INTENTS.has(source.secondaryIntent) && !COMMERCIAL_INTENTS.has(source.primaryIntent)) {
      addCapped("commercial", 3, 20, "Secondary commercial intent considered in ranking.")
    }

    if (source.commercialRoleFamily !== "unknown" && candidate.commercialRoleFamily !== "unknown") {
      if (source.commercialRoleFamily === candidate.commercialRoleFamily) {
        addCapped("commercial", 5, 20, "Strong commercial role adjacency.", true)
      } else if (commercialRoleFamiliesComplementary(source.commercialRoleFamily, candidate.commercialRoleFamily)) {
        addCapped("commercial", 3, 20, "Complementary commercial role adjacency.")
      }
    }

    if (candidate.offerSummary) {
      addCapped("commercial", 2, 20, "Offer-side signal is present and relevant.")
    }
    if (candidate.primaryIntent === "partnerships" || candidate.needsPartnerships) {
      addCapped("commercial", 2, 20, "Candidate shows explicit partnership orientation.")
    }
  }

  if (source.needsNetworking) {
    if (source.targetDomain !== "general" && source.targetDomain === candidate.targetDomain) {
      addCapped("networking", 8, 12, "Networking fit on shared domain context.", true)
    } else if (complementaryDomains(source.targetDomain, candidate.targetDomain)) {
      addCapped("networking", 5, 12, "Networking fit on complementary domains.", true)
    }
    if (candidate.primaryIntent === "networking" || candidate.primaryIntent === "partnerships") {
      addCapped("networking", 2, 12, "Candidate intent suggests networking openness.")
    }
    if (candidate.seniority === "senior" || candidate.seniority === "executive") {
      addCapped("networking", 2, 12, "Candidate seniority can add networking value.")
    }
  }

  if (source.targetDomain !== "general" && source.targetDomain === candidate.targetDomain) {
    addCapped("soft", 3, 7, "Shared target domain.")
  } else if (complementaryDomains(source.targetDomain, candidate.targetDomain)) {
    addCapped("soft", 2, 7, "Complementary target domains.")
  }

  if (roleFamily(source.targetRole) === roleFamily(candidate.targetRole) && roleFamily(source.targetRole) !== "general") {
    addCapped("soft", 2, 7, "Related target role family.")
  }

  if (seniorityFit(source, candidate)) {
    addCapped("soft", 2, 7, "Seniority fit for stated intent.")
  }

  if (candidate.offerSummary) {
    addCapped("soft", 1, 7, "Candidate has offer-side context.")
  }

  if (bothPureSeekers(source, candidate)) {
    score -= 6
    addReason(6, "Both profiles appear seeker-heavy with limited offer-side signal.")
  }
  if (strongGroups.size === 0) {
    score -= 5
    addReason(5, "No strong complementarity rule triggered.")
  }
  if (
    source.primaryIntent === candidate.primaryIntent &&
    (source.primaryIntent === "job_search" || source.primaryIntent === "internship_search" || source.primaryIntent === "mentorship") &&
    !candidate.canHire &&
    !candidate.canMentor
  ) {
    score -= 3
    addReason(3, "Same seeker intent without clear complementarity.")
  }

  const rawScore = Math.max(0, Math.round(score))
  const normalizedScore = clamp(rawScore / MATCH_SCORE_NORMALIZATION_MAX, 0, 1)
  const reasons = [...reasonWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason]) => reason)
    .slice(0, MAX_REASON_COUNT)

  const reasonWeightRecord: Record<string, number> = {}
  for (const [key, value] of reasonWeights.entries()) reasonWeightRecord[key] = value

  const ruleHits: Record<string, number> = {}
  for (const [group, points] of groupPoints.entries()) ruleHits[group] = points

  return {
    candidate,
    rawScore,
    normalizedScore,
    reasons,
    reasonWeights: reasonWeightRecord,
    ruleHits,
  }
}

function deterministicCompare(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore
  if (b.normalizedScore !== a.normalizedScore) return b.normalizedScore - a.normalizedScore
  const aRole = roleFamily(a.candidate.targetRole)
  const bRole = roleFamily(b.candidate.targetRole)
  if (aRole !== bRole) return aRole.localeCompare(bRole)
  return a.candidate.id.localeCompare(b.candidate.id)
}

function selectCandidates(
  source: CanonicalProfile,
  scored: ScoredCandidate[],
  limit: number = SUGGESTIONS_PER_USER,
): ScoredCandidate[] {
  const sorted = [...scored].sort(deterministicCompare)
  const strong = sorted.filter((row) => row.rawScore >= MIN_MATCH_SCORE)
  const selected: ScoredCandidate[] = strong.slice(0, limit)

  if (selected.length === 0) {
    const fallback = sorted.find((row) => row.rawScore >= FALLBACK_MIN_SCORE) ?? sorted[0]
    if (fallback) {
      selected.push({
        ...fallback,
        fallbackUsed: true,
        reasons: [
          "Fallback match; limited strong matches were available, but this profile has some networking relevance.",
        ],
      })
    }
  }

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((row) => row.candidate.id))
    for (const row of sorted) {
      if (selected.length >= limit) break
      if (selectedIds.has(row.candidate.id)) continue
      if (row.rawScore < FALLBACK_MIN_SCORE) continue
      selected.push(row)
      selectedIds.add(row.candidate.id)
    }
  }

  // Commercial-subtype variety swap is only meaningful when picking the final
  // top-3 (it diversifies subtype between slot 2 and 3). Skip when we're just
  // building the pre-filter pool for the LLM ranker.
  if (
    limit === SUGGESTIONS_PER_USER &&
    selected.length >= 3 &&
    (source.needsCustomers || source.needsPartnerships || (source.secondaryIntent ? COMMERCIAL_INTENTS.has(source.secondaryIntent) : false))
  ) {
    const third = selected[2]
    const firstTwo = new Set([
      selected[0].candidate.offerCommercialSubtype,
      selected[1].candidate.offerCommercialSubtype,
    ])
    if (firstTwo.has(third.candidate.offerCommercialSubtype)) {
      for (const alternative of sorted) {
        if (selected.some((s) => s.candidate.id === alternative.candidate.id)) continue
        if (alternative.rawScore < third.rawScore - 2) break
        if (firstTwo.has(alternative.candidate.offerCommercialSubtype)) continue
        selected[2] = alternative
        break
      }
    }
  }

  return selected.slice(0, limit)
}

function truncateText(value: string | null | undefined, max: number): string {
  const text = cleanText(value || "")
  if (!text) return "—"
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function formatIntent(intent: CanonicalIntent | null | undefined): string {
  if (!intent || intent === "unknown") return "—"
  return intent.replace(/_/g, " ")
}

function candidateFirstName(candidate: CanonicalProfile): string {
  const fromField = cleanText(candidate.firstName)
  if (fromField) return fromField
  const fromName = cleanText(candidate.name.split(/\s+/)[0] || "")
  return fromName || "They"
}

function enforceTwoSentences(text: string): string {
  const cleaned = cleanText(text)
  if (!cleaned) return ""

  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned]
  const sentences = parts.map((part) => part.trim()).filter(Boolean)
  if (sentences.length <= 2) return cleaned

  return sentences.slice(0, 2).join(" ").trim()
}

interface StructuredExplanation {
  why_meet_card: string
  why_meet_paragraph: string
  what_they_are_looking_for: string
}

function viewerProseBlock(viewer: CanonicalProfile): string {
  const role = [viewer.jobTitle, viewer.company].filter(Boolean).join(" at ") || "—"
  const lookingFor = viewer.needSummary || viewer.businessNeed || viewer.needSignal || "—"
  const offering = viewer.offerSummary || viewer.offerSignal || "—"
  const connection = viewer.connectionTypes.length ? viewer.connectionTypes.join(", ") : "—"
  return [
    `Name: ${viewer.name}`,
    `Role: ${role}`,
    `What they are looking for: ${lookingFor}`,
    `What they offer (so you can spot two-way value, NEVER paste into the output): ${offering}`,
    `Connection types they selected: ${connection}`,
  ].join("\n")
}

/** Shared copy rules so the model does not treat a candidate's goals as their expertise. */
const OFFER_VS_NEED_WRITING_RULES =
  "CRITICAL — OFFER vs LOOKING FOR (read carefully):\n" +
  "- why_meet_card and why_meet_paragraph may ONLY describe value from the candidate's OFFER, job title, company, and company summary.\n" +
  "- NEVER say the candidate offers expertise, focus, insights, or experience \"on\" / \"in\" a topic that appears ONLY under their LOOKING FOR field.\n" +
  "- Forbidden phrasing when the topic is only in LOOKING FOR: \"their focus on X\", \"they can offer insights on X\", \"their experience in X\", \"their interest in X gives you\".\n" +
  "- If they are \"seeking to learn about X\" or \"looking for connections related to X\", that is what THEY want — not what they bring.\n" +
  "- When their offer is thin, anchor on role + company (e.g. COO at a self-storage property management firm → how that CRE niche operates day to day), NOT on topics from their looking-for text.\n" +
  "- what_they_are_looking_for is the ONLY place to mention topics from their looking-for text.\n\n" +
  "EXAMPLES:\n" +
  "BAD (inverts want into offer): \"Jordan's focus on construction projects in Utah can offer you practical insights.\"\n" +
  "GOOD: \"Jordan runs operations for a self-storage property management firm — a concrete window into one commercial real estate niche.\"\n" +
  "BAD: \"Andrew's interest in Utah development gives you insights into the market.\"\n" +
  "GOOD: \"Andrew's firm does cost segregation studies — the tax side of how commercial property investments work.\"\n"

const SEEKING_ONLY_PATTERNS =
  /\b(seek(ing)?|learn(ing)?|curious about|looking for|want to (learn|understand|meet)|hoping to|interested in (connections|learning)|open to learning)\b/i

function formatCandidateLookingFor(need: string): string {
  const n = cleanText(need)
  if (!n) return "—"
  if (SEEKING_ONLY_PATTERNS.test(n)) {
    return (
      `${n} ` +
      "[IMPORTANT: This is what THEY want from the event, NOT what they offer. " +
      "Do not use this text in why_meet_card or why_meet_paragraph.]"
    )
  }
  return n
}

function enrichCompanyContext(candidate: CanonicalProfile): string {
  const base = candidate.companySummary || "—"
  const company = candidate.company.toLowerCase()
  if (/\bsegpro\b/.test(company) && !/cost segregation/i.test(`${base} ${candidate.offerSummary}`)) {
    return base === "—"
      ? "Specializes in cost segregation studies for commercial property investments."
      : `${base} Firm focus: cost segregation studies.`
  }
  if (/\bmanagement elevated\b/.test(company) && !/self[-\s]?storage/i.test(`${base} ${candidate.offerSummary}`)) {
    return base === "—"
      ? "Self-storage property management operator."
      : `${base} Operates in the self-storage property management niche.`
  }
  return base
}

function candidateProseBlock(candidate: CanonicalProfile): string {
  const role = [candidate.jobTitle, candidate.company].filter(Boolean).join(" at ") || "—"
  const offeringRaw =
    candidate.offerSummary ||
    candidate.offerSignal ||
    (role !== "—" ? `Professional background: ${role}` : "—")
  let offering = offeringRaw
  if (/\bsegpro\b/.test(candidate.company.toLowerCase()) && !/cost segregation/i.test(offering)) {
    offering =
      offering === "—"
        ? "Leads a firm specializing in cost segregation studies for commercial property."
        : `${offering} (Firm focus: cost segregation studies for commercial property.)`
  }
  const need = formatCandidateLookingFor(
    candidate.needSummary || candidate.businessNeed || candidate.needSignal || "",
  )
  const company = enrichCompanyContext(candidate)
  return [
    `Name: ${candidate.name}`,
    `Role: ${role}`,
    `What they OFFER (ONLY source for why-meet value — what they can teach or contribute): ${offering}`,
    `What they are LOOKING FOR (do NOT describe this as their expertise in why_meet_card or why_meet_paragraph): ${need}`,
    `Company context (may clarify their industry; do not invent offers): ${company}`,
  ].join("\n")
}

function buildStructuredExplanationSystemPrompt(): string {
  return (
    "You write the match cards a networking-event app shows to one attendee about a person they should meet. " +
    "You are given the reader's full goal and offer, plus the suggested person's OFFER vs what they are LOOKING FOR (separate fields). " +
    "You return strictly valid JSON with three fields: why_meet_card, why_meet_paragraph, what_they_are_looking_for.\n\n" +
    OFFER_VS_NEED_WRITING_RULES +
    "\nRULES FOR why_meet_card (1-2 sentences, plain English):\n" +
    "- Lead with WHY the reader should meet this person, anchored on the reader's stated goal.\n" +
    "- Good opener patterns: \"We matched you with {first name} because…\" or \"They're a fit for you because…\".\n" +
    "- Use the person's first name at most once. Say \"you\" for the reader.\n" +
    "- NEVER lead with their job title or a credentials list. NEVER reference \"scoring signals\" or matcher jargon.\n\n" +
    "RULES FOR why_meet_paragraph (3-5 sentences):\n" +
    "- Explain the specific fit using ONLY the suggested person's OFFER, role, and company — not their looking-for goals.\n" +
    "- Do NOT copy/paste their offer summary verbatim. Translate it into why-it-matters-to-the-reader.\n" +
    "- Mention concrete specifics from their OFFER or role (e.g. property management firm, cost segregation) when relevant.\n" +
    "- No bullet points, no markdown, no headers. One flowing paragraph.\n\n" +
    "RULES FOR what_they_are_looking_for (1-2 sentences):\n" +
    "- Summarize what the suggested person wants out of this event (from their LOOKING FOR field).\n" +
    "- Use third-person (\"they\") and prefer \"they are open to / interested in / hoping to\".\n" +
    "- Keep it gentle and viewer-safe.\n\n" +
    "Output strictly: {\"why_meet_card\": \"...\", \"why_meet_paragraph\": \"...\", \"what_they_are_looking_for\": \"...\"}. No prose outside JSON."
  )
}

function buildStructuredExplanationUserPrompt(viewer: CanonicalProfile, candidate: CanonicalProfile): string {
  return [
    "READER (the person reading the card):",
    viewerProseBlock(viewer),
    "",
    "SUGGESTED PERSON:",
    candidateProseBlock(candidate),
    "",
    "Return JSON with why_meet_card, why_meet_paragraph, what_they_are_looking_for.",
  ].join("\n")
}

async function generateOneMatchExplanation(
  apiKey: string,
  viewer: CanonicalProfile,
  row: ScoredCandidate,
): Promise<StructuredExplanation | null> {
  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildStructuredExplanationSystemPrompt() },
          { role: "user", content: buildStructuredExplanationUserPrompt(viewer, row.candidate) },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("matchmaker OpenAI error:", response.status, errorBody)
      return null
    }

    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content || ""
    return parseStructuredExplanation(raw)
  } catch (error) {
    console.error("matchmaker single explanation failed:", error)
    return null
  }
}

function parseStructuredExplanation(raw: string): StructuredExplanation | null {
  const text = cleanText(raw)
  if (!text) return null
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Model occasionally wraps JSON in prose; pluck the first object.
    const match = text.match(/\{[\s\S]*\}$/)
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        parsed = null
      }
    }
  }
  if (!parsed) return null

  const card = cleanText(parsed.why_meet_card)
  const paragraph = cleanText(parsed.why_meet_paragraph)
  const lookingFor = cleanText(parsed.what_they_are_looking_for)
  if (!card && !paragraph && !lookingFor) return null
  return {
    why_meet_card: card,
    why_meet_paragraph: paragraph,
    what_they_are_looking_for: lookingFor,
  }
}

async function generateMatchExplanations(
  viewer: CanonicalProfile,
  selected: ScoredCandidate[],
): Promise<Map<string, StructuredExplanation>> {
  const explanations = new Map<string, StructuredExplanation>()
  if (selected.length === 0) return explanations

  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim()
  if (!apiKey) {
    console.warn("matchmaker: OPENAI_API_KEY not set; match explanations will be empty")
    return explanations
  }

  const results = await Promise.all(
    selected.map(async (row) => {
      const explanation = await generateOneMatchExplanation(apiKey, viewer, row)
      return { candidateId: row.candidate.id, explanation }
    }),
  )

  for (const { candidateId, explanation } of results) {
    if (candidateId && explanation) explanations.set(candidateId, explanation)
  }

  return explanations
}

// ---------- LLM ranker (Phase 4) ----------

interface RankerResult {
  rankedIds: string[]
  explanations: Map<string, StructuredExplanation>
}

function buildRankerSystemPrompt(): string {
  return (
    "You are picking the 3 best people for the READER to meet at a networking event and writing the cards they will read about each pick.\n\n" +
    "RULES FOR RANKING:\n" +
    "- Anchor on the READER's stated goal first. If they said \"learn commercial real estate\", prioritize people who OPERATE in CRE (property management, CRE operators, real estate + relevant expertise) over generic founders.\n" +
    "- Rank higher when the topic appears under a candidate's OFFER or role/company — they can actually teach or represent that domain.\n" +
    "- Rank lower when the topic appears ONLY under \"What they are looking for\" — they want to learn it, not teach it.\n" +
    "- For CRE learning goals: prefer direct property management / broad CRE operators (e.g. an Operating Partner at a property management firm) over people who only mention CRE topics under LOOKING FOR.\n" +
    "- Example: if choosing between a self-storage COO who wants to learn about construction vs an Operating Partner at a property management firm, pick the property management operator for a CRE-learning reader unless you already have a stronger direct CRE operator.\n" +
    "- Prefer two-way value: candidates who also benefit from meeting the reader.\n" +
    "- Prefer mix-of-angle over three near-duplicates (e.g. market/relationship view + operator + financial/tax angle).\n" +
    "- For CRE-learning readers: do NOT pick three property-management operators. Aim for (a) someone with direct CRE operating experience, (b) a financial/tax or development-adjacent angle if available, (c) a complementary peer — e.g. extensive real-estate background + another professional lens (media, events, relationships).\n" +
    "- If a candidate's OFFER mentions extensive real-estate experience (e.g. 20+ years with a real estate license, Wasatch Front growth), they should usually rank in the top 3 — do not drop them for a second property manager.\n" +
    "- When choosing a third CRE operator between a broad property-management firm (e.g. Philo Property Management) and a narrow self-storage operator (e.g. Management Elevated), pick the broad property manager and leave the self-storage COO out unless you have no better options.\n" +
    "- Skip obvious test or duplicate rows (junk titles, yes.com, duplicate accounts of the reader).\n" +
    "- Pick exactly 3 from the pool. You may ONLY use candidate_user_ids from the pool.\n\n" +
    OFFER_VS_NEED_WRITING_RULES +
    "\nRULES FOR WRITING (per pick):\n" +
    "- why_meet_card (1-2 sentences): start with \"We matched you with {first name} because…\" or \"They're a fit for you because…\". OFFER/role only — never their learning goals as expertise.\n" +
    "- why_meet_paragraph (3-5 sentences): concrete fit from OFFER + role + company; never invert looking-for into offering.\n" +
    "- what_they_are_looking_for (1-2 sentences): gentle summary of what THIS candidate wants (from their looking-for field).\n\n" +
    "Return STRICT JSON only:\n" +
    "{\n  \"ranked_matches\": [\n    { \"candidate_user_id\": \"...\", \"why_meet_card\": \"...\", \"why_meet_paragraph\": \"...\", \"what_they_are_looking_for\": \"...\" }\n  ]\n}\n" +
    "No prose outside the JSON object."
  )
}

function buildRankerUserPrompt(viewer: CanonicalProfile, pool: CanonicalProfile[]): string {
  const candidateBlocks = pool.map((candidate, idx) => {
    return [
      `[${idx + 1}] candidate_user_id: ${candidate.id}`,
      candidateProseBlock(candidate),
    ].join("\n")
  })

  return [
    "READER (the person who will see the cards):",
    viewerProseBlock(viewer),
    "",
    `CANDIDATE POOL (${pool.length} attendees pre-filtered for general fit; pick exactly 3 from this pool):`,
    "",
    candidateBlocks.join("\n\n---\n\n"),
    "",
    "Return JSON with exactly 3 ranked_matches.",
  ].join("\n")
}

function parseRankerResponse(raw: string, poolIds: Set<string>): RankerResult | null {
  const text = cleanText(raw)
  if (!text) return null

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    const match = text.match(/\{[\s\S]*\}$/)
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        parsed = null
      }
    }
  }
  if (!parsed) return null

  const rawMatches = Array.isArray(parsed.ranked_matches) ? parsed.ranked_matches : null
  if (!rawMatches || rawMatches.length === 0) return null

  const rankedIds: string[] = []
  const explanations = new Map<string, StructuredExplanation>()
  const seen = new Set<string>()

  for (const entry of rawMatches) {
    if (!entry || typeof entry !== "object") continue
    const obj = entry as Record<string, unknown>
    const id = cleanText(obj.candidate_user_id)
    if (!id || !poolIds.has(id) || seen.has(id)) continue
    const card = cleanText(obj.why_meet_card)
    const paragraph = cleanText(obj.why_meet_paragraph)
    const lookingFor = cleanText(obj.what_they_are_looking_for)
    if (!card && !paragraph && !lookingFor) continue
    rankedIds.push(id)
    seen.add(id)
    explanations.set(id, {
      why_meet_card: card,
      why_meet_paragraph: paragraph,
      what_they_are_looking_for: lookingFor,
    })
    if (rankedIds.length >= SUGGESTIONS_PER_USER) break
  }

  if (rankedIds.length === 0) return null
  return { rankedIds, explanations }
}

function creRelevanceScore(candidate: CanonicalProfile, opts?: { penalizeNarrowSelfStorage?: boolean }): number {
  const blob =
    `${candidate.jobTitle} ${candidate.company} ${candidate.offerSummary} ${candidate.companySummary}`.toLowerCase()
  let score = 0
  if (/\bproperty management\b/.test(blob)) score += 4
  if (/\bcost segregation\b/.test(blob)) score += 4
  if (/\bsegpro\b/.test(blob)) score += 4
  if (/\breal estate\b/.test(blob)) score += 3
  if (/\bcommercial real estate\b/.test(blob)) score += 3
  if (/\bself[-\s]?storage\b/.test(blob)) score += 2
  const narrowSelfStorage =
    /\bself[-\s]?storage\b/.test(blob) && !/\bproperty management\b/.test(`${candidate.company}`.toLowerCase())
  if (opts?.penalizeNarrowSelfStorage && narrowSelfStorage) score -= 6
  return score
}

function topUpFromPool(
  viewer: CanonicalProfile,
  pool: ScoredCandidate[],
  usedIds: Set<string>,
  llmSelected: ScoredCandidate[],
): void {
  const learningCre =
    viewerWantsDeepTopicLearning(viewer) &&
    /\b(commercial real estate|\bcre\b|real estate|property management)\b/i.test(
      `${viewer.needSummary} ${viewer.needSignal}`,
    )

  const remaining = pool.filter((row) => !usedIds.has(row.candidate.id))
  if (remaining.length === 0) return

  const hasBroadPropertyManager = llmSelected.some((row) =>
    /\bproperty management\b/i.test(`${row.candidate.company} ${row.candidate.jobTitle}`),
  )
  const creOpts = hasBroadPropertyManager ? { penalizeNarrowSelfStorage: true } : undefined

  const ordered = learningCre
    ? [...remaining].sort((a, b) => {
        const creDiff =
          creRelevanceScore(b.candidate, creOpts) - creRelevanceScore(a.candidate, creOpts)
        if (creDiff !== 0) return creDiff
        return deterministicCompare(a, b)
      })
    : remaining

  for (const row of ordered) {
    if (llmSelected.length >= SUGGESTIONS_PER_USER) break
    llmSelected.push(row)
    usedIds.add(row.candidate.id)
  }
}

function viewerWantsDeepTopicLearning(viewer: CanonicalProfile): boolean {
  const text = `${viewer.needSummary} ${viewer.businessNeed} ${viewer.needSignal}`.toLowerCase()
  return /\b(learn|learning|curious about|want to understand|peer learner)\b/.test(text)
}

function rankerPoolSizeFor(viewer: CanonicalProfile): number {
  if (viewerWantsDeepTopicLearning(viewer)) return LLM_RANKER_POOL_SIZE_LEARNING
  return LLM_RANKER_POOL_SIZE
}

/** Merge rule-engine top-N with keyword-relevant profiles so the LLM can see e.g. property managers for CRE learners. */
function buildLlmRankerPool(
  viewer: CanonicalProfile,
  scored: ScoredCandidate[],
  limit: number,
): ScoredCandidate[] {
  const base = selectCandidates(viewer, scored, limit)
  const selectedIds = new Set(base.map((row) => row.candidate.id))

  const learningCre =
    viewerWantsDeepTopicLearning(viewer) &&
    /\b(commercial real estate|\bcre\b|real estate|property management)\b/i.test(
      `${viewer.needSummary} ${viewer.needSignal}`,
    )

  if (!learningCre) return base

  const crePatterns = [
    /\bproperty management\b/i,
    /\bcommercial real estate\b/i,
    /\breal estate\b/i,
    /\bself[-\s]?storage\b/i,
    /\bcost segregation\b/i,
  ]

  const extras: ScoredCandidate[] = []
  for (const row of [...scored].sort(deterministicCompare)) {
    if (selectedIds.has(row.candidate.id)) continue
    const blob = `${row.candidate.jobTitle} ${row.candidate.company} ${row.candidate.offerSummary} ${row.candidate.companySummary}`
    if (!crePatterns.some((re) => re.test(blob))) continue
    extras.push(row)
    selectedIds.add(row.candidate.id)
    if (extras.length >= LLM_RANKER_MAX_EXTRAS) break
  }

  return [...base, ...extras]
}

async function callRankerLlm(
  apiKey: string,
  viewer: CanonicalProfile,
  poolProfiles: CanonicalProfile[],
  poolIds: Set<string>,
): Promise<RankerResult | null> {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildRankerSystemPrompt() },
        { role: "user", content: buildRankerUserPrompt(viewer, poolProfiles) },
      ],
      temperature: 0.25,
      max_tokens: 3000,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error("matchmaker LLM ranker OpenAI error:", response.status, errorBody)
    return null
  }

  const data = await response.json()
  const raw = data?.choices?.[0]?.message?.content || ""
  const result = parseRankerResponse(raw, poolIds)
  if (!result) {
    console.error("matchmaker LLM ranker: failed to parse response", raw.slice(0, 400))
    return null
  }
  if (result.rankedIds.length === 0) {
    console.warn("matchmaker LLM ranker returned no valid picks", raw.slice(0, 400))
    return null
  }
  if (result.rankedIds.length < SUGGESTIONS_PER_USER) {
    console.warn(
      "matchmaker LLM ranker returned fewer than 3 valid picks; will top up if possible",
      result.rankedIds.length,
    )
  }
  return result
}

async function rankAndExplainWithLLM(
  viewer: CanonicalProfile,
  pool: ScoredCandidate[],
): Promise<RankerResult | null> {
  if (pool.length === 0) return null

  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim()
  if (!apiKey) {
    console.warn("matchmaker: OPENAI_API_KEY not set; LLM ranker disabled")
    return null
  }

  const poolProfiles = pool.map((row) => row.candidate)
  const poolIds = new Set(poolProfiles.map((p) => p.id))

  try {
    let result = await callRankerLlm(apiKey, viewer, poolProfiles, poolIds)
    if (!result && poolProfiles.length > 14) {
      const smaller = poolProfiles.slice(0, 14)
      const smallerIds = new Set(smaller.map((p) => p.id))
      result = await callRankerLlm(apiKey, viewer, smaller, smallerIds)
    }
    return result
  } catch (error) {
    console.error("matchmaker LLM ranker failed:", error)
    return null
  }
}

async function refreshStoredMatchExplanations(
  supabase: any,
  eventId: string,
  viewer: CanonicalProfile,
  byId: Map<string, CanonicalProfile>,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from("connections")
    .select("connection_id, a_id, b_id, match_score_breakdown_json")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .eq("created_by_user_id", viewer.id)
    .order("match_score", { ascending: false })
    .limit(SUGGESTIONS_PER_USER)

  if (error) {
    throw new Error(`connections_load_failed: ${error.message}`)
  }
  if (!rows?.length) return 0

  const pseudoSelected: ScoredCandidate[] = []
  for (const row of rows) {
    const otherId = row.a_id === viewer.id ? row.b_id : row.a_id
    const candidate = otherId ? byId.get(otherId) : null
    if (!candidate) continue
    const breakdown =
      row.match_score_breakdown_json && typeof row.match_score_breakdown_json === "object"
        ? row.match_score_breakdown_json
        : {}
    pseudoSelected.push({
      candidate,
      rawScore: typeof breakdown.raw_score === "number" ? breakdown.raw_score : 0,
      normalizedScore:
        typeof breakdown.normalized_score === "number" ? breakdown.normalized_score : 0,
      reasons: Array.isArray(breakdown.reasons) ? breakdown.reasons : [],
      reasonWeights:
        breakdown.reason_weights && typeof breakdown.reason_weights === "object"
          ? breakdown.reason_weights
          : {},
      ruleHits:
        breakdown.rule_hits && typeof breakdown.rule_hits === "object" ? breakdown.rule_hits : {},
    })
  }

  if (pseudoSelected.length === 0) return 0

  const explanationByCandidateId = await generateMatchExplanations(viewer, pseudoSelected)
  let updated = 0

  for (const row of rows) {
    const otherId = row.a_id === viewer.id ? row.b_id : row.a_id
    const explanation = otherId ? explanationByCandidateId.get(otherId) : null
    if (!explanation) continue

    const existingBreakdown =
      row.match_score_breakdown_json && typeof row.match_score_breakdown_json === "object"
        ? (row.match_score_breakdown_json as Record<string, unknown>)
        : {}

    const mergedBreakdown = {
      ...existingBreakdown,
      why_meet_card: explanation.why_meet_card,
      why_meet_paragraph: explanation.why_meet_paragraph,
      what_they_are_looking_for: explanation.what_they_are_looking_for,
    }

    const { error: updateError } = await supabase
      .from("connections")
      .update({
        match_explanation_text: explanation.why_meet_card,
        match_score_breakdown_json: mergedBreakdown,
        match_algorithm_version: MATCH_EXPLANATION_ALGORITHM_VERSION,
      })
      .eq("connection_id", row.connection_id)

    if (updateError) {
      throw new Error(`connections_explanation_update_failed: ${updateError.message}`)
    }
    updated += 1
  }

  return updated
}

const JUNK_TITLE_PATTERN = /^(hi|hey|yo|test|none|n\/?a|tbd|todo|\.+|\?+|-+)$/i
const JUNK_COMPANY_PATTERN = /^(yes\.com|test|example|tbd|n\/?a|none|\.+|\?+|-+)$/i
const JUNK_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "yes.com",
  "test.com",
  "localhost",
])

function emailDomain(email: unknown): string {
  if (typeof email !== "string") return ""
  const at = email.lastIndexOf("@")
  if (at < 0) return ""
  return email.slice(at + 1).trim().toLowerCase()
}

function looksLikeJunkProfile(row: any): boolean {
  const user = row?.users
  if (!user) return true

  const title = cleanText(user.career_title)
  const company = cleanText(user.company_name)
  const domain = emailDomain(user.email)

  if (title && (title.length < 3 || JUNK_TITLE_PATTERN.test(title))) return true
  if (company && JUNK_COMPANY_PATTERN.test(company)) return true
  if (domain && JUNK_EMAIL_DOMAINS.has(domain)) return true

  // Empty everywhere = no signal at all to match on.
  const offer = cleanText(user.offer_summary_text)
  const want = cleanText(user.want_summary_text)
  const expertise = cleanText(user.expertise_summary)
  const summary = cleanText(user.company_summary)
  const needFinal = cleanText(row.need_summary_final)
  const offerFinal = cleanText(row.offer_summary_final)
  if (!title && !company && !offer && !want && !expertise && !summary && !needFinal && !offerFinal) {
    return true
  }

  return false
}

function profileProseWeight(profile: CanonicalProfile): number {
  return (
    profile.needSummary.length +
    profile.offerSummary.length +
    profile.companySummary.length +
    profile.jobTitle.length
  )
}

/**
 * Collapse near-duplicate rows (same lowercased first+last+company).
 * Keep the entry with the richest prose. Never drop the viewer.
 */
function dedupeProfiles(profiles: CanonicalProfile[], viewerUserId?: string): CanonicalProfile[] {
  const byKey = new Map<string, CanonicalProfile>()
  const out: CanonicalProfile[] = []
  for (const profile of profiles) {
    const first = profile.firstName.toLowerCase().trim()
    const last = profile.lastName.toLowerCase().trim()
    const company = profile.company.toLowerCase().trim()
    // No name -> no reliable dedup key. Keep as-is.
    if (!first && !last) {
      out.push(profile)
      continue
    }
    const key = `${first}|${last}|${company}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, profile)
      out.push(profile)
      continue
    }
    // If either is the viewer, always keep the viewer's row.
    if (viewerUserId && existing.id === viewerUserId) continue
    if (viewerUserId && profile.id === viewerUserId) {
      const idx = out.indexOf(existing)
      if (idx >= 0) out.splice(idx, 1)
      byKey.set(key, profile)
      out.push(profile)
      continue
    }
    // Otherwise prefer the entry with richer prose.
    if (profileProseWeight(profile) > profileProseWeight(existing)) {
      const idx = out.indexOf(existing)
      if (idx >= 0) out.splice(idx, 1)
      byKey.set(key, profile)
      out.push(profile)
      console.info("matchmaker dedup: replaced", existing.id, "with", profile.id, "for key", key)
    } else {
      console.info("matchmaker dedup: dropped", profile.id, "in favor of", existing.id, "for key", key)
    }
  }
  return out
}

async function loadCanonicalProfilesForEvent(
  supabase: any,
  eventId: string,
  viewerUserId?: string,
): Promise<CanonicalProfile[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select(PROFILE_SELECT)
    .eq("event_id", eventId)

  if (error) {
    throw new Error(`attendance_load_failed: ${error.message}`)
  }

  const profiles: CanonicalProfile[] = []
  let droppedJunk = 0
  for (const row of data || []) {
    const isViewer = viewerUserId && row?.user_id === viewerUserId
    if (!isViewer && looksLikeJunkProfile(row)) {
      droppedJunk += 1
      console.info("matchmaker dedup: dropped junk row", row?.user_id, {
        title: row?.users?.career_title,
        company: row?.users?.company_name,
        email: row?.users?.email,
      })
      continue
    }
    const profile = toCanonicalProfile(row)
    if (profile) profiles.push(profile)
  }
  if (droppedJunk > 0) {
    console.info("matchmaker dedup: junk rows dropped", droppedJunk)
  }
  return dedupeProfiles(profiles, viewerUserId)
}

function buildById(profiles: CanonicalProfile[]): Map<string, CanonicalProfile> {
  return new Map(profiles.map((profile) => [profile.id, profile]))
}

async function upsertMatches(
  supabase: any,
  eventId: string,
  viewer: CanonicalProfile,
  selected: ScoredCandidate[],
  explanationByCandidateId: Map<string, StructuredExplanation>,
  selectionPath: "rule_engine" | "llm_ranker" = "rule_engine",
): Promise<number> {
  await supabase
    .from("connections")
    .delete()
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .eq("created_by_user_id", viewer.id)

  if (selected.length === 0) return 0

  let persisted = 0

  const rows = selected.map((row) => {
    const candidate = row.candidate
    const pair = viewer.id < candidate.id ? { a: viewer.id, b: candidate.id } : { a: candidate.id, b: viewer.id }
    const explanation = explanationByCandidateId.get(candidate.id) || null

    return {
      event_id: eventId,
      a_id: pair.a,
      b_id: pair.b,
      connection_kind: "system_match",
      created_by_user_id: viewer.id,
      match_score: row.normalizedScore,
      match_score_breakdown_json: {
        raw_score: row.rawScore,
        normalized_score: row.normalizedScore,
        reasons: row.reasons,
        reason_weights: row.reasonWeights,
        rule_hits: row.ruleHits,
        source_primary_intent: viewer.primaryIntent,
        source_secondary_intent: viewer.secondaryIntent,
        candidate_primary_intent: candidate.primaryIntent,
        candidate_secondary_intent: candidate.secondaryIntent,
        source_flags: {
          needs_job: viewer.needsJob,
          needs_internship: viewer.needsInternship,
          needs_customers: viewer.needsCustomers,
          needs_partnerships: viewer.needsPartnerships,
          needs_fundraising_help: viewer.needsFundraisingHelp,
          needs_mentorship: viewer.needsMentorship,
          needs_networking: viewer.needsNetworking,
          can_hire: viewer.canHire,
          can_mentor: viewer.canMentor,
          seniority: viewer.seniority,
        },
        candidate_flags: {
          can_hire: candidate.canHire,
          can_mentor: candidate.canMentor,
          seniority: candidate.seniority,
          offer_capability_family: candidate.offerCapabilityFamily,
          commercial_subtype: candidate.offerCommercialSubtype,
          commercial_role_family: candidate.commercialRoleFamily,
          target_domain: candidate.targetDomain,
          target_role: candidate.targetRole,
        },
        fallback_used: row.fallbackUsed === true,
        selection_rule_version: "needs_offers_rules_v1",
        selection_path: selectionPath,
        why_meet_card: explanation?.why_meet_card || "",
        why_meet_paragraph: explanation?.why_meet_paragraph || "",
        what_they_are_looking_for: explanation?.what_they_are_looking_for || "",
      },
      match_explanation_text: explanation?.why_meet_card || "",
      match_algorithm_version: MATCH_EXPLANATION_ALGORITHM_VERSION,
    }
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const selectedRow = selected[i]

    const { data: existing, error: existingError } = await supabase
      .from("connections")
      .select("connection_id, created_by_user_id, match_score, match_score_breakdown_json")
      .eq("event_id", eventId)
      .eq("connection_kind", "system_match")
      .eq("a_id", row.a_id)
      .eq("b_id", row.b_id)
      .maybeSingle()

    if (existingError) {
      throw new Error(`connections_lookup_failed: ${existingError.message}`)
    }

    if (!existing) {
      const { error: insertError } = await supabase.from("connections").insert(row)
      if (insertError) {
        throw new Error(`connections_insert_failed: ${insertError.message}`)
      }
      persisted += 1
      continue
    }

    const existingRaw =
      typeof existing?.match_score_breakdown_json?.raw_score === "number"
        ? existing.match_score_breakdown_json.raw_score
        : typeof existing?.match_score === "number"
          ? Math.round(existing.match_score * MATCH_SCORE_NORMALIZATION_MAX)
          : 0

    const shouldReplace =
      selectedRow.rawScore > existingRaw + 1 ||
      (selectedRow.rawScore === existingRaw &&
        existing.created_by_user_id !== viewer.id &&
        viewer.id < existing.created_by_user_id)

    if (!shouldReplace) {
      continue
    }

    const { error: updateError } = await supabase
      .from("connections")
      .update({
        created_by_user_id: row.created_by_user_id,
        match_score: row.match_score,
        match_score_breakdown_json: row.match_score_breakdown_json,
        match_explanation_text: row.match_explanation_text,
        match_algorithm_version: row.match_algorithm_version,
      })
      .eq("connection_id", existing.connection_id)

    if (updateError) {
      throw new Error(`connections_update_failed: ${updateError.message}`)
    }
    persisted += 1
  }

  return persisted
}

async function processUser(
  eventId: string,
  userId: string,
  forceRecompute: boolean,
  refreshExplanationsOnly: boolean,
) {
  const supabase = getClient()

  const profiles = await loadCanonicalProfilesForEvent(supabase, eventId, userId)
  const byId = buildById(profiles)
  const viewer = byId.get(userId)

  if (!viewer) {
    return { ok: false, processed: 0, inserted: 0, reason: "viewer_not_found" }
  }

  if (refreshExplanationsOnly) {
    const updated = await refreshStoredMatchExplanations(supabase, eventId, viewer, byId)
    return {
      ok: true,
      processed: updated,
      inserted: updated,
      refreshed_explanations_only: true,
      reason: updated > 0 ? "explanations_refreshed" : "no_viewer_matches_to_refresh",
    }
  }

  if (!forceRecompute) {
    const { data: existing } = await supabase
      .from("connections")
      .select("connection_id, match_explanation_text, match_algorithm_version")
      .eq("event_id", eventId)
      .eq("connection_kind", "system_match")
      .eq("created_by_user_id", userId)
      .order("match_score", { ascending: false })
      .limit(SUGGESTIONS_PER_USER)

    if ((existing?.length ?? 0) >= SUGGESTIONS_PER_USER) {
      const needsRefresh = existing!.some((row: any) =>
        isStaleMatchExplanation(row.match_explanation_text, row.match_algorithm_version),
      )

      if (needsRefresh) {
        const updated = await refreshStoredMatchExplanations(supabase, eventId, viewer, byId)
        return {
          ok: true,
          processed: updated,
          inserted: updated,
          refreshed_explanations_only: true,
          reason: "stale_explanations_refreshed",
        }
      }

      return {
        ok: true,
        processed: existing!.length,
        inserted: 0,
        skipped: true,
        reason: "existing_matches_present",
      }
    }
  }

  const candidates = profiles.filter((profile) => profile.id !== viewer.id)
  if (candidates.length === 0) {
    return { ok: true, processed: 0, inserted: 0, reason: "no_candidates" }
  }

  const scored = candidates.map((candidate) => scorePair(viewer, candidate))

  // Phase 4: pre-filter to a wider pool with the rule engine, then let GPT-4o
  // pick the top 3 from that pool and author the explanations. The rule engine
  // remains the safety-net fallback.
  const poolLimit = rankerPoolSizeFor(viewer)
  const pool = buildLlmRankerPool(viewer, scored, poolLimit)
  const poolById = new Map(pool.map((row) => [row.candidate.id, row]))

  let selected: ScoredCandidate[] = []
  let explanationByCandidateId: Map<string, StructuredExplanation> = new Map()
  let selectionPath: "llm_ranker" | "rule_engine" = "rule_engine"

  const rankerResult = await rankAndExplainWithLLM(viewer, pool)
  if (rankerResult) {
    const llmSelected: ScoredCandidate[] = []
    const usedIds = new Set<string>()
    for (const id of rankerResult.rankedIds) {
      const row = poolById.get(id)
      if (row) {
        llmSelected.push(row)
        usedIds.add(id)
      }
      if (llmSelected.length >= SUGGESTIONS_PER_USER) break
    }

    if (llmSelected.length < SUGGESTIONS_PER_USER) {
      topUpFromPool(viewer, pool, usedIds, llmSelected)
    }

    if (llmSelected.length < SUGGESTIONS_PER_USER) {
      const ruleTop = selectCandidates(viewer, scored, 8)
      for (const row of ruleTop) {
        if (llmSelected.length >= SUGGESTIONS_PER_USER) break
        if (usedIds.has(row.candidate.id)) continue
        llmSelected.push(row)
        usedIds.add(row.candidate.id)
      }
    }

    if (llmSelected.length >= SUGGESTIONS_PER_USER) {
      selected = llmSelected.slice(0, SUGGESTIONS_PER_USER)
      explanationByCandidateId = new Map(rankerResult.explanations)
      const missing = selected.filter((row) => !explanationByCandidateId.has(row.candidate.id))
      if (missing.length > 0) {
        const generated = await generateMatchExplanations(viewer, missing)
        for (const [id, explanation] of generated) {
          explanationByCandidateId.set(id, explanation)
        }
      }
      selectionPath = "llm_ranker"
      console.info("matchmaker: LLM ranker selected", selected.map((row) => row.candidate.id))
    } else {
      console.warn(
        "matchmaker: LLM ranker returned valid response but fewer than 3 pool-matched picks, falling back",
      )
    }
  }

  if (selectionPath === "rule_engine") {
    // Safety-net path: rule engine top-3 + Phase 2 structured-output prompt.
    selected = selectCandidates(viewer, scored, SUGGESTIONS_PER_USER)
    explanationByCandidateId = await generateMatchExplanations(viewer, selected)
    console.info("matchmaker: rule-engine fallback selected", selected.map((row) => row.candidate.id))
  }

  const inserted = await upsertMatches(
    supabase,
    eventId,
    viewer,
    selected,
    explanationByCandidateId,
    selectionPath,
  )

  return {
    ok: true,
    processed: selected.length,
    inserted,
    selection_path: selectionPath,
    matches: selected.map((row) => {
      const explanation = explanationByCandidateId.get(row.candidate.id) || null
      return {
        id: row.candidate.id,
        raw_score: row.rawScore,
        score: row.normalizedScore,
        reason_summary: explanation?.why_meet_card || "",
        why_meet_card: explanation?.why_meet_card || "",
        why_meet_paragraph: explanation?.why_meet_paragraph || "",
        what_they_are_looking_for: explanation?.what_they_are_looking_for || "",
        reasons: row.reasons,
        fallback_used: row.fallbackUsed === true,
      }
    }),
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  const eventId = cleanText(payload?.event_id)
  const userId = cleanText(payload?.user_id)
  const forceRecompute = payload?.force_recompute === true
  const refreshExplanationsOnly = payload?.refresh_explanations_only === true

  if (!eventId || !userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "event_id and user_id required" }),
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const startedAt = Date.now()
  try {
    const result = await processUser(eventId, userId, forceRecompute, refreshExplanationsOnly)
    return new Response(
      JSON.stringify({
        ...result,
        runtime_ms: Date.now() - startedAt,
      }),
      { status: 200, headers: CORS_HEADERS },
    )
  } catch (error: any) {
    console.error("matchmaker_v5_error", {
      eventId,
      userId,
      error: error?.message ?? String(error),
      stack: error?.stack,
    })

    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? String(error) }),
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
