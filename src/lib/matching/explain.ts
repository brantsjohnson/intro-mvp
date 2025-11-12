import type { Json } from "@/lib/database.types"

export type AttendeeSnapshot = {
  user_id: string
  first_name?: string | null
  last_name?: string | null
  business_need_text?: string | null
  event_offer_tags?: string[] | null
  event_want_tags?: string[] | null
  connection_followups_json?: Json | null
  hobbies?: string[] | null
  career_title?: string | null
  company_name?: string | null
}

export type MatchExplanationOptions = {
  maxWords?: number
  buyerRoleWeight?: boolean
  allowSharedHobby?: boolean
}

const DEFAULT_OPTIONS: Required<MatchExplanationOptions> = {
  maxWords: 30,
  buyerRoleWeight: true,
  allowSharedHobby: true,
}

const WANT_SLUGS_CLIENTS = new Set([
  "business_opportunities",
  "clients",
  "sales",
  "partnerships",
  "biz_opps",
  "business-opportunities",
  "partnership",
])

const WANT_SLUGS_JOBS = new Set([
  "job_opportunities",
  "find_job",
  "recruit",
  "hiring",
  "jobs",
  "talent",
])

const BOILERPLATE_SNIPPETS = [
  "they're attending because",
  "they are attending because",
  "they're here because",
  "they are here because",
  "they're looking to connect with like-minded",
]

const normStrings = (items?: string[] | null): string[] =>
  (items ?? [])
    .map((s) => (s || "").toLowerCase().trim())
    .filter(Boolean)

const anyWantClients = (wants: string[]) => wants.some((w) => WANT_SLUGS_CLIENTS.has(w))
const anyWantJobs = (wants: string[]) => wants.some((w) => WANT_SLUGS_JOBS.has(w))

const isBuyerRole = (title?: string | null) => {
  if (!title) return false
  const t = title.toLowerCase()
  return /(founder|ceo|owner|director|vp|head|lead|manager|executive|principal|partner)/.test(t)
}

const isBuyerCompany = (company?: string | null) => {
  if (!company) return false
  const n = company.toLowerCase()
  return /(agency|studio|consulting|labs|solutions|systems|group|capital|ventures|marketing|advisors)/.test(n)
}

const fromFollowupsBizLabel = (followup: Json | null | undefined): string | null => {
  if (!followup || typeof followup !== "object") return null
  const candidate =
    (followup as Record<string, unknown>)?.biz_opps ??
    (followup as Record<string, unknown>)?.business ??
    (followup as Record<string, unknown>)?.opportunities

  if (!candidate || typeof candidate !== "string") return null
  const lower = candidate.toLowerCase()
  if (lower.includes("ai")) return "AI/ML consulting"
  if (lower.includes("e-commerce")) return "E-commerce strategy"
  return candidate.split(/[.;,]/)[0].slice(0, 60).trim() || null
}

const recruitingRoles = (followup: Json | null | undefined): string | null => {
  if (!followup || typeof followup !== "object") return null
  const candidate =
    (followup as Record<string, unknown>)?.recruit ??
    (followup as Record<string, unknown>)?.hiring ??
    (followup as Record<string, unknown>)?.roles
  if (!candidate || typeof candidate !== "string") return null
  const lower = candidate.toLowerCase()
  if (/(engineer|product|pm|design)/.test(lower)) {
    return "Hiring for product/design/engineering"
  }
  return "Hiring"
}

const sharedHobby = (u: string[] = [], v: string[] = []): string | null => {
  if (!u.length || !v.length) return null
  const set = new Set(u.map((item) => item.toLowerCase()))
  for (const item of v) {
    if (set.has((item || "").toLowerCase())) {
      return item
    }
  }
  return null
}

const mergeOptions = (options?: MatchExplanationOptions): Required<MatchExplanationOptions> => ({
  ...DEFAULT_OPTIONS,
  ...options,
})

const formatDisplayName = (attendee: AttendeeSnapshot, fallback = "This attendee") => {
  if (attendee.first_name) return attendee.first_name
  if (attendee.career_title) return attendee.career_title
  if (attendee.company_name) return attendee.company_name
  return fallback
}

const formatRoleAndCompany = (attendee: AttendeeSnapshot) => {
  const title = attendee.career_title?.trim()
  const company = attendee.company_name?.trim()

  if (title && company) return `${title} at ${company}`
  if (title) return title
  if (company) return company
  return "their organization"
}

const clampWords = (text: string, maxWords: number) => {
  const tokens = text.trim().split(/\s+/)
  if (tokens.length <= maxWords) return text.trim()
  return `${tokens.slice(0, maxWords).join(" ")}`
}

