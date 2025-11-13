import { CandidateProfile, ScoredCandidate, ViewerProfile, ScoreBreakdown } from "./types.ts"
import { clamp, cosineSimilarity, jaccard, tokenize } from "./math.ts"
import { canonicalizeRole, deriveBuyerPersona, isLeadershipTitle, normalizeCompanyInput } from "./personas.ts"

export type CommercialFocus = "clients" | "partners" | "buy" | "cofounder"

export interface CommercialSignals {
  tokens: string[]
  focuses: CommercialFocus[]
}

export interface ViewerIntentContext {
  intent: string
  mode?: "mentor" | "mentee"
}

const BASE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "those",
  "these",
  "into",
  "onto",
  "about",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "need",
  "needs",
  "needing",
  "help",
  "helping",
  "support",
  "supporting",
  "looking",
  "seeking",
  "searching",
  "find",
  "finding",
  "someone",
  "anyone",
  "everyone",
  "thing",
  "things",
  "area",
  "areas",
  "space",
  "spaces",
  "industry",
  "industries",
  "company",
  "companies",
  "business",
  "team",
  "teams",
  "work",
  "working",
  "build",
  "building",
  "grow",
  "growing",
  "growth",
  "create",
  "creating",
  "new",
  "next",
  "also",
  "just",
  "really",
  "like",
  "love",
  "enjoy",
  "enjoys",
  "enjoying",
  "interested",
  "interest",
  "interests",
  "passion",
  "passionate",
  "opportunity",
  "opportunities",
  "role",
  "roles",
  "job",
  "jobs",
  "position",
  "positions",
  "career",
  "careers",
  "experience",
  "experiences",
  "skill",
  "skills",
  "skillset",
  "skillsets",
  "background",
  "backgrounds",
  "idea",
  "ideas",
  "project",
  "projects",
  "learn",
  "learning",
  "teach",
  "teaching",
  "mentor",
  "mentorship",
  "coach",
  "coaching",
  "guidance",
  "advice",
  "insight",
  "insights",
  "share",
  "sharing",
  "connect",
  "connecting",
  "connection",
  "connections"
])

const ROLE_STOPWORDS = new Set([
  "company",
  "companies",
  "team",
  "teams",
  "business",
  "organization",
  "organizations",
  "department",
  "departments",
  "role",
  "roles",
  "job",
  "jobs",
  "position",
  "positions",
  "career",
  "careers",
  "opportunity",
  "opportunities",
  "talent",
  "candidate",
  "candidates",
  "experience",
  "experiences"
])

const HOBBY_STOPWORDS = new Set([
  "love",
  "loving",
  "enjoy",
  "enjoys",
  "enjoying",
  "like",
  "likes",
  "fun",
  "favorite",
  "favorites",
  "passion",
  "passionate",
  "interested",
  "interest",
  "interests",
  "trying",
  "exploring",
  "learning",
  "new",
  "things",
  "thing",
  "hobby",
  "hobbies"
])

const MENTORSHIP_STOPWORDS = new Set([
  "mentor",
  "mentors",
  "mentorship",
  "guidance",
  "help",
  "support",
  "advice",
  "coaching",
  "coach",
  "teach",
  "teaching",
  "learn",
  "learning",
  "insight",
  "insights",
  "someone",
  "anyone",
  "need",
  "needs",
  "needing",
  "looking",
  "seeking",
  "find",
  "finding",
  "helping",
  "supporting",
  "figure",
  "figuring"
])

const COMMERCIAL_STOPWORDS = new Set([
  "client",
  "clients",
  "customer",
  "customers",
  "buyer",
  "buyers",
  "buy",
  "selling",
  "sell",
  "sales",
  "revenue",
  "deal",
  "deals",
  "pipeline",
  "partner",
  "partners",
  "partnership",
  "partnerships",
  "cofounder",
  "cofounders",
  "channel",
  "channels",
  "distributor",
  "distributors",
  "vendor",
  "vendors",
  "suppliers",
  "supplier"
])

