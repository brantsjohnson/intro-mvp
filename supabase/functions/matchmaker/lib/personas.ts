// Canonical role and buyer persona utilities
// Lightweight, regex/keyword based - fast and deterministic

export type RoleCanonical = {
  role_function: string
  role_seniority: string
  confidence: number
}

export type BuyerPersona = {
  sector: string
  buyer_functions: string[]
  leader_required: boolean
  target_companies?: string[] | null
  target_functions?: string[] | null
}

// Seniority detection (ordered)
const SENIORITY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(intern|internship|student)\b/i, label: "intern" },
  { re: /\b(junior|jr\.?)\b/i, label: "junior" },
  { re: /\b(lead|staff|principal)\b/i, label: "lead" },
  { re: /\b(manager|mgr|mgr\.)\b/i, label: "manager" },
  { re: /\b(head|owner)\b/i, label: "director" },
  { re: /\b(director|dir\.?)\b/i, label: "director" },
  { re: /\b(vp|svp|evp|vice\s+president)\b/i, label: "vp" },
  { re: /\b(chief|cxo|cso|cto|cpo|cmo|cio|ceo|coo|cfo)\b/i, label: "cxo" },
  { re: /\b(founder|co[-\s]?founder|president|chair|board|partner|principal|managing\s+director|general\s+partner)\b/i, label: "founder" }
]

// Function keyword sets
const FUNCTION_MAP: Array<{ label: string; keywords: RegExp[] }> = [
  { label: "sales", keywords: [/\baccount\s+executive\b/i, /\bae\b/i, /\bsdr\b/i, /\bbdr\b/i, /\bsales\b/i, /\bnew\s+business\b/i, /\baccount\s+manager\b/i] },
  { label: "cs", keywords: [/\bcustomer\s+success\b/i, /\bcsm\b/i, /\brenewals?\b/i, /\badoption\b/i] },
  { label: "marketing", keywords: [/\bmarketing\b/i, /\bgrowth\b/i, /\bdemand\s+gen/i, /\bbrand\b/i, /\bcontent\b/i, /\bsocial\b/i, /\bseo\b/i, /\bsem\b/i, /\bpr\b/i] },
  { label: "partnerships", keywords: [/\bpartnership/i, /\balliances?/i, /\bchannel/i, /\becosystem/i, /\bbd\b/i, /\bbusiness\s+development/i] },
  { label: "product", keywords: [/\bproduct\s+manager\b/i, /\bpm\b/i, /\bproduct\s+owner\b/i, /\bproduct\s+lead\b/i] },
  { label: "design", keywords: [/\bux\b/i, /\bui\b/i, /\bdesigner\b/i] },
  { label: "engineering", keywords: [/\bengineer/i, /\bdeveloper/i, /\bdevops\b/i, /\bsre\b/i, /\barchitect\b/i, /\bfull\s*stack\b/i, /\bbackend\b/i, /\bfrontend\b/i] },
  { label: "data", keywords: [/\banalyst\b/i, /\banalytics\b/i, /\bbusiness\s+analyst\b/i, /\bdata\b/i, /\bbi\b/i, /\binsights\b/i] },
  { label: "ai_ml", keywords: [/\bml\b/i, /\bmachine\s+learning/i, /\bllm\b/i, /\b(applied|research)\s+scientist\b/i] },
  { label: "ops", keywords: [/\boperations\b/i, /\bprogram\s+manager\b/i, /\bproject\s+manager\b/i, /\brevops\b/i, /\bbizops\b/i] },
  { label: "finance", keywords: [/\bfinance\b/i, /\bfp&a\b/i, /\baccounting\b/i, /\bcontroller\b/i, /\bbookkeeper\b/i] },
  { label: "it_sec", keywords: [/\bit\b/i, /\bsysadmin\b/i, /\bsecurity\b/i, /\bgrc\b/i, /\bciso\b/i] },
  { label: "hr_talent", keywords: [/\brecruiter\b/i, /\btalent\s+acquisition\b/i, /\bpeople\s+ops\b/i, /\bhrbp\b/i, /\bhr\b/i] },
  { label: "media_pr", keywords: [/\bjournalist\b/i, /\breporter\b/i, /\bproducer\b/i, /\bhost\b/i, /\bcomms\b/i, /\bpr\b/i] },
  { label: "legal", keywords: [/\bcounsel\b/i, /\bgeneral\s+counsel\b/i, /\blawyer\b/i, /\bcompliance\b/i] },
  { label: "exec", keywords: [/\bfounder\b/i, /\bco[-\s]?founder\b/i, /\bceo\b/i, /\bcoo\b/i, /\bcto\b/i, /\bcpo\b/i, /\bcmo\b/i, /\bcio\b/i, /\bpresident\b/i, /\bchair\b/i, /\bboard\b/i, /\bowner\b/i, /\bpartner\b/i, /\bprincipal\b/i, /\bmanaging\s+director\b/i, /\bgeneral\s+partner\b/i] },
  { label: "education", keywords: [/\bteacher\b/i, /\bprofessor\b/i, /\blecturer\b/i, /\bdean\b/i] },
  { label: "healthcare", keywords: [/\bphysician\b/i, /\bnurse\b/i, /\bclinician\b/i, /\bprovider\b/i] }
]

