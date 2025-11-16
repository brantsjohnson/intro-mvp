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
  company_summary?: string | null
  industry_tags?: string[] | null
  event_industry_tags?: string[] | null
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
  "high overlap",
  "worth a quick introduction",
  "strong overlap",
  "worth a five-minute intro",
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

// Helper to compute Jaccard similarity for industry tags
const jaccardIndustryOverlap = (uTags: string[] | null | undefined, vTags: string[] | null | undefined): number => {
  if (!uTags || !vTags || uTags.length === 0 || vTags.length === 0) return 0
  const uSet = new Set(uTags.map(t => t.toLowerCase()))
  const vSet = new Set(vTags.map(t => t.toLowerCase()))
  const intersection = new Set([...uSet].filter(x => vSet.has(x)))
  const union = new Set([...uSet, ...vSet])
  return union.size > 0 ? intersection.size / union.size : 0
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

  // Check for industry overlap
  const uIndustryTags = u.event_industry_tags ?? u.industry_tags ?? []
  const vIndustryTags = v.event_industry_tags ?? v.industry_tags ?? []
  const industryOverlap = jaccardIndustryOverlap(uIndustryTags, vIndustryTags)
  const matchedIndustries = uIndustryTags.filter(tag => 
    vIndustryTags.some(vTag => vTag.toLowerCase() === tag.toLowerCase())
  )

  // Extract industry context from company summaries (without company name)
  const getIndustryContext = (summary: string | null | undefined, tags: string[], companyName?: string | null): string => {
    if (!summary && tags.length === 0) return ""
    const tagPhrase = tags.length > 0 ? tags.slice(0, 2).map(t => t.replace(/_/g, " ")).join(" and ") : ""
    if (summary && summary.length > 0) {
      let cleanSummary = summary.trim()
      // Remove company name from start of summary if present
      if (companyName) {
        const companyLower = companyName.toLowerCase().trim()
        const summaryLower = cleanSummary.toLowerCase()
        // Check if summary starts with company name (with optional punctuation/space)
        if (summaryLower.startsWith(companyLower)) {
          cleanSummary = cleanSummary.substring(companyName.length).trim()
          // Remove common prefixes like "offers", "provides", "is", "operates", etc.
          cleanSummary = cleanSummary.replace(/^[,\s\-–—]*(offers|provides|is|operates|builds|creates|develops|designs|delivers|enables|helps|powers|supports)\s+/i, "").trim()
          // Remove leading punctuation
          cleanSummary = cleanSummary.replace(/^[,\s\-–—:]+/, "").trim()
        }
      }
      // If still starts with company name (case-insensitive), try again
      if (companyName && cleanSummary.toLowerCase().startsWith(companyName.toLowerCase())) {
        cleanSummary = cleanSummary.substring(companyName.length).trim()
        cleanSummary = cleanSummary.replace(/^[,\s\-–—]*(offers|provides|is|operates|builds|creates|develops|designs|delivers|enables|helps|powers|supports)\s+/i, "").trim()
        cleanSummary = cleanSummary.replace(/^[,\s\-–—:]+/, "").trim()
      }
      const firstSentence = cleanSummary.split(/[.!?]/)[0]?.trim()
      if (firstSentence && firstSentence.length < 150 && firstSentence.length > 10) {
        return tagPhrase ? `${firstSentence} (${tagPhrase})` : firstSentence
      }
      const snippet = cleanSummary.substring(0, 100).trim()
      if (snippet.length > 10) {
        return tagPhrase ? `${snippet}... (${tagPhrase})` : `${snippet}...`
      }
    }
    return tagPhrase
  }

  const uIndustryContext = getIndustryContext(u.company_summary, uIndustryTags, u.company_name)
  const vIndustryContext = getIndustryContext(v.company_summary, vIndustryTags, v.company_name)

  // Check for needs matching (most important)
  const uNeedsMatch = uOffers.some((t) => vWants.includes(t))
  const vNeedsMatch = vOffers.some((t) => uWants.includes(t))
  const needsMatch = uNeedsMatch || vNeedsMatch
  const matchedNeed = uNeedsMatch 
    ? uOffers.find(t => vWants.includes(t))
    : vOffers.find(t => uWants.includes(t))

  let line: string

  // Industry fit takes precedence for commercial matches (when one needs clients)
  if ((uNeedsClients || vNeedsClients) && industryOverlap >= 0.3 && matchedIndustries.length > 0) {
    const industryName = matchedIndustries[0]
    const seller = uNeedsClients ? u : v
    const buyer = uNeedsClients ? v : u
    const sellerLabel = formatDisplayName(seller)
    const buyerCompany = buyer.company_name || formatDisplayName(buyer, "their organization")
    const productHint = seller.company_summary 
      ? seller.company_summary.split(/[.;]/)[0].slice(0, 60).trim()
      : seller.event_offer_tags?.[0] || "their product"
    
    line = `${sellerLabel} builds ${productHint} for ${industryName}; ${buyerCompany} is in ${industryName}—direct fit.`
  } else if (needsMatch && matchedNeed && industryOverlap >= 0.2) {
    // Both needs and industry match - explain both
    const needer = uNeedsMatch ? v : u
    const offerer = uNeedsMatch ? u : v
    const neederLabel = formatDisplayName(needer)
    const offererLabel = formatDisplayName(offerer)
    const offererCompany = offerer.company_name || "their company"
    const industryPhrase = matchedIndustries.length > 0 
      ? ` Both work in ${matchedIndustries[0]?.replace(/_/g, " ")}.`
      : (offerer.company_summary ? ` ${offererCompany} operates in ${offerer.company_summary.split(/[.;]/)[0].slice(0, 60).trim()}.` : "")
    line = `${offererLabel} offers ${matchedNeed.replace(/_/g, " ")}${industryPhrase} Specifically matches ${neederLabel}'s need${needer.business_need_text ? `: "${needer.business_need_text.substring(0, 60)}${needer.business_need_text.length > 60 ? "..." : ""}"` : ""}.`
  } else if (needsMatch && matchedNeed) {
    // Needs match but no strong industry match
    const needer = uNeedsMatch ? v : u
    const offerer = uNeedsMatch ? u : v
    const neederLabel = formatDisplayName(needer)
    const offererLabel = formatDisplayName(offerer)
    line = `${offererLabel} offers ${matchedNeed.replace(/_/g, " ")}${needer.business_need_text ? `, which matches ${neederLabel}'s need: "${needer.business_need_text.substring(0, 60)}${needer.business_need_text.length > 60 ? "..." : ""}"` : `, which ${neederLabel} is seeking`}.`
  } else if (industryOverlap >= 0.2 && matchedIndustries.length > 0) {
    // Industry match but no specific needs match
    const industryName = matchedIndustries[0]?.replace(/_/g, " ")
    const uCompany = u.company_name || "their company"
    const vCompany = v.company_name || "their company"
    const industryContext = uIndustryContext || vIndustryContext
    if (industryContext) {
      const companyWithContext = uIndustryContext ? uCompany : vCompany
      const contextText = industryContext.split("(")[0].trim()
      // Avoid duplicating company name if it's already in the context
      const companyLower = companyWithContext.toLowerCase()
      const contextLower = contextText.toLowerCase()
      if (contextLower.startsWith(companyLower) || contextLower.includes(` ${companyLower} `) || contextLower.includes(` ${companyLower}.`)) {
        // Company name already in context, just use the context
        line = `${contextText}; perfect to compare notes and explore opportunities.`
      } else {
        // Add company name prefix
        line = `${companyWithContext} ${contextText.toLowerCase().startsWith("operates") || contextText.toLowerCase().startsWith("is") ? contextText : `operates in ${contextText}`}; perfect to compare notes and explore opportunities.`
      }
    } else {
      line = `Both work in ${industryName}; perfect to compare notes and explore opportunities.`
    }
  } else if (uNeedsClients && vBuyer) {
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
    // Fallback: explain shared interests or role similarity instead of generic "high overlap"
    if (hobby) {
      line = `Shared interest in ${hobby}—worth connecting to explore common ground.`
    } else if (uRole && vRole && uRole !== "their organization" && vRole !== "their organization") {
      line = `${uLabel} has a similar role${u.company_name ? ` at ${u.company_name}` : ""}—worth a five-minute intro to exchange insights.`
    } else {
      line = `${uLabel} and ${vLabel} have complementary backgrounds—worth exploring potential collaboration.`
    }
  }

  if (hobby) {
    line += ` Shared interest: ${hobby}.`
  }

  return clampWords(line.trim(), opts.maxWords)
}


