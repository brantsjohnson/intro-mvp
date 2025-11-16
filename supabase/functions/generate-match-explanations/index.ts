// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

interface AttendeeSnapshot {
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

interface MatchExplanationOptions {
  maxWords?: number
  buyerRoleWeight?: boolean
  allowSharedHobby?: boolean
}

// -----------------------------------------------------------------------------
// Environment & Client
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
}

function getClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        "x-client-info": "intro-generate-explanations-v1"
      }
    }
  })
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

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

const ALLOWED_CONNECTION_KINDS = new Set([
  "system_match",
  "user_added",
  "user_request_pending",
  "manual_add",
  "manual_directory",
  "qr",
])

// -----------------------------------------------------------------------------
// HTTP Handler
// -----------------------------------------------------------------------------

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
}

serve(async (req) => {
  console.log("generate_explanations_invoked", {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  })

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    })
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      {
        status: 405,
        headers: CORS_HEADERS
      }
    )
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      {
        status: 400,
        headers: CORS_HEADERS
      }
    )
  }

  const eventId = payload?.event_id
  const userIds = payload?.user_ids // Optional: filter to specific users
  const connectionIds = payload?.connection_ids // Optional: filter to specific connections
  const force = payload?.force === true // Force regeneration even if explanation exists
  const options: MatchExplanationOptions = payload?.options || {}

  if (!eventId) {
    return new Response(
      JSON.stringify({ ok: false, error: "event_id is required" }),
      {
        status: 400,
        headers: CORS_HEADERS
      }
    )
  }

  const started = Date.now()
  try {
    const result = await generateExplanations(eventId, { userIds, connectionIds, force, options })
    const runtime = Date.now() - started

    return new Response(
      JSON.stringify({
        ok: true,
        ...result,
        runtime_ms: runtime
      }),
      {
        status: 200,
        headers: CORS_HEADERS
      }
    )
  } catch (error: any) {
    console.error("generate_explanations_error", {
      eventId,
      error: error?.message ?? String(error),
      stack: error?.stack
    })
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? String(error) }),
      {
        status: 500,
        headers: CORS_HEADERS
      }
    )
  }
})

// -----------------------------------------------------------------------------
// Main Processing Function
// -----------------------------------------------------------------------------