export function canonicalizeRole(title?: string | null): RoleCanonical {
  const text = (title ?? "").trim()
  if (!text) return { role_function: "unknown", role_seniority: "IC", confidence: 0 }

  let role_seniority = "IC"
  for (const { re, label } of SENIORITY_PATTERNS) {
    if (re.test(text)) {
      role_seniority = label
      break
    }
  }

  let bestFunction = "unknown"
  let bestConfidence = 0
  for (const entry of FUNCTION_MAP) {
    for (const re of entry.keywords) {
      if (re.test(text)) {
        bestFunction = entry.label
        bestConfidence = Math.max(bestConfidence, 0.8)
        break
      }
    }
  }

  // Exec titles default to exec even if other keywords appear
  if (/\b(ceo|cxo|chief|founder|co[-\s]?founder|president|chair|board|partner|principal|managing\s+director|general\s+partner)\b/i.test(text)) {
    bestFunction = "exec"
    bestConfidence = Math.max(bestConfidence, 0.9)
  }

  return { role_function: bestFunction, role_seniority, confidence: Math.min(1, Math.max(0.5, bestConfidence)) }
}

// Sector → buyer functions mapping
const SECTOR_TO_BUYERS: Record<string, string[]> = {
  devsec: ["engineering", "it_sec", "data", "exec"],
  martech: ["marketing", "partnerships", "exec", "data"],
  fintech_erp: ["finance", "ops", "it_sec", "exec"],
  hr_talent: ["hr_talent", "ops", "finance", "exec"],
  support_cs: ["cs", "ops", "exec"],
  analytics_ai: ["data", "engineering", "exec"],
  design_creative: ["design", "marketing", "exec"],
  education: ["education", "hr_talent", "exec"],
  healthcare: ["healthcare", "ops", "exec"],
  public_nonprofit: ["exec", "partnerships", "ops"],
  unknown: ["marketing", "product", "engineering", "ops", "finance", "it_sec", "exec"]
}

// Sector heuristics
const SECTOR_HINTS: Array<{ sector: string; re: RegExp }> = [
  { sector: "devsec", re: /\b(dev|developer|infra|platform|security|devops|sre|cloud|kubernetes|k8s|cicd)\b/i },
  { sector: "martech", re: /\b(marketing|martech|demand|brand|content|seo|sem|crm|campaign)\b/i },
  { sector: "fintech_erp", re: /\b(finance|fintech|billing|payments|erp|accounting|controller|fp&a)\b/i },
  { sector: "hr_talent", re: /\b(hr|talent|recruit|people\s+ops|onboarding|payroll)\b/i },
  { sector: "support_cs", re: /\b(support|ticketing|helpdesk|customer\s+success|csm|renewals)\b/i },
  { sector: "analytics_ai", re: /\b(analytics|bi|data|ml|ai|insights|llm)\b/i },
  { sector: "design_creative", re: /\b(design|creative|brand|ux|ui)\b/i },
  { sector: "education", re: /\b(education|edtech|student|school|teacher|professor|campus)\b/i },
  { sector: "healthcare", re: /\b(healthcare|health|clinical|patient|provider|physician|nurse|hipaa)\b/i },
  { sector: "public_nonprofit", re: /\b(public|government|nonprofit|ngo|civic)\b/i }
]