const COMMERCIAL_CLIENT_HINTS = [
  "client",
  "clients",
  "customer",
  "customers",
  "buyer",
  "buyers",
  "sales",
  "sell",
  "selling",
  "revenue",
  "prospect",
  "prospects",
  "lead",
  "leads",
  "pipeline",
  "deal",
  "deals",
  "business development",
  "biz dev",
  "bizdev",
  "gtm"
]

const COMMERCIAL_PARTNER_HINTS = [
  "partner",
  "partners",
  "partnership",
  "partnerships",
  "co-sell",
  "cosell",
  "co sell",
  "alliance",
  "alliances",
  "channel",
  "channels",
  "integration",
  "integrations",
  "collaborate",
  "collaboration"
]

const COMMERCIAL_BUY_HINTS = [
  "buy",
  "purchase",
  "purchasing",
  "procure",
  "procurement",
  "vendor",
  "vendors",
  "supplier",
  "suppliers",
  "tool",
  "tools",
  "platform",
  "platforms",
  "solution",
  "solutions",
  "evaluate",
  "evaluation"
]

const COMMERCIAL_COFUNDER_HINTS = [
  "cofounder",
  "co-founder",
  "co founder",
  "founding team",
  "start a company",
  "starting a company",
  "build a startup",
  "build an startup",
  "build a business",
  "launch a startup"
]

const COMMERCIAL_COMPATIBILITY: Record<CommercialFocus, CommercialFocus[]> = {
  clients: ["buy", "partners", "clients", "cofounder"],
  partners: ["partners", "clients", "cofounder"],
  buy: ["clients", "partners"],
  cofounder: ["cofounder", "partners", "clients"]
}

const RECRUITER_HINTS = [
  "recruiter",
  "recruiting",
  "talent acquisition",
  "talent partner",
  "talent manager",
  "people operations",
  "people ops",
  "people partner",
  "hr",
  "human resources",
  "technical recruiter",
  "sourcer",
  "sourcing"
]

const HIRING_HINTS = [
  "hire",
  "hiring",
  "hiring for",
  "recruit",
  "talent",
  "headcount",
  "staff",
  "staffing",
  "fill role",
  "fill roles",
  "fill positions",
  "grow the team",
  "growing the team",
  "build the team",
  "building the team",
  "adding to the team",
  "expand the team"
]

const JOB_SEEKING_KEYS = ["find_job", "job_seeking", "find_a_job"]
const COMMERCIAL_KEYS = ["biz_opps", "commercial", "discover_business_opportunities"]
const HOBBY_KEYS = ["general", "other"]
const MENTORSHIP_KEYS = ["find_mentor"]

const tokenizeLoose = (text?: string | null): string[] =>
  (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1)

const includesAny = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}

const canonicalizeKey = (key?: string | null): string => {
  if (!key) return ""
  return key.toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_")
}

const shouldKeepToken = (token: string, extraStops?: Set<string>) => {
  if (!token) return false
  if (BASE_STOPWORDS.has(token)) return false
  if (extraStops && extraStops.has(token)) return false
  return true
}

const pushTokens = (bucket: Set<string>, text?: string | null, extraStops?: Set<string>) => {
  if (!text) return
  for (const token of tokenizeLoose(text)) {
    if (shouldKeepToken(token, extraStops)) {
      bucket.add(token)
    }
  }
}

const collectFollowupTexts = (
  followUps: Record<string, string> | null | undefined,
  keys?: string[]
): string[] => {
  if (!followUps) return []
  const selected = keys?.map(canonicalizeKey)
  const texts: string[] = []
  for (const [rawKey, value] of Object.entries(followUps)) {
    if (typeof value !== "string") continue
    const normalizedKey = canonicalizeKey(rawKey)
    if (selected && selected.length > 0 && !selected.includes(normalizedKey)) continue
    const cleaned = value.trim()
    if (!cleaned) continue
    texts.push(cleaned)
  }
  return texts
}

