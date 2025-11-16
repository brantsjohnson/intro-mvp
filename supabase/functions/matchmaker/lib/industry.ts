/**
 * Industry taxonomy and signal derivation from company_summary.
 * Detects target industries and computes specificity (how niche vs broad).
 */

// Canonical industry tags (must match the taxonomy in update-industry-tags and fetch-company-metadata)
export const INDUSTRY_TAGS = [
  "fintech",
  "banking",
  "payments",
  "insurance",
  "ecommerce",
  "retail",
  "enterprise_software",
  "saas",
  "cybersecurity",
  "marketing",
  "advertising",
  "media",
  "social_media",
  "real_estate",
  "recruiting",
  "hrtech",
  "travel",
  "hospitality",
  "transportation",
  "logistics",
  "healthtech",
  "biotech",
  "entertainment",
  "gaming",
  "edtech",
  "education",
  "higher_education",
  "research",
  "academia",
  "ai",
  "infrastructure",
  "cloud",
  "developer_tools",
  "telecommunications",
  "productivity",
  "marketplaces",
  "consumer_goods",
  "food_delivery",
  "sports",
  "fitness",
  "hardware",
  "wearables",
  "government",
  "legaltech",
  "nonprofit",
  "consulting",
] as const

// Keyword groups that map to industry tags
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  legal: [
    "law",
    "legal",
    "attorney",
    "lawyer",
    "law firm",
    "litigation",
    "compliance",
    "regulatory",
    "legal tech",
    "legaltech",
  ],
  fintech: [
    "fintech",
    "financial technology",
    "banking",
    "payments",
    "lending",
    "investing",
    "wealth management",
    "crypto",
    "blockchain",
    "trading",
  ],
  ecommerce: [
    "ecommerce",
    "e-commerce",
    "online retail",
    "marketplace",
    "dropshipping",
    "online store",
  ],
  retail: ["retail", "store", "shopping", "merchandise", "brick and mortar"],
  sports: [
    "sports",
    "athletic",
    "athletes",
    "fitness",
    "performance",
    "training",
    "coaching",
  ],
  athletics: ["athletic", "athletes", "sports", "performance"],
  telecom: [
    "telecom",
    "telecommunications",
    "communications",
    "messaging",
    "sms",
    "voice",
    "whatsapp",
  ],
  cpaas: [
    "cpaas",
    "communications platform",
    "customer engagement",
    "sms",
    "whatsapp",
    "voice",
    "email communications",
  ],
  saas: ["saas", "software as a service", "cloud software", "platform"],
  marketing: [
    "marketing",
    "advertising",
    "promotion",
    "branding",
    "campaign",
    "digital marketing",
  ],
  healthcare: [
    "healthcare",
    "health",
    "medical",
    "hospital",
    "clinic",
    "patient",
    "pharmaceutical",
    "pharma",
  ],
  education: [
    "education",
    "school",
    "university",
    "college",
    "learning",
    "training",
    "edtech",
    "higher education",
    "higher_education",
  ],
  higher_education: [
    "university",
    "college",
    "higher education",
    "higher_education",
    "academic",
    "academia",
  ],
  research: [
    "research",
    "researcher",
    "laboratory",
    "lab",
    "scientific research",
    "academic research",
  ],
  academia: [
    "academia",
    "academic",
    "professor",
    "professorship",
    "university",
    "college",
    "scholar",
    "scholarship",
  ],
  government: [
    "government",
    "public sector",
    "municipal",
    "federal",
    "state",
    "civic",
  ],
  manufacturing: [
    "manufacturing",
    "production",
    "factory",
    "industrial",
    "supply chain",
  ],
  logistics: [
    "logistics",
    "shipping",
    "delivery",
    "warehouse",
    "fulfillment",
    "supply chain",
  ],
  real_estate: [
    "real estate",
    "realty",
    "property",
    "housing",
    "construction",
    "development",
  ],
  travel: ["travel", "tourism", "booking", "hotel", "accommodation"],
  hospitality: [
    "hospitality",
    "hotel",
    "restaurant",
    "service",
    "guest",
    "catering",
  ],
  food: ["food", "restaurant", "dining", "catering", "culinary"],
  restaurant: ["restaurant", "dining", "food service", "catering"],
  fitness: ["fitness", "gym", "workout", "exercise", "training"],
  wellness: ["wellness", "health", "self-care", "mindfulness"],
  media: ["media", "publishing", "content", "news", "journalism"],
  entertainment: [
    "entertainment",
    "music",
    "video",
    "streaming",
    "content",
    "production",
  ],
  gaming: ["gaming", "games", "video games", "esports", "gamer"],
  nonprofit: [
    "nonprofit",
    "non-profit",
    "charity",
    "foundation",
    "social impact",
  ],
  consulting: [
    "consulting",
    "consultant",
    "advisory",
    "strategy",
    "professional services",
  ],
  accounting: [
    "accounting",
    "accountant",
    "bookkeeping",
    "financial services",
    "cpa",
  ],
  insurance: ["insurance", "insurer", "coverage", "policy"],
  banking: ["bank", "banking", "financial institution", "credit union"],
  construction: [
    "construction",
    "contractor",
    "building",
    "infrastructure",
    "development",
  ],
  agriculture: [
    "agriculture",
    "farming",
    "agricultural",
    "crop",
    "livestock",
    "agtech",
  ],
  energy: ["energy", "power", "utilities", "renewable", "solar", "wind"],
  utilities: ["utilities", "power", "electric", "water", "gas"],
}