async function generateExplanations(
  eventId: string,
  opts: {
    userIds?: string[]
    connectionIds?: string[]
    force?: boolean
    options?: MatchExplanationOptions
  }
) {
  const supabase = getClient()

  // Load event config
  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("matching_config")
    .eq("event_id", eventId)
    .maybeSingle()

  if (eventError) {
    throw new Error(`Failed to load event ${eventId}: ${eventError.message}`)
  }

  // Parse options from event config and merge with provided options
  const configOptions = parseMatchExplanationConfig(eventRow?.matching_config ?? null)
  const mergedOptions: Required<MatchExplanationOptions> = {
    ...DEFAULT_OPTIONS,
    ...configOptions,
    ...opts.options,
  }

  // Build query for connections
  let query = supabase
    .from("connections")
    .select("event_id, a_id, b_id, connection_kind, match_explanation_text")
    .eq("event_id", eventId)

  // Filter by connection kinds
  query = query.in("connection_kind", Array.from(ALLOWED_CONNECTION_KINDS))

  // Filter by user IDs if provided
  if (opts.userIds && opts.userIds.length > 0) {
    const userIdSet = new Set(opts.userIds)
    query = query.or(
      opts.userIds.map(id => `a_id.eq.${id},b_id.eq.${id}`).join(",")
    )
  }

  // Filter by connection IDs if provided
  if (opts.connectionIds && opts.connectionIds.length > 0) {
    // Note: connection_id might not be in the select, so we'd need to add it
    // For now, we'll filter after fetching if needed
  }

  const { data: connections, error: connectionError } = await query

  if (connectionError) {
    throw new Error(`Failed to load connections for event ${eventId}: ${connectionError.message}`)
  }

  if (!connections || connections.length === 0) {
    return { updated: 0, skipped: 0, total: 0 }
  }

  // Filter by connection IDs if provided (post-query)
  let relevantConnections = connections
  if (opts.connectionIds && opts.connectionIds.length > 0) {
    // We'd need connection_id in the select for this to work properly
    // For now, skip this filter
  }

  console.log(`Processing ${relevantConnections.length} connections for event ${eventId}`)

  // Cache for attendee data
  const attendeeCache = new Map<string, AttendeeSnapshot | null>()

  const getAttendee = async (userId: string): Promise<AttendeeSnapshot | null> => {
    if (attendeeCache.has(userId)) {
      return attendeeCache.get(userId) ?? null
    }

    const [{ data: attendance }, { data: user }] = await Promise.all([
      supabase
        .from("attendance")
        .select(
          "business_need_text,event_offer_tags,event_want_tags,event_industry_tags,connection_followups_json,attendee_first_name,attendee_last_name"
        )
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("users")
        .select("first_name,last_name,hobbies,career_title,company_name,company_summary,offer_tags,want_tags,industry_tags")
        .eq("user_id", userId)
        .maybeSingle(),
    ])

    if (!attendance && !user) {
      attendeeCache.set(userId, null)
      return null
    }

    // Merge industry tags from user and event
    const userIndustryTags = user?.industry_tags && Array.isArray(user.industry_tags) ? user.industry_tags : []
    const eventIndustryTags = attendance?.event_industry_tags && Array.isArray(attendance.event_industry_tags) ? attendance.event_industry_tags : []
    const mergedIndustryTags = Array.from(new Set([...userIndustryTags, ...eventIndustryTags].map(t => t.toLowerCase())))

    const snapshot: AttendeeSnapshot = {
      user_id: userId,
      first_name: attendance?.attendee_first_name ?? user?.first_name ?? undefined,
      last_name: attendance?.attendee_last_name ?? user?.last_name ?? undefined,
      business_need_text: attendance?.business_need_text ?? undefined,
      event_offer_tags:
        attendance?.event_offer_tags ??
        (user?.offer_tags && Array.isArray(user.offer_tags) ? user.offer_tags : null),
      event_want_tags:
        attendance?.event_want_tags ??
        (user?.want_tags && Array.isArray(user.want_tags) ? user.want_tags : null),
      connection_followups_json: attendance?.connection_followups_json ?? null,
      hobbies:
        (user?.hobbies && Array.isArray(user.hobbies) ? user.hobbies : null) ??
        undefined,
      career_title: user?.career_title ?? undefined,
      company_name: user?.company_name ?? undefined,
      company_summary: user?.company_summary ?? undefined,
      industry_tags: userIndustryTags.length > 0 ? userIndustryTags : undefined,
      event_industry_tags: mergedIndustryTags.length > 0 ? mergedIndustryTags : undefined,
    }

    attendeeCache.set(userId, snapshot)
    return snapshot
  }

  // Generate explanations for each connection
  const updates: Array<{
    event_id: string
    a_id: string
    b_id: string
    connection_kind: string
    match_explanation_text: string
  }> = []

  let skipped = 0

  for (const connection of relevantConnections) {
    const left = await getAttendee(connection.a_id)
    const right = await getAttendee(connection.b_id)
    
    if (!left || !right) {
      skipped++
      continue
    }

    const generated = buildMatchExplanation(left, right, mergedOptions).trim()
    if (!generated) {
      skipped++
      continue
    }

    // Skip if explanation already exists and force is false
    if (
      !opts.force &&
      !shouldRewriteMatchExplanation(connection.match_explanation_text, mergedOptions) &&
      connection.match_explanation_text === generated
    ) {
      skipped++
      continue
    }

    updates.push({
      event_id: eventId,
      a_id: connection.a_id,
      b_id: connection.b_id,
      connection_kind: connection.connection_kind ?? "system_match",
      match_explanation_text: generated,
    })
  }

  // Update connections in batches
  let updatedCount = 0
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("connections")
      .update({ match_explanation_text: update.match_explanation_text })
      .eq("event_id", update.event_id)
      .eq("a_id", update.a_id)
      .eq("b_id", update.b_id)
      .eq("connection_kind", update.connection_kind)

    if (updateError) {
      console.error(`Failed to update explanation for ${update.a_id}/${update.b_id}:`, updateError)
      skipped++
    } else {
      updatedCount++
    }
  }

  return {
    updated: updatedCount,
    skipped: skipped + (updates.length - updatedCount),
    total: relevantConnections.length
  }
}