const findSharedToken = (a: string[], b: string[]): string | undefined => {
  if (!a.length || !b.length) return undefined
  const set = new Set(b.map((token) => token.toLowerCase()))
  for (const token of a) {
    const lower = token.toLowerCase()
    if (set.has(lower)) return token
  }
  return undefined
}

export function extractRoleSkillTokens(
  followUps: Record<string, string> | null | undefined,
  options: {
    businessNeed?: string | null
    extra?: string[]
    keys?: string[]
  } = {}
): string[] {
  const { businessNeed, extra = [], keys = JOB_SEEKING_KEYS } = options
  const texts = collectFollowupTexts(followUps, keys)
  if (businessNeed) texts.push(businessNeed)
  for (const text of extra) if (text) texts.push(text)

  const tokens = new Set<string>()
  for (const text of texts) {
    pushTokens(tokens, text, ROLE_STOPWORDS)
  }
  return Array.from(tokens)
}

export function extractCommercialSignals(
  followUps: Record<string, string> | null | undefined,
  options: {
    businessNeed?: string | null
    extra?: string[]
    keys?: string[]
  } = {}
): CommercialSignals {
  const { businessNeed, extra = [], keys = COMMERCIAL_KEYS } = options
  const texts = collectFollowupTexts(followUps, keys)
  if (businessNeed) texts.push(businessNeed)
  for (const text of extra) if (text) texts.push(text)

  const tokens = new Set<string>()
  const focuses = new Set<CommercialFocus>()

  for (const text of texts) {
    const lower = text.toLowerCase()
    if (includesAny(lower, COMMERCIAL_COFUNDER_HINTS)) focuses.add("cofounder")
    if (includesAny(lower, COMMERCIAL_BUY_HINTS)) focuses.add("buy")
    if (includesAny(lower, COMMERCIAL_PARTNER_HINTS)) focuses.add("partners")
    if (
      includesAny(lower, COMMERCIAL_CLIENT_HINTS) ||
      includesAny(lower, COMMERCIAL_PARTNER_HINTS) ||
      includesAny(lower, COMMERCIAL_BUY_HINTS)
    ) {
      focuses.add("clients")
    }
    pushTokens(tokens, text, COMMERCIAL_STOPWORDS)
  }

  return {
    tokens: Array.from(tokens),
    focuses: Array.from(focuses)
  }
}

export function extractHobbyTokens(
  followUps: Record<string, string> | null | undefined,
  options: {
    extra?: string[]
    keys?: string[]
  } = {}
): string[] {
  const { extra = [], keys = HOBBY_KEYS } = options
  const texts = collectFollowupTexts(followUps, keys)
  for (const text of extra) if (text) texts.push(text)

  const tokens = new Set<string>()
  for (const text of texts) {
    pushTokens(tokens, text, HOBBY_STOPWORDS)
  }
  return Array.from(tokens)
}

export function extractMentorshipNeed(
  businessNeed: string | null | undefined,
  followUps: Record<string, string> | null | undefined,
  options: {
    extra?: string[]
    keys?: string[]
  } = {}
): string[] {
  const { extra = [], keys = MENTORSHIP_KEYS } = options
  const texts = collectFollowupTexts(followUps, keys)

  if (businessNeed) {
    const lower = businessNeed.toLowerCase()
    if (
      includesAny(lower, [
        "learn",
        "learning",
        "guidance",
        "advice",
        "mentor",
        "mentorship",
        "coaching",
        "coach",
        "help",
        "support",
        "figure out",
        "figuring out",
        "level up",
        "improve",
        "develop",
        "developing",
        "upskill",
        "upskilling"
      ])
    ) {
      texts.push(businessNeed)
    }
  }

  for (const text of extra) if (text) texts.push(text)

  const tokens = new Set<string>()
  for (const text of texts) {
    pushTokens(tokens, text, MENTORSHIP_STOPWORDS)
  }

  return Array.from(tokens)
}