export const shouldRewriteMatchExplanation = (
  existing: string | null | undefined,
  options?: MatchExplanationOptions
) => {
  if (!existing) return true
  const normalized = existing.trim()
  if (!normalized) return true

  const { maxWords } = mergeOptions(options)
  const wordCount = normalized.split(/\s+/).length
  if (wordCount > maxWords) return true

  const boilerplateHit = BOILERPLATE_SNIPPETS.some((snippet) =>
    normalized.toLowerCase().includes(snippet)
  )
  if (boilerplateHit) return true

  return false
}

export const parseMatchExplanationConfig = (input: unknown): MatchExplanationOptions => {
  if (!input || typeof input !== "object") return {}
  const config = input as Record<string, unknown>
  const explanationConfig = config.explanation
  if (!explanationConfig || typeof explanationConfig !== "object") return {}
  const details = explanationConfig as Record<string, unknown>

  const parsed: MatchExplanationOptions = {}
  if (typeof details.max_words === "number" && Number.isFinite(details.max_words)) {
    parsed.maxWords = Math.max(10, Math.floor(details.max_words))
  }
  if (typeof details.buyer_role_weight === "boolean") {
    parsed.buyerRoleWeight = details.buyer_role_weight
  }
  if (typeof details.allow_shared_hobby === "boolean") {
    parsed.allowSharedHobby = details.allow_shared_hobby
  }
  return parsed
}

export const buildMatchExplanation = (
  u: AttendeeSnapshot,
  v: AttendeeSnapshot,
  options?: MatchExplanationOptions
): string => {
  const opts = mergeOptions(options)
  const uWants = normStrings(u.event_want_tags)
  const vWants = normStrings(v.event_want_tags)
  const uOffers = normStrings(u.event_offer_tags)
  const vOffers = normStrings(v.event_offer_tags)

  const uNeedsClients =
    (u.business_need_text || "").toLowerCase().includes("client") || anyWantClients(uWants)
  const vNeedsClients =
    (v.business_need_text || "").toLowerCase().includes("client") || anyWantClients(vWants)

  const uBuyer = opts.buyerRoleWeight
    ? isBuyerRole(u.career_title) || isBuyerCompany(u.company_name)
    : false
  const vBuyer = opts.buyerRoleWeight
    ? isBuyerRole(v.career_title) || isBuyerCompany(v.company_name)
    : false

  const uConsulting = fromFollowupsBizLabel(u.connection_followups_json)
  const vConsulting = fromFollowupsBizLabel(v.connection_followups_json)
  const uHiring = recruitingRoles(u.connection_followups_json)
  const vHiring = recruitingRoles(v.connection_followups_json)

  const hobby = opts.allowSharedHobby ? sharedHobby(u.hobbies ?? [], v.hobbies ?? []) : null

  const uLabel = formatDisplayName(u, "One side")
  const vLabel = formatDisplayName(v, "the other side")
  const uRole = formatRoleAndCompany(u)
  const vRole = formatRoleAndCompany(v)

  let line: string

  if (uNeedsClients && vBuyer) {
    line = `${uLabel} is seeking clients; ${vRole} likely controls budgets or could benefit from the services.`
  } else if (vNeedsClients && uBuyer) {
    line = `${vLabel} is seeking clients; ${uRole} likely collaborates with or hires providers like them.`
  } else if (uNeedsClients && vConsulting) {
    line = `${vLabel} focuses on ${vConsulting}; ${uLabel} is looking for clients—promising collaboration.`
  } else if (vNeedsClients && uConsulting) {
    line = `${uLabel} focuses on ${uConsulting}; ${vLabel} is looking for clients—promising collaboration.`
  } else if (vHiring && (uOffers.includes("product") || uOffers.includes("design"))) {
    line = `${vLabel} is hiring; ${uLabel}'s product/design network could unlock referrals.`
  } else if (uHiring && (vOffers.includes("product") || vOffers.includes("design"))) {
    line = `${uLabel} is hiring; ${vLabel}'s product/design network could unlock referrals.`
  } else if (uOffers.some((t) => vWants.includes(t)) || vOffers.some((t) => uWants.includes(t))) {
    line = `${uLabel} offers what ${vLabel} is seeking—strong potential for intros.`
  } else if (anyWantJobs(uWants) && vOffers.includes("mentorship")) {
    line = `${uLabel} is exploring roles; ${vLabel} mentors in that space—ideal conversation starter.`
  } else if (anyWantJobs(vWants) && uOffers.includes("mentorship")) {
    line = `${vLabel} is exploring roles; ${uLabel} mentors in that space—ideal conversation starter.`
  } else {
    line = `High overlap between ${uLabel} and ${vLabel}—worth a quick introduction.`
  }

  if (hobby) {
    line += ` Shared interest: ${hobby}.`
  }

  return clampWords(line.trim(), opts.maxWords)
}