export function deriveBuyerPersona(
  viewerText: string,
  viewerRole: RoleCanonical,
  intent: string,
  sectorGuess?: string | null
): BuyerPersona {
  // Determine sector
  let sector = "unknown"
  if (sectorGuess && SECTOR_TO_BUYERS[sectorGuess]) sector = sectorGuess
  else {
    // Sponsorship/sales synonyms → martech/partnerships bias
    if (/\b(sponsor|sponsorship|advertiser|ad\s?sales|placement|brand\s?deal|brand\s?partner)\b/i.test(viewerText)) {
      sector = "martech"
    }
    for (const hint of SECTOR_HINTS) {
      if (hint.re.test(viewerText)) {
        sector = hint.sector
        break
      }
    }
  }

  let buyer_functions = SECTOR_TO_BUYERS[sector] ?? SECTOR_TO_BUYERS["unknown"]
  let leader_required = false

  if (intent === "commercial") {
    leader_required = true
    // If sponsorship implies marketing/partnerships as core buyers
    if (sector === "martech") {
      buyer_functions = ["marketing", "partnerships", "exec", "data"]
    }
  } else if (intent === "job_seeking") {
    buyer_functions = ["hr_talent", viewerRole.role_function]
  } else if (intent === "recruiting") {
    buyer_functions = [viewerRole.role_function]
  } else if (intent === "mentorship") {
    buyer_functions = [viewerRole.role_function]
  }

  const target_companies = parseTargetCompanies(viewerText)
  const target_functions = parseTargetFunctions(viewerText)

  return { sector, buyer_functions, leader_required, target_companies, target_functions }
}

export function isLeadershipTitle(seniority: string): boolean {
  return ["director", "vp", "cxo", "founder"].includes(seniority)
}

// --- Helpers to parse loosely stated targets from free text ---
export function parseTargetCompanies(text?: string | null): string[] | null {
  if (!text) return null
  const lower = text.toLowerCase()
  const companies: string[] = []
  // Patterns: "people at <Company>", "folks at <Company>", "work with <Company>"
  const re = /\b(?:people|folks|teams|leaders|buyers)\s+(?:at|from)\s+([a-z0-9&\.\- ]{2,})\b/gi
  const re2 = /\bwork\s+with\s+([a-z0-9&\.\- ]{2,})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(lower))) {
    const name = sanitizeCompanyName(m[1])
    if (name) companies.push(name)
  }
  while ((m = re2.exec(lower))) {
    const name = sanitizeCompanyName(m[1])
    if (name) companies.push(name)
  }
  const uniq = Array.from(new Set(companies)).slice(0, 8)
  return uniq.length ? uniq : null
}

function sanitizeCompanyName(s: string): string {
  const cleaned = s.replace(/[^a-z0-9&\.\- ]+/gi, " ").replace(/\s+/g, " ").trim()
  if (!cleaned || cleaned.length < 2) return ""
  // Stop-words to prevent capturing generic words
  if (/\b(company|inc|llc|ltd|corp|corporation|co)\b/i.test(cleaned)) return cleaned
  return cleaned
}

export function parseTargetFunctions(text?: string | null): string[] | null {
  if (!text) return null
  const lower = text.toLowerCase()
  const keys: string[] = []
  const mapping: Record<string, string> = {
    marketing: "marketing",
    partnerships: "partnerships",
    partner: "partnerships",
    product: "product",
    engineering: "engineering",
    developer: "engineering",
    design: "design",
    finance: "finance",
    hr: "hr_talent",
    recruit: "hr_talent",
    security: "it_sec",
    it: "it_sec",
    data: "data",
    sales: "sales",
    "customer success": "cs",
    cs: "cs",
  }
  for (const w in mapping) {
    const re = new RegExp(`\\b${w}\\b`, "i")
    if (re.test(lower)) keys.push(mapping[w])
  }
  const uniq = Array.from(new Set(keys)).slice(0, 8)
  return uniq.length ? uniq : null
}

// Normalize a company input that may be a URL into a readable company stem
export function normalizeCompanyInput(s?: string | null): string {
  if (!s) return ""
  let t = s.trim()
  // Strip protocol
  t = t.replace(/^https?:\/\//i, "")
  // Strip www.
  t = t.replace(/^www\./i, "")
  // Take first path segment
  t = t.split(/[\/?#]/)[0] || t
  // If looks like domain, take second-level domain
  const parts = t.split(".")
  if (parts.length >= 2) {
    const sld = parts[parts.length - 2]
    const label = sld.replace(/[^a-z0-9\- ]/gi, " ").replace(/\s+/g, " ").trim()
    return label || t
  }
  return t
}