// Broad/generic terms that indicate low specificity
const BROAD_INDICATORS = [
  "all",
  "any",
  "every",
  "general",
  "universal",
  "wide range",
  "various",
  "multiple",
  "diverse",
  "broad",
  "horizontal",
  "cross-industry",
]

// Patterns that indicate niche targeting
const NICHE_PATTERNS = [
  /for\s+([a-z\s]+?)(?:\s+companies|\s+firms|\s+organizations|\s+businesses|$)/i,
  /targeting\s+([a-z\s]+?)(?:\s+companies|\s+firms|\s+organizations|\s+businesses|$)/i,
  /serving\s+([a-z\s]+?)(?:\s+companies|\s+firms|\s+organizations|\s+businesses|$)/i,
  /designed\s+for\s+([a-z\s]+?)(?:\s+companies|\s+firms|\s+organizations|\s+businesses|$)/i,
]

export interface IndustrySignals {
  tags: string[]
  specificity: number // 0..1, where 0.15-0.3 = broad, 0.6-0.9 = niche
  reason?: string // Optional explanation
}

/**
 * Derives industry tags and specificity from company_summary, company_name, and company_url.
 * Returns empty tags and low specificity if inputs are missing or too generic.
 */
export function deriveIndustrySignals(
  summary: string | null | undefined,
  companyName: string | null | undefined,
  companyUrl: string | null | undefined
): IndustrySignals {
  const text = [summary, companyName, companyUrl]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim()

  if (!text || text.length < 10) {
    return { tags: [], specificity: 0.2 }
  }

  const detectedTags = new Set<string>()
  let hasNichePattern = false
  let nicheTarget: string | null = null

  // Check for "for X" patterns first (strongest signal)
  for (const pattern of NICHE_PATTERNS) {
    const match = text.match(pattern)
    if (match && match[1]) {
      hasNichePattern = true
      const target = match[1].trim()
      nicheTarget = target
      // Try to map the target to an industry tag
      for (const [tag, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
        for (const kw of keywords) {
          if (target.includes(kw.toLowerCase()) || kw.toLowerCase().includes(target)) {
            detectedTags.add(tag)
            break
          }
        }
      }
      break
    }
  }

  // Scan for industry keywords
  for (const [tag, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      // Use word boundaries or phrase matching
      if (
        text.includes(kwLower) &&
        (kwLower.length > 4 || // Short keywords need exact match
          new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
      ) {
        detectedTags.add(tag)
        break
      }
    }
  }

  // Compute specificity
  let specificity = 0.2 // Default to broad

  if (hasNichePattern && detectedTags.size > 0) {
    // Strong niche signal: "for law firms", "targeting healthcare"
    specificity = 0.7 + Math.min(detectedTags.size * 0.1, 0.2)
  } else if (detectedTags.size === 1) {
    // Single industry tag suggests some focus
    specificity = 0.4
  } else if (detectedTags.size >= 2) {
    // Multiple industries = broader
    specificity = 0.25
  }

  // Check for broad indicators
  const hasBroadIndicator = BROAD_INDICATORS.some((indicator) =>
    text.includes(indicator)
  )
  if (hasBroadIndicator && !hasNichePattern) {
    specificity = Math.min(specificity, 0.25)
  }

  // If we found a niche target but couldn't map it, still boost specificity
  if (hasNichePattern && detectedTags.size === 0 && nicheTarget) {
    specificity = 0.6 // Niche but unknown industry
  }

  // Clamp to reasonable range
  specificity = Math.max(0.15, Math.min(0.9, specificity))

  const tags = Array.from(detectedTags)

  return {
    tags,
    specificity,
    reason:
      nicheTarget && detectedTags.size > 0
        ? `Targets ${nicheTarget} (${tags.join(", ")})`
        : detectedTags.size > 0
        ? `Industries: ${tags.join(", ")}`
        : undefined,
  }
}

/**
 * Merges derived industry tags with existing tags, deduplicating.
 */
export function mergeIndustryTags(
  existing: string[] | null | undefined,
  derived: string[]
): string[] | null {
  if (!derived.length) return existing ?? null
  if (!existing || !existing.length) return derived

  const merged = new Set<string>()
  for (const tag of existing) {
    merged.add(tag.toLowerCase())
  }
  for (const tag of derived) {
    merged.add(tag.toLowerCase())
  }
  return Array.from(merged)
}