// -----------------------------------------------------------------------------
// Explanation Generation Logic (ported from explain.ts)
// -----------------------------------------------------------------------------

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

  const maxWords = options?.maxWords ?? DEFAULT_OPTIONS.maxWords
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
  options: Required<MatchExplanationOptions>
): string => {
  const uWants = normStrings(u.event_want_tags)
  const vWants = normStrings(v.event_want_tags)
  const uOffers = normStrings(u.event_offer_tags)
  const vOffers = normStrings(v.event_offer_tags)

  const uNeedsClients =
    (u.business_need_text || "").toLowerCase().includes("client") || anyWantClients(uWants)
  const vNeedsClients =
    (v.business_need_text || "").toLowerCase().includes("client") || anyWantClients(vWants)

  const uBuyer = options.buyerRoleWeight
    ? isBuyerRole(u.career_title) || isBuyerCompany(u.company_name)
    : false
  const vBuyer = options.buyerRoleWeight
    ? isBuyerRole(v.career_title) || isBuyerCompany(v.company_name)
    : false

  const uConsulting = fromFollowupsBizLabel(u.connection_followups_json)
  const vConsulting = fromFollowupsBizLabel(v.connection_followups_json)
  const uHiring = recruitingRoles(u.connection_followups_json)
  const vHiring = recruitingRoles(v.connection_followups_json)

  const hobby = options.allowSharedHobby ? sharedHobby(u.hobbies ?? [], v.hobbies ?? []) : null

  const uLabel = formatDisplayName(u, "One attendee")
  const vLabel = formatDisplayName(v, "the other attendee")

  // Industry / tag context
  const uIndustryTags = u.event_industry_tags ?? u.industry_tags ?? []
  const vIndustryTags = v.event_industry_tags ?? v.industry_tags ?? []
  const industryOverlap = jaccardIndustryOverlap(uIndustryTags, vIndustryTags)
  const matchedIndustries = uIndustryTags.filter((tag) =>
    vIndustryTags.some((vTag) => vTag.toLowerCase() === tag.toLowerCase())
  )

  const getIndustryContext = (summary: string | null | undefined, tags: string[], companyName?: string | null): string => {
    if (!summary && (!tags || tags.length === 0)) return ""
    const tagPhrase =
      tags && tags.length > 0
        ? tags
            .slice(0, 2)
            .map((t) => t.replace(/_/g, " "))
            .join(" and ")
        : ""
    if (summary && summary.length > 0) {
      let cleanSummary = summary.trim()
      if (companyName) {
        const companyLower = companyName.toLowerCase().trim()
        const summaryLower = cleanSummary.toLowerCase()
        if (summaryLower.startsWith(companyLower)) {
          cleanSummary = cleanSummary.substring(companyName.length).trim()
          cleanSummary = cleanSummary
            .replace(
              /^[,\s\-–—]*(offers|provides|is|operates|builds|creates|develops|designs|delivers|enables|helps|powers|supports)\s+/i,
              ""
            )
            .trim()
          cleanSummary = cleanSummary.replace(/^[,\s\-–—:]+/, "").trim()
        }
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

  const uIndustryContext = getIndustryContext(
    u.company_summary,
    uIndustryTags,
    u.company_name
  )
  const vIndustryContext = getIndustryContext(
    v.company_summary,
    vIndustryTags,
    v.company_name
  )

  // Need/offer matching
  const uNeedsMatch = uOffers.some((t) => vWants.includes(t))
  const vNeedsMatch = vOffers.some((t) => uWants.includes(t))
  const needsMatch = uNeedsMatch || vNeedsMatch
  const matchedNeed = uNeedsMatch
    ? uOffers.find((t) => vWants.includes(t))
    : vOffers.find((t) => uWants.includes(t))

  // Helper: quick "any interesting keyword" for fallback
  const pickAnyTag = (): string | null => {
    const pool = [
      ...(matchedIndustries ?? []),
      ...(uIndustryTags ?? []),
      ...(vIndustryTags ?? []),
      ...(uWants ?? []),
      ...(vWants ?? []),
      ...(uOffers ?? []),
      ...(vOffers ?? []),
    ].filter(Boolean)
    if (!pool.length) return null
    return pool[0].replace(/_/g, " ")
  }

  let line: string

  // 1) Clear commercial / industry fit
  if ((uNeedsClients || vNeedsClients) && industryOverlap >= 0.3 && matchedIndustries.length > 0) {
    const industryName = matchedIndustries[0].replace(/_/g, " ")
    const seller = uNeedsClients ? u : v
    const buyer = uNeedsClients ? v : u
    const sellerLabel = formatDisplayName(seller)
    const buyerLabel = formatDisplayName(buyer)
    const productHint = seller.company_summary
      ? seller.company_summary.split(/[.;]/)[0].slice(0, 60).trim()
      : seller.event_offer_tags?.[0]?.replace(/_/g, " ") || "a solution"
    line = `${sellerLabel} is looking for new clients in ${industryName}, and ${buyerLabel} works in the same space—good chance their ${productHint} could help.`
  }
  // 2) Explicit "offer matches need"
  else if (needsMatch && matchedNeed && industryOverlap >= 0.2) {
    const needer = uNeedsMatch ? v : u
    const offerer = uNeedsMatch ? u : v
    const neederLabel = formatDisplayName(needer)
    const offererLabel = formatDisplayName(offerer)
    const industryPhrase =
      matchedIndustries.length > 0
        ? ` in ${matchedIndustries[0].replace(/_/g, " ")}`
        : ""
    const needSnippet = needer.business_need_text
      ? ` "${needer.business_need_text.substring(0, 60)}${
          needer.business_need_text.length > 60 ? "..." : ""
        }"`
      : ""
    line = `${offererLabel} offers ${matchedNeed.replace(
      /_/g,
      " "
    )}${industryPhrase}, which lines up with ${neederLabel}'s current focus${needSnippet}.`
  } else if (needsMatch && matchedNeed) {
    const needer = uNeedsMatch ? v : u
    const offerer = uNeedsMatch ? u : v
    const neederLabel = formatDisplayName(needer)
    const offererLabel = formatDisplayName(offerer)
    const needSnippet = needer.business_need_text
      ? ` "${needer.business_need_text.substring(0, 60)}${
          needer.business_need_text.length > 60 ? "..." : ""
        }"`
      : ""
    line = `${offererLabel} is strong on ${matchedNeed.replace(
      /_/g,
      " "
    )}, and ${neederLabel} is actively working on that area${needSnippet}.`
  }
  // 3) Shared industry / context
  else if (industryOverlap >= 0.2 && matchedIndustries.length > 0) {
    const industryName = matchedIndustries[0].replace(/_/g, " ")
    const uContext = uIndustryContext
    const vContext = vIndustryContext
    if (uContext && vContext) {
      line = `${uLabel} and ${vLabel} are both in ${industryName} but from different angles—great pair to compare what's working and trade intros.`
    } else if (uContext || vContext) {
      const context = uContext || vContext
      line = `Both touch ${industryName}; one side focuses on ${context.toLowerCase()}—solid combo for comparing playbooks.`
    } else {
      line = `They both operate in ${industryName}, so swapping tactics and connections should come naturally.`
    }
  }
  // 4) Buyer / seller style fits
  else if (uNeedsClients && vBuyer) {
    line = `${uLabel} is looking for new clients, and ${vLabel} likely evaluates vendors—easy place to see if there's a fit.`
  } else if (vNeedsClients && uBuyer) {
    line = `${vLabel} is looking for new clients, and ${uLabel} is the kind of person who brings in new partners—worth a quick chat.`
  } else if (uNeedsClients && vConsulting) {
    line = `${uLabel} wants more clients, and ${vLabel} runs ${vConsulting} work—good chance their networks overlap.`
  } else if (vNeedsClients && uConsulting) {
    line = `${vLabel} wants more clients, and ${uLabel} runs ${uConsulting} work—connecting could unlock warm intros.`
  }
  // 5) Hiring + referral fits
  else if (vHiring && (uOffers.includes("product") || uOffers.includes("design"))) {
    line = `${vLabel} is hiring, and ${uLabel} has product/design experience—nice combo for referrals and interview prep.`
  } else if (uHiring && (vOffers.includes("product") || vOffers.includes("design"))) {
    line = `${uLabel} is hiring, and ${vLabel} has product/design experience—good person to compare candidates and pipelines with.`
  }
  // 6) Simple offer/need alignment
  else if (uOffers.some((t) => vWants.includes(t)) || vOffers.some((t) => uWants.includes(t))) {
    line = `${uLabel} covers something ${vLabel} is actively looking for—clear room for intros or collaboration.`
  }
  // 7) Jobs + mentorship
  else if (anyWantJobs(uWants) && vOffers.includes("mentorship")) {
    line = `${uLabel} is exploring new roles, and ${vLabel} offers mentorship—great mix for career direction and warm intros.`
  } else if (anyWantJobs(vWants) && uOffers.includes("mentorship")) {
    line = `${vLabel} is exploring new roles, and ${uLabel} offers mentorship—easy place to talk through next steps.`
  }
  // 8) Personal glue: shared hobby
  else if (hobby) {
    line = `${uLabel} and ${vLabel} both mentioned ${hobby}, so they'll have an easy icebreaker while they compare work.`
  }
  // 9) General but still specific fallback
  else {
    const keyword = pickAnyTag()
    if (keyword) {
      line = `${uLabel} and ${vLabel} both flagged ${keyword} in their profiles—worth comparing what they're building and who they know.`
    } else {
      line = `${uLabel} and ${vLabel} bring different perspectives, and there's a decent chance they can trade intros or ideas.`
    }
  }

  // If we *also* have a hobby, lightly tack it on (once).
  if (hobby && !line.toLowerCase().includes(hobby.toLowerCase())) {
    line += ` Shared non-work interest: ${hobby}.`
  }

  return clampWords(line.trim(), options.maxWords)
}