export const DEFAULT_MATCH_WEIGHTS = {
  need: 0.42,
  supply: 0.18,
  vibe: 0.15,
  common: 0.12,
  career: 0.1,
  personality: 0.03
}

function overlapTokens(
  viewerTokens?: string[] | null,
  candidateTokens?: string[] | null
): { score: number; token?: string } {
  if (!viewerTokens || !candidateTokens || viewerTokens.length === 0 || candidateTokens.length === 0) {
    return { score: 0 }
  }
  const viewerSet = new Set(viewerTokens.map((token) => token?.toLowerCase()))
  let bestToken: string | undefined
  let bestScore = 0

  for (const token of candidateTokens) {
    if (!token) continue
    const lower = token.toLowerCase()
    if (viewerSet.has(lower)) {
      bestToken = lower
      bestScore = 1
      break
    }
  }

  return { score: bestScore, token: bestToken }
}

function sharedHobby(viewer: ViewerProfile, candidate: CandidateProfile): string | undefined {
  const viewerHobbies = viewer.hobbyTags ?? viewer.hobbies ?? []
  const candidateHobbies = candidate.hobbyTags ?? candidate.hobbies ?? []
  const set = new Set(candidateHobbies.map((hobby) => hobby?.toLowerCase()))
  for (const hobby of viewerHobbies) {
    if (!hobby) continue
    if (set.has(hobby.toLowerCase())) {
      return hobby
    }
  }
  return undefined
}

function careerSimilarity(viewer: ViewerProfile, candidate: CandidateProfile): number {
  const titleScore = jaccard(tokenize(viewer.jobTitle), tokenize(candidate.jobTitle))
  const companyScore =
    viewer.company && candidate.company
      ? viewer.company.toLowerCase() === candidate.company.toLowerCase()
        ? 1
        : 0
      : 0
  const experience = viewer.careerYears !== null && candidate.careerYears !== null
    ? clamp(1 - Math.abs((viewer.careerYears ?? 0) - (candidate.careerYears ?? 0)) / 10)
    : 0.5

  return clamp(titleScore * 0.6 + companyScore * 0.3 + experience * 0.1)
}

export function scoreCandidates(
  viewer: ViewerProfile,
  candidates: CandidateProfile[],
  weights = DEFAULT_MATCH_WEIGHTS,
  viewerIntent?: ViewerIntentContext
): ScoredCandidate[] {
  const viewerFollowUps = viewer.followUps ?? null
  const viewerBusinessNeed = viewer.businessNeed ?? null
  const viewerExtraTexts: string[] = []
  if (viewer.whyAttending) viewerExtraTexts.push(viewer.whyAttending)

  const viewerConnectionSet = new Set((viewer.connectionTypes ?? []).map(canonicalizeKey))

  const viewerRoleTokens = extractRoleSkillTokens(viewerFollowUps, {
    businessNeed: viewerBusinessNeed,
    extra: viewerExtraTexts,
    keys: [...JOB_SEEKING_KEYS, "find_job"]
  })
  const viewerMentorTokens = extractRoleSkillTokens(viewerFollowUps, {
    businessNeed: viewerBusinessNeed,
    extra: viewerExtraTexts,
    keys: ["be_mentor"]
  })
  const viewerMentorshipNeedTokens = extractMentorshipNeed(viewerBusinessNeed, viewerFollowUps, {
    extra: viewerExtraTexts,
    keys: ["find_mentor"]
  })
  const viewerCommercialSignals = extractCommercialSignals(viewerFollowUps, {
    businessNeed: viewerBusinessNeed,
    extra: viewerExtraTexts
  })
  const viewerHobbyTokens = extractHobbyTokens(viewerFollowUps, { extra: viewerExtraTexts })
  const viewerOfferTokens = (viewer.offerTags ?? []).map((token) => token.toLowerCase())
  const viewerNeedTokens = (viewer.needTags ?? []).map((token) => token.toLowerCase())

  const resolvedViewerIntent =
    viewerIntent?.intent ??
    (viewerConnectionSet.has("find_mentor")
      ? "mentorship"
      : viewerConnectionSet.has("be_mentor")
      ? "mentorship"
      : viewerConnectionSet.has("biz_opps")
      ? "commercial"
      : viewerConnectionSet.has("find_job")
      ? "job_seeking"
      : undefined)

  const resolveCommercialFocuses = (focuses: CommercialFocus[], connections: Set<string>): CommercialFocus[] => {
    const bucket = new Set<CommercialFocus>(focuses)
    if (
      connections.has("biz_opps") ||
      connections.has("commercial") ||
      connections.has("discover_business_opportunities")
    ) {
      bucket.add("clients")
      bucket.add("partners")
    }
    if (connections.has("other")) {
      bucket.add("cofounder")
    }
    if (bucket.size === 0 && (resolvedViewerIntent === "commercial" || connections.has("biz_opps"))) {
      bucket.add("clients")
    }
    return Array.from(bucket)
  }

  const viewerCommercialFocuses = resolveCommercialFocuses(viewerCommercialSignals.focuses, viewerConnectionSet)
  const viewerMentorMode =
    viewerIntent?.mode ??
    (viewerConnectionSet.has("be_mentor")
      ? "mentor"
      : viewerConnectionSet.has("find_mentor")
      ? "mentee"
      : undefined)

  return candidates.map((candidate) => {
    // Canonicalize roles once per candidate and viewer
    const viewerRole = canonicalizeRole(viewer.jobTitle)
    const candidateRole = canonicalizeRole(candidate.jobTitle)
  const viewerTextForSector = [
      viewer.businessNeed ?? "",
    normalizeCompanyInput(viewer.company) ?? "",
      (viewer.needTags ?? []).join(",")
    ].join(" ")
    const viewerPersona = deriveBuyerPersona(viewerTextForSector, viewerRole, resolvedViewerIntent ?? "general")
    const candidateFollowUps = candidate.followUps ?? null
    const candidateExtraTexts = [candidate.offerSummary ?? "", candidate.wantSummary ?? ""].filter(Boolean) as string[]
    const candidateConnectionSet = new Set((candidate.connectionTypes ?? []).map(canonicalizeKey))
    const candidateBusinessNeed = candidate.businessNeed ?? null

    const candidateJobTokens = extractRoleSkillTokens(candidateFollowUps, {
      businessNeed: candidateBusinessNeed,
      extra: candidateExtraTexts,
      keys: [...JOB_SEEKING_KEYS, "recruit"]
    })
    const candidateMentorTokens = extractRoleSkillTokens(candidateFollowUps, {
      businessNeed: candidateBusinessNeed,
      extra: candidateExtraTexts,
      keys: ["be_mentor"]
    })
    const candidateMentorshipNeedTokens = extractMentorshipNeed(candidateBusinessNeed, candidateFollowUps, {
      extra: candidateExtraTexts,
      keys: ["find_mentor"]
    })
    const candidateCommercialSignals = extractCommercialSignals(candidateFollowUps, {
      businessNeed: candidateBusinessNeed,
      extra: candidateExtraTexts
    })
    const candidateCommercialFocuses = resolveCommercialFocuses(candidateCommercialSignals.focuses, candidateConnectionSet)
    const candidateHobbyTokens = extractHobbyTokens(candidateFollowUps, { extra: candidateExtraTexts })

    const candidateNeedTokenSet = new Set(
      (candidate.needTags ?? []).map((token) => token?.toLowerCase()).filter(Boolean) as string[]
    )
    const candidateOfferTokenSet = new Set(
      (candidate.offerTags ?? []).map((token) => token?.toLowerCase()).filter(Boolean) as string[]
    )
    const candidateJobTitleTokens = tokenizeLoose(candidate.jobTitle)
    const candidateBusinessNeedLower = (candidateBusinessNeed ?? "").toLowerCase()
    const candidateOfferSummaryLower = (candidate.offerSummary ?? "").toLowerCase()
    const candidateCompanyLower = normalizeCompanyInput(candidate.company ?? "").toLowerCase()

    const needEmbeddingScore = cosineSimilarity(viewer.needEmbedding, candidate.offerEmbedding)
    const needTokenOverlap = overlapTokens(viewer.needTags, candidate.offerTags)
    const needScore = Math.max(needEmbeddingScore, needTokenOverlap.score)

    const supplyEmbeddingScore = cosineSimilarity(viewer.offerEmbedding, candidate.needEmbedding)
    const supplyTokenOverlap = overlapTokens(candidate.needTags, viewer.offerTags)
    const supplyScore = Math.max(supplyEmbeddingScore, supplyTokenOverlap.score)

    const vibeScore = cosineSimilarity(viewer.profileEmbedding, candidate.profileEmbedding)

    const hobbyOverlap = jaccard(viewer.hobbyTags ?? viewer.hobbies, candidate.hobbyTags ?? candidate.hobbies)
    const followupHobbyOverlap = jaccard(viewerHobbyTokens, candidateHobbyTokens)
    const industryOverlap = jaccard(viewer.industryTags, candidate.industryTags)
    const commonScore = Math.max(hobbyOverlap, industryOverlap, followupHobbyOverlap)

    const careerScore = careerSimilarity(viewer, candidate)
    const personalityScore = cosineSimilarity(viewer.personalityEmbedding, candidate.personalityEmbedding)

    const breakdown: ScoreBreakdown = {
      s_need: needScore,
      s_supply: supplyScore,
      s_vibe: vibeScore,
      s_common: commonScore,
      s_career: careerScore,
      s_personality: personalityScore
    }

    let composite =
      weights.need * needScore +
      weights.supply * supplyScore +
      weights.vibe * vibeScore +
      weights.common * commonScore +
      weights.career * careerScore +
      weights.personality * personalityScore

    if (needScore > 0.6 && supplyScore > 0.4) {
      composite *= 1.15
    } else if (needScore > 0.6) {
      composite *= 1.05
    }

    const bases: string[] = []
    const meta: ScoredCandidate["meta"] = {}

    if (needTokenOverlap.token) meta.needToken = needTokenOverlap.token
    if (supplyTokenOverlap.token) meta.supplyToken = supplyTokenOverlap.token

    const hobby = sharedHobby(viewer, candidate)
    if (hobby) {
      meta.sharedHobby = hobby
    } else if (followupHobbyOverlap > 0.25) {
      const shared = findSharedToken(viewerHobbyTokens, candidateHobbyTokens)
      if (shared) meta.sharedHobby = shared
    }
    meta.viewerRole = viewerRole
    meta.candidateRole = candidateRole
    meta.viewerPersona = viewerPersona

    const candidateIsRecruiter =
      candidateConnectionSet.has("recruit") ||
      includesAny(candidate.jobTitle ?? "", RECRUITER_HINTS)
    const candidateIsHiring =
      candidateIsRecruiter ||
      candidateNeedTokenSet.has("hiring") ||
      includesAny(candidateBusinessNeedLower, HIRING_HINTS)

    let intentBoost = 0
    let connectionBoost = 0
    const intentBases: string[] = []

    if (resolvedViewerIntent === "job_seeking") {
      const roleOverlap = overlapTokens(viewerRoleTokens, candidateJobTokens)
      const roleSimilarity = jaccard(viewerRoleTokens, candidateJobTokens)
      const titleSimilarity = jaccard(viewerRoleTokens, candidateJobTitleTokens)
      let jobFocus: string | undefined

      if (candidateIsRecruiter) {
        const boost = roleSimilarity > 0 ? 0.06 + Math.min(roleSimilarity, 0.6) * 0.18 : 0.05
        if (boost > intentBoost) intentBoost = boost
        jobFocus = "recruiter"
      } else if (candidateIsHiring) {
        const boost = roleSimilarity > 0 ? 0.05 + Math.min(roleSimilarity, 0.5) * 0.16 : 0.045
        if (boost > intentBoost) intentBoost = boost
        jobFocus = "hiring_manager"
      } else if (titleSimilarity > 0.35) {
        const boost = 0.04 + Math.min(titleSimilarity, 0.5) * 0.12
        if (boost > intentBoost) intentBoost = boost
        jobFocus = "peer_role"
      }

      if (intentBoost > 0) {
        if (roleOverlap.token) meta.intentToken = roleOverlap.token
        if (jobFocus) meta.intentFocus = jobFocus
        intentBases.push("job_fit")
      }
      connectionBoost = Math.max(
        connectionBoost,
        clamp(Math.max(roleSimilarity, titleSimilarity, candidateIsRecruiter ? 0.9 : candidateIsHiring ? 0.7 : 0))
      )
    }

    if (resolvedViewerIntent === "commercial") {
      const viewerFocuses = viewerCommercialFocuses
      const candidateFocuses =
        candidateCommercialFocuses.length > 0
          ? candidateCommercialFocuses
          : resolveCommercialFocuses([], candidateConnectionSet)

      const commercialOverlap = jaccard(viewerCommercialSignals.tokens, candidateCommercialSignals.tokens)
      let matchedFocus: CommercialFocus | undefined

      for (const focus of viewerFocuses) {
        const compatible = COMMERCIAL_COMPATIBILITY[focus]
        if (!compatible) continue
        for (const candidateFocus of candidateFocuses) {
          if (!compatible.includes(candidateFocus)) continue
          const base = candidateFocus === focus ? 0.055 : 0.045
          const bonus = commercialOverlap > 0 ? Math.min(commercialOverlap, 0.6) * 0.18 : 0
          const boost = base + bonus
          if (boost > intentBoost) {
            intentBoost = boost
            matchedFocus = candidateFocus
          }
        }
      }

      if (!matchedFocus && commercialOverlap > 0.35) {
        const boost = 0.04 + Math.min(commercialOverlap, 0.5) * 0.12
        if (boost > intentBoost) {
          intentBoost = boost
          matchedFocus = viewerFocuses[0]
        }
      }

      if (intentBoost > 0) {
        const sharedCommercialToken = findSharedToken(
          viewerCommercialSignals.tokens,
          candidateCommercialSignals.tokens
        )
        if (sharedCommercialToken && !meta.intentToken) meta.intentToken = sharedCommercialToken
        if (matchedFocus) meta.intentFocus = `commercial:${matchedFocus}`
        intentBases.push("commercial")
      }
      const commercialOverlap2 = jaccard(viewerCommercialSignals.tokens, candidateCommercialSignals.tokens)
      const focusBonus = matchedFocus ? 0.2 : 0
      connectionBoost = Math.max(connectionBoost, clamp(Math.min(commercialOverlap2 + focusBonus, 1)))
    }

    if (resolvedViewerIntent === "mentorship") {
      const mode = viewerMentorMode ?? viewerIntent?.mode
      if (mode === "mentor") {
        const menteeOverlap = jaccard(
          viewerMentorTokens.length ? viewerMentorTokens : viewerOfferTokens,
          candidateMentorshipNeedTokens
        )
        if (menteeOverlap > 0.2 || candidateConnectionSet.has("find_mentor")) {
          const boost = 0.05 + Math.min(menteeOverlap, 0.6) * 0.15
          if (boost > intentBoost) intentBoost = boost
          if (!meta.intentToken) {
            const shared = findSharedToken(viewerMentorTokens, candidateMentorshipNeedTokens)
            if (shared) meta.intentToken = shared
          }
          meta.intentFocus = "mentor"
          intentBases.push("mentorship")
        }
        connectionBoost = Math.max(connectionBoost, clamp(menteeOverlap))
      } else {
        const mentorTokens = [
          ...candidateMentorTokens,
          ...Array.from(candidateOfferTokenSet),
          ...tokenizeLoose(candidate.jobTitle)
        ]
        const mentorOverlap = jaccard(
          viewerMentorshipNeedTokens.length ? viewerMentorshipNeedTokens : viewerNeedTokens,
          mentorTokens
        )
        if (mentorOverlap > 0.2 || candidateConnectionSet.has("be_mentor")) {
          const boost = 0.05 + Math.min(mentorOverlap, 0.6) * 0.15
          if (boost > intentBoost) intentBoost = boost
          if (!meta.intentToken) {
            const shared = findSharedToken(viewerMentorshipNeedTokens, mentorTokens)
            if (shared) meta.intentToken = shared
          }
          meta.intentFocus = "mentee"
          intentBases.push("mentorship")
        }
        connectionBoost = Math.max(connectionBoost, clamp(mentorOverlap))
      }
    } else if (viewerMentorshipNeedTokens.length > 0) {
      const mentorTokens = [
        ...candidateMentorTokens,
        ...Array.from(candidateOfferTokenSet)
      ]
      const mentorOverlap = jaccard(viewerMentorshipNeedTokens, mentorTokens)
      if (
        mentorOverlap > 0.28 &&
        (candidateConnectionSet.has("be_mentor") || includesAny(candidateOfferSummaryLower, ["mentor", "guidance", "coaching"]))
      ) {
        const boost = 0.04 + Math.min(mentorOverlap, 0.5) * 0.12
        if (boost > intentBoost) intentBoost = boost
        if (!meta.intentToken) {
          const shared = findSharedToken(viewerMentorshipNeedTokens, mentorTokens)
          if (shared) meta.intentToken = shared
        }
        meta.intentFocus = "implicit_mentorship"
        intentBases.push("mentorship")
      }
      connectionBoost = Math.max(connectionBoost, clamp(mentorOverlap))
    }

    if (viewerConnectionSet.has("general") && viewerHobbyTokens.length && candidateHobbyTokens.length) {
      const followupOverlap = jaccard(viewerHobbyTokens, candidateHobbyTokens)
      if (followupOverlap > 0.3) {
        const boost = 0.03 + Math.min(followupOverlap, 0.4) * 0.08
        if (boost > intentBoost) intentBoost = boost
        if (!meta.intentToken) {
          const shared = findSharedToken(viewerHobbyTokens, candidateHobbyTokens)
          if (shared) meta.intentToken = shared
        }
        if (!meta.intentFocus) meta.intentFocus = "general"
        intentBases.push("interests")
      }
      connectionBoost = Math.max(connectionBoost, clamp(followupOverlap))
    }

    if (intentBoost > 0) {
      composite = clamp(composite + intentBoost)
    }

    // Company targeting bonus for commercial viewers
    if ((viewerPersona?.target_companies?.length ?? 0) > 0 && candidateCompanyLower) {
      const setTargets = new Set((viewerPersona!.target_companies ?? []).map((c) => c.toLowerCase()))
      for (const t of setTargets) {
        if (t && candidateCompanyLower.includes(t)) {
          composite = clamp(composite + 0.03)
          break
        }
      }
    }

    composite = clamp(composite)

    if (needScore > 0.3) bases.push("need")
    if (supplyScore > 0.3) bases.push("supply")
    if (vibeScore > 0.25) bases.push("vibe")
    if (commonScore > 0.2) bases.push("interests")
    if (careerScore > 0.2) bases.push("career")
    if (personalityScore > 0.25) bases.push("compatibility")
    bases.push(...intentBases)

    meta.connectionBoost = clamp(connectionBoost)

    return {
      candidate,
      score: composite,
      breakdown,
      bases,
      meta
    }
  })
}

