
import { config } from "dotenv"
import { resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"

type CandidateFixture = {
  key: string
  firstName: string
  lastName: string
  jobTitle: string
  company: string
  yearsExperience: number
  companySummary: string
  expertiseSummary: string
  needSummary: string
  offerSummary: string
  whyAttending: string
  businessNeed: string
  connectionTypes: string[]
  needTags: string[]
  offerTags: string[]
  wantTags: string[]
  industryTags: string[]
}

type MatchView = {
  candidateKey: string
  candidateName: string
  rawScore: number
  normalizedScore: number
  summary: string
  reasons: string[]
  fallbackUsed: boolean
}

type PerSourceResult = {
  sourceKey: string
  sourceName: string
  matches: MatchView[]
}

type AssertionResult = {
  name: string
  passed: boolean
  details: string
}

const envFiles = [".env.deploy", ".env.local"]
for (const file of envFiles) {
  try {
    config({ path: resolve(file) })
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_EVENT_CODE = (process.argv[2] || "E2EMCH").toUpperCase()
const TEST_EMAIL_DOMAIN = "e2e-match.test"
const OUTPUT_DIR = resolve("outputs")
const REPORT_JSON_PATH = resolve(OUTPUT_DIR, "matcher_e2e_report.json")
const REPORT_MD_PATH = resolve(OUTPUT_DIR, "matcher_e2e_report.md")

const FIXTURES: CandidateFixture[] = [
  {
    key: "brant_johnson",
    firstName: "Brant",
    lastName: "Johnson",
    jobTitle: "Account Executive",
    company: "Utah Business Magazine",
    yearsExperience: 8,
    companySummary: "B2B media platform that connects startup and enterprise decision-makers.",
    expertiseSummary: "Sales partnerships, account growth, regional business network",
    needSummary: "Hiring for growth roles and seeking partnership opportunities with sales organizations and GTM operators.",
    offerSummary: "Can introduce founders to business leaders and co-market with relevant partners.",
    whyAttending: "Meet commercial operators for hiring and partnership growth.",
    businessNeed: "Need candidate referrals for sales hiring and partner leads.",
    connectionTypes: ["recruit", "partnerships"],
    needTags: ["hiring", "partnerships", "sales"],
    offerTags: ["sales", "media", "partnerships"],
    wantTags: ["hiring", "partners"],
    industryTags: ["media", "startup"],
  },
  {
    key: "kelton_davis",
    firstName: "Kelton",
    lastName: "Davis",
    jobTitle: "Senior Account Executive",
    company: "Panther Sales Labs",
    yearsExperience: 9,
    companySummary: "Revenue acceleration consultancy for B2B startups.",
    expertiseSummary: "Enterprise sales pipeline, outbound strategy, account expansion",
    needSummary: "Looking for partnership channels with founders and sales leaders.",
    offerSummary: "Can help teams build outbound motion and close enterprise pilots.",
    whyAttending: "Find partnerships with founders and CROs.",
    businessNeed: "Need co-sell partners and customer pipeline collaboration.",
    connectionTypes: ["partnerships"],
    needTags: ["partnerships", "customers"],
    offerTags: ["sales", "pipeline", "gtm"],
    wantTags: ["partners", "buyers"],
    industryTags: ["saas", "startup"],
  },
  {
    key: "taylor_allen",
    firstName: "Taylor",
    lastName: "Allen",
    jobTitle: "Chief Revenue Officer",
    company: "Apple",
    yearsExperience: 15,
    companySummary: "Large technology platform with global B2B and B2C channels.",
    expertiseSummary: "Revenue operations, strategic partnerships, enterprise growth",
    needSummary: "Seeking strategic partnerships with sales organizations and integration partners.",
    offerSummary: "Can advise on revenue architecture and enterprise go-to-market planning.",
    whyAttending: "Identify strong partnership opportunities.",
    businessNeed: "Need partnership opportunities with strong sales execution teams.",
    connectionTypes: ["partnerships"],
    needTags: ["partnerships", "gtm"],
    offerTags: ["revenue", "sales", "operator"],
    wantTags: ["partners"],
    industryTags: ["enterprise", "technology"],
  },
  {
    key: "panther_rice",
    firstName: "Panther",
    lastName: "Rice",
    jobTitle: "VP Sales Partnerships",
    company: "GrowthWorks",
    yearsExperience: 12,
    companySummary: "Commercial advisory group for SaaS scale-ups.",
    expertiseSummary: "Partner ecosystem design, co-sell motions, channel growth",
    needSummary: "Looking to build channel partnerships and integration alliances.",
    offerSummary: "Can support co-sell strategy and partner enablement for B2B teams.",
    whyAttending: "Meet teams serious about commercial partnerships.",
    businessNeed: "Need collaboration with founders and CRO teams on partnerships.",
    connectionTypes: ["partnerships", "biz_opps"],
    needTags: ["partnerships", "alliances"],
    offerTags: ["partnerships", "channel", "sales"],
    wantTags: ["partners", "buyers"],
    industryTags: ["saas", "enterprise"],
  },
  {
    key: "amber_hayden",
    firstName: "Amber",
    lastName: "Hayden",
    jobTitle: "President and Founder",
    company: "Oakland Puzzle Company",
    yearsExperience: 11,
    companySummary: "Consumer product startup expanding into B2B channels.",
    expertiseSummary: "Founder operations, product storytelling, early-stage growth",
    needSummary: "Need customer acquisition support and partnership opportunities to grow revenue.",
    offerSummary: "Can share founder lessons and creative product launch strategies.",
    whyAttending: "Find commercial partners and customer growth advice.",
    businessNeed: "Need partner leads and customer pipeline support.",
    connectionTypes: ["biz_opps", "partnerships"],
    needTags: ["customers", "partnerships", "growth"],
    offerTags: ["founder", "operator", "creative_brand"],
    wantTags: ["customers", "partners"],
    industryTags: ["startup", "consumer"],
  },
  {
    key: "taylor_patel",
    firstName: "Taylor",
    lastName: "Patel",
    jobTitle: "Director of Sales",
    company: "PipelineForge",
    yearsExperience: 10,
    companySummary: "B2B sales tooling company focused on mid-market growth.",
    expertiseSummary: "Sales process, pipeline coaching, deal strategy",
    needSummary: "Open to partnerships with founders and operators in adjacent sectors.",
    offerSummary: "Can help with sales pipeline design, buyer discovery, and GTM execution.",
    whyAttending: "Find high-fit commercial collaborations.",
    businessNeed: "Need partner intros in startup and SaaS circles.",
    connectionTypes: ["partnerships"],
    needTags: ["partnerships", "commercial"],
    offerTags: ["sales", "gtm", "buyer"],
    wantTags: ["partners", "customers"],
    industryTags: ["saas", "startup"],
  },
  {
    key: "sam_jobseeker",
    firstName: "Sam",
    lastName: "Patel",
    jobTitle: "ML Engineer",
    company: "",
    yearsExperience: 4,
    companySummary: "",
    expertiseSummary: "Machine learning engineering, Python, model deployment",
    needSummary: "Open to work and looking for a machine learning engineer role in AI startups.",
    offerSummary: "Can contribute hands-on machine learning implementation.",
    whyAttending: "Find a new role and meet hiring managers.",
    businessNeed: "Need job opportunities in ML and data products.",
    connectionTypes: ["find_job"],
    needTags: ["job", "ml", "ai"],
    offerTags: ["engineering", "ml"],
    wantTags: ["job_opportunities"],
    industryTags: ["ai_ml", "startup"],
  },
  {
    key: "isla_intern",
    firstName: "Isla",
    lastName: "Stone",
    jobTitle: "MBA Student",
    company: "",
    yearsExperience: 1,
    companySummary: "",
    expertiseSummary: "Market research, strategy projects, analytics",
    needSummary: "Seeking a summer MBA internship in strategy, operations, or go-to-market.",
    offerSummary: "Can support analysis and customer research for early-stage teams.",
    whyAttending: "Find internship opportunities.",
    businessNeed: "Need internship opportunities with hiring teams.",
    connectionTypes: ["find_job"],
    needTags: ["internship", "mba", "career"],
    offerTags: ["analysis", "strategy"],
    wantTags: ["internship"],
    industryTags: ["education", "startup"],
  },
  {
    key: "harriet_hiring",
    firstName: "Harriet",
    lastName: "Cole",
    jobTitle: "Head of Strategy",
    company: "ScaleOps",
    yearsExperience: 13,
    companySummary: "Strategy and operations consultancy for growth-stage companies.",
    expertiseSummary: "Hiring plans, org design, growth strategy",
    needSummary: "Hiring an MBA consulting intern and early-career strategy analysts.",
    offerSummary: "Can hire interns and mentor early-career operators.",
    whyAttending: "Recruit strong candidates and meet partner teams.",
    businessNeed: "Need candidate pipeline for strategy and operations roles.",
    connectionTypes: ["recruit"],
    needTags: ["hiring", "internship", "strategy"],
    offerTags: ["hiring", "mentorship", "operations"],
    wantTags: ["talent"],
    industryTags: ["consulting", "startup"],
  },
  {
    key: "maya_mentee",
    firstName: "Maya",
    lastName: "Lin",
    jobTitle: "Product Manager",
    company: "NovaApps",
    yearsExperience: 3,
    companySummary: "Early-stage SaaS company.",
    expertiseSummary: "Product discovery, UX collaboration",
    needSummary: "Need mentorship on becoming a stronger product leader and navigating startup growth.",
    offerSummary: "Can share product execution experience from early-stage teams.",
    whyAttending: "Find mentors and senior operators.",
    businessNeed: "Need mentorship and strategic guidance.",
    connectionTypes: ["find_mentor"],
    needTags: ["mentorship", "product"],
    offerTags: ["product", "execution"],
    wantTags: ["mentor"],
    industryTags: ["startup", "saas"],
  },
  {
    key: "morgan_mentor",
    firstName: "Morgan",
    lastName: "Reed",
    jobTitle: "Operating Partner",
    company: "Catalyst Capital",
    yearsExperience: 18,
    companySummary: "Investment and advisory firm for B2B startups.",
    expertiseSummary: "Operator coaching, scaling teams, go-to-market systems",
    needSummary: "Open to meeting founders and operators.",
    offerSummary: "Mentor founders on hiring, leadership, fundraising, and commercial scaling.",
    whyAttending: "Provide practical guidance and meet quality founders.",
    businessNeed: "Open to advisory and partnership discussions.",
    connectionTypes: ["be_mentor", "partnerships"],
    needTags: ["networking", "partnerships"],
    offerTags: ["mentor", "operator", "fundraising"],
    wantTags: ["founders"],
    industryTags: ["startup", "investors"],
  },
  {
    key: "fiona_fundraising",
    firstName: "Fiona",
    lastName: "Kim",
    jobTitle: "Founder",
    company: "SignalPilot",
    yearsExperience: 7,
    companySummary: "AI startup building workflow automation for operations teams.",
    expertiseSummary: "AI product development, early sales, founder operations",
    needSummary: "Raising a seed round and need fundraising guidance plus investor introductions.",
    offerSummary: "Can share founder operating lessons and product insights.",
    whyAttending: "Meet investors and experienced operators.",
    businessNeed: "Need fundraising support and strategic advisors.",
    connectionTypes: ["biz_opps"],
    needTags: ["fundraising", "startup"],
    offerTags: ["founder", "ai"],
    wantTags: ["investors", "advisors"],
    industryTags: ["startup", "ai_ml"],
  },
  {
    key: "ingrid_investor",
    firstName: "Ingrid",
    lastName: "Park",
    jobTitle: "General Partner",
    company: "Northstar Ventures",
    yearsExperience: 16,
    companySummary: "Seed-stage venture fund focused on B2B and AI.",
    expertiseSummary: "Fundraising, venture strategy, founder coaching",
    needSummary: "Looking to meet promising startup founders and operators.",
    offerSummary: "Can advise on fundraising strategy, investor readiness, and board narratives.",
    whyAttending: "Support founders with capital strategy.",
    businessNeed: "Open to meeting fund-returning founders and partners.",
    connectionTypes: ["be_mentor", "partnerships"],
    needTags: ["networking", "startup"],
    offerTags: ["fundraising", "advisor", "investor"],
    wantTags: ["founders"],
    industryTags: ["investors", "startup"],
  },
  {
    key: "nora_networking",
    firstName: "Nora",
    lastName: "Bell",
    jobTitle: "Software Engineer",
    company: "DataOrbit",
    yearsExperience: 5,
    companySummary: "Data platform company serving enterprise teams.",
    expertiseSummary: "Backend systems, data pipelines, APIs",
    needSummary: "Interested in networking and meeting peers across AI and data engineering.",
    offerSummary: "Can discuss backend engineering and data architecture.",
    whyAttending: "Meet interesting peers and exchange ideas.",
    businessNeed: "General networking with technical and product peers.",
    connectionTypes: ["general"],
    needTags: ["networking", "engineering"],
    offerTags: ["engineering", "data"],
    wantTags: ["peers"],
    industryTags: ["ai_ml", "enterprise"],
  },
]

type CaseExpectation = {
  sourceKey: string
  expectedAny: string[]
  description: string
}

const EXPECTATIONS: CaseExpectation[] = [
  {
    sourceKey: "sam_jobseeker",
    expectedAny: ["harriet_hiring", "brant_johnson"],
    description: "Job seeker should surface at least one hiring-capable profile.",
  },
  {
    sourceKey: "isla_intern",
    expectedAny: ["harriet_hiring", "brant_johnson"],
    description: "Internship seeker should surface hiring-capable profile.",
  },
  {
    sourceKey: "maya_mentee",
    expectedAny: ["morgan_mentor", "ingrid_investor"],
    description: "Mentorship seeker should surface mentor-capable senior profile.",
  },
  {
    sourceKey: "fiona_fundraising",
    expectedAny: ["ingrid_investor", "morgan_mentor"],
    description: "Fundraising seeker should surface investor/advisor profile.",
  },
  {
    sourceKey: "amber_hayden",
    expectedAny: ["taylor_patel", "panther_rice", "kelton_davis", "taylor_allen"],
    description: "Customer acquisition profile should surface role-adjacent commercial candidate.",
  },
  {
    sourceKey: "taylor_allen",
    expectedAny: ["kelton_davis", "panther_rice", "taylor_patel"],
    description: "Partnerships profile should surface sales/partnership role adjacency.",
  },
  {
    sourceKey: "brant_johnson",
    expectedAny: ["kelton_davis", "panther_rice", "taylor_patel"],
    description: "Mixed hiring+partnership profile should include commercial-adjacent match.",
  },
]

function displayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

function summaryLine(match: MatchView): string {
  const reasons = match.reasons.length > 0 ? ` | reasons: ${match.reasons.join("; ")}` : ""
  return `${match.candidateName} [${match.rawScore}] - ${match.summary}${reasons}`
}

async function getOrCreateEvent(eventCode: string): Promise<{ eventId: string; eventName: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("events")
    .select("event_id, event_name")
    .eq("event_code", eventCode)
    .maybeSingle()

  if (existingError) {
    throw new Error(`events_lookup_failed: ${existingError.message}`)
  }

  if (existing) {
    return { eventId: existing.event_id, eventName: existing.event_name }
  }

  const now = new Date()
  const starts = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  const ends = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { data: created, error: createError } = await supabase
    .from("events")
    .insert({
      event_code: eventCode,
      event_name: "E2E Matcher Test Event",
      event_location: "Automated Test",
      event_starts_at: starts,
      event_ends_at: ends,
      onboarding_question_schema: {},
      matching_config: {},
    })
    .select("event_id, event_name")
    .single()

  if (createError || !created) {
    throw new Error(`events_create_failed: ${createError?.message || "unknown"}`)
  }

  return { eventId: created.event_id, eventName: created.event_name }
}

async function cleanupTestEvent(eventId: string): Promise<void> {
  const { data: attendanceRows, error: attendanceErr } = await supabase
    .from("attendance")
    .select("user_id")
    .eq("event_id", eventId)

  if (attendanceErr) {
    throw new Error(`attendance_lookup_failed: ${attendanceErr.message}`)
  }

  const attendeeIds = [...new Set((attendanceRows || []).map((r: any) => r.user_id).filter(Boolean))]

  if (attendeeIds.length > 0) {
    const { data: usersInEvent, error: usersErr } = await supabase
      .from("users")
      .select("user_id, email")
      .in("user_id", attendeeIds)

    if (usersErr) {
      throw new Error(`users_lookup_failed: ${usersErr.message}`)
    }

    const unsafeRows = (usersInEvent || []).filter((u: any) => {
      const email = String(u.email || "").toLowerCase()
      return !email.endsWith(`@${TEST_EMAIL_DOMAIN}`)
    })

    if (unsafeRows.length > 0) {
      const badEmails = unsafeRows.map((u: any) => u.email).join(", ")
      throw new Error(
        `event_contains_non_test_users: ${badEmails}. Use a dedicated test event code or clean this event manually.`,
      )
    }

    await supabase
      .from("connections")
      .delete()
      .eq("event_id", eventId)
      .eq("connection_kind", "system_match")

    await supabase
      .from("attendance")
      .delete()
      .eq("event_id", eventId)

    await supabase
      .from("users")
      .delete()
      .in("user_id", attendeeIds)
  } else {
    await supabase
      .from("connections")
      .delete()
      .eq("event_id", eventId)
      .eq("connection_kind", "system_match")
  }
}

async function seedFixtures(eventId: string): Promise<Map<string, string>> {
  const keyToUserId = new Map<string, string>()

  for (const fixture of FIXTURES) {
    const userId = randomUUID()
    keyToUserId.set(fixture.key, userId)

    const email = `${fixture.key}@${TEST_EMAIL_DOMAIN}`

    const { error: userError } = await supabase
      .from("users")
      .insert({
        user_id: userId,
        email,
        first_name: fixture.firstName,
        last_name: fixture.lastName,
        career_title: fixture.jobTitle,
        company_name: fixture.company,
        career_years_experience: fixture.yearsExperience,
        company_summary: fixture.companySummary,
        expertise_summary: fixture.expertiseSummary,
        want_summary_text: fixture.needSummary,
        offer_summary_text: fixture.offerSummary,
        need_tags: fixture.needTags,
        offer_tags: fixture.offerTags,
        want_tags: fixture.wantTags,
        industry_tags: fixture.industryTags,
      })

    if (userError) {
      throw new Error(`user_insert_failed (${fixture.key}): ${userError.message}`)
    }

    const needFlowState = {
      node_path: fixture.needTags.slice(0, 3).map((tag, idx) => ({
        node: `need_node_${idx + 1}`,
        question: `Need detail ${idx + 1}`,
        answer: tag,
      })),
    }

    const offerFlowState = {
      node_path: fixture.offerTags.slice(0, 3).map((tag, idx) => ({
        node: `offer_node_${idx + 1}`,
        question: `Offer detail ${idx + 1}`,
        answer: tag,
      })),
    }

    const { error: attendanceError } = await supabase
      .from("attendance")
      .insert({
        event_id: eventId,
        user_id: userId,
        attendee_first_name: fixture.firstName,
        attendee_last_name: fixture.lastName,
        why_attending_text: fixture.whyAttending,
        business_need_text: fixture.businessNeed,
        connection_types_selected: fixture.connectionTypes,
        onboarding_completed: true,
        checked_in_at: new Date().toISOString(),
        need_summary_final: fixture.needSummary,
        offer_summary_final: fixture.offerSummary,
        event_need_tags: fixture.needTags,
        event_offer_tags: fixture.offerTags,
        event_want_tags: fixture.wantTags,
        event_industry_tags: fixture.industryTags,
        need_flow_state_json: needFlowState,
        offer_flow_state_json: offerFlowState,
      })

    if (attendanceError) {
      throw new Error(`attendance_insert_failed (${fixture.key}): ${attendanceError.message}`)
    }
  }

  return keyToUserId
}

async function runMatchmakerForUser(eventId: string, userId: string): Promise<any> {
  const matchmakerUrl = `${SUPABASE_URL}/functions/v1/matchmaker`

  const response = await fetch(matchmakerUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      event_id: eventId,
      user_id: userId,
      force_recompute: true,
    }),
  })

  const text = await response.text()
  let payload: any
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { ok: false, error: text }
  }

  if (!response.ok || payload?.ok !== true) {
    throw new Error(`matchmaker_failed (${userId}): ${JSON.stringify(payload)}`)
  }

  return payload
}

function buildAssertions(results: PerSourceResult[], keyToUserId: Map<string, string>): AssertionResult[] {
  const userIdToKey = new Map<string, string>()
  for (const [key, userId] of keyToUserId.entries()) userIdToKey.set(userId, key)

  const assertions: AssertionResult[] = []

  for (const row of results) {
    const count = row.matches.length
    assertions.push({
      name: `${row.sourceKey}: final match count in range 1-3`,
      passed: count >= 1 && count <= 3,
      details: `count=${count}`,
    })

    const hasSelf = row.matches.some((m) => m.candidateKey === row.sourceKey)
    assertions.push({
      name: `${row.sourceKey}: no self-match`,
      passed: !hasSelf,
      details: hasSelf ? "self-match detected" : "ok",
    })
  }

  for (const expectation of EXPECTATIONS) {
    const source = results.find((r) => r.sourceKey === expectation.sourceKey)
    if (!source) {
      assertions.push({
        name: `${expectation.sourceKey}: ${expectation.description}`,
        passed: false,
        details: "source result missing",
      })
      continue
    }

    const candidateKeys = source.matches.map((m) => m.candidateKey)
    const hit = expectation.expectedAny.find((key) => candidateKeys.includes(key))

    assertions.push({
      name: `${expectation.sourceKey}: ${expectation.description}`,
      passed: Boolean(hit),
      details: hit
        ? `matched expected candidate ${hit}`
        : `top candidates were ${candidateKeys.join(", ") || "none"}`,
    })
  }

  const distinctCandidates = new Set<string>()
  for (const row of results) {
    for (const match of row.matches) distinctCandidates.add(match.candidateKey)
  }

  assertions.push({
    name: "global: candidate diversity across suite",
    passed: distinctCandidates.size >= Math.max(5, Math.floor(FIXTURES.length / 3)),
    details: `distinct candidates surfaced=${distinctCandidates.size}`,
  })

  return assertions
}

function buildMarkdownReport(params: {
  eventCode: string
  eventId: string
  generatedAt: string
  results: PerSourceResult[]
  assertions: AssertionResult[]
}): string {
  const { eventCode, eventId, generatedAt, results, assertions } = params
  const passed = assertions.filter((a) => a.passed).length
  const failed = assertions.length - passed

  const lines: string[] = []
  lines.push("# Matcher E2E Test Report")
  lines.push("")
  lines.push(`- Generated at: ${generatedAt}`)
  lines.push(`- Event code: ${eventCode}`)
  lines.push(`- Event id: ${eventId}`)
  lines.push(`- Candidates seeded: ${FIXTURES.length}`)
  lines.push(`- Assertions: ${assertions.length} (${passed} passed, ${failed} failed)`)
  lines.push("")
  lines.push("## Assertion Results")
  lines.push("")
  for (const a of assertions) {
    lines.push(`- ${a.passed ? "PASS" : "FAIL"}: ${a.name} (${a.details})`)
  }
  lines.push("")
  lines.push("## Top Matches By Source")
  lines.push("")

  for (const row of results) {
    lines.push(`### ${row.sourceName} (${row.sourceKey})`)
    if (row.matches.length === 0) {
      lines.push("- No matches returned")
    } else {
      row.matches.forEach((m, idx) => {
        lines.push(`- ${idx + 1}. ${summaryLine(m)}`)
      })
    }
    lines.push("")
  }

  return lines.join("\n")
}

async function main() {
  const startedAt = new Date().toISOString()
  console.log(`Running matcher E2E suite on event code ${TEST_EVENT_CODE}...`)

  const { eventId, eventName } = await getOrCreateEvent(TEST_EVENT_CODE)
  console.log(`Using event: ${eventName} (${eventId})`)

  await cleanupTestEvent(eventId)
  console.log("Cleaned prior test rows for this event")

  const keyToUserId = await seedFixtures(eventId)
  console.log(`Seeded ${keyToUserId.size} deterministic test attendees`)

  const userIdToFixture = new Map<string, CandidateFixture>()
  for (const fixture of FIXTURES) {
    const userId = keyToUserId.get(fixture.key)
    if (!userId) continue
    userIdToFixture.set(userId, fixture)
  }

  const results: PerSourceResult[] = []

  for (const fixture of FIXTURES) {
    const sourceUserId = keyToUserId.get(fixture.key)
    if (!sourceUserId) continue

    const payload = await runMatchmakerForUser(eventId, sourceUserId)
    const matches = Array.isArray(payload.matches) ? payload.matches : []

    const rendered: MatchView[] = matches.map((m: any) => {
      const candidateFixture = userIdToFixture.get(String(m.id))
      const candidateName = candidateFixture
        ? displayName(candidateFixture.firstName, candidateFixture.lastName)
        : String(m.id)
      return {
        candidateKey: candidateFixture?.key || String(m.id),
        candidateName,
        rawScore: Number(m.raw_score || 0),
        normalizedScore: Number(m.score || 0),
        summary: String(m.reason_summary || ""),
        reasons: Array.isArray(m.reasons) ? m.reasons.map((r: any) => String(r)) : [],
        fallbackUsed: Boolean(m.fallback_used),
      }
    })

    results.push({
      sourceKey: fixture.key,
      sourceName: displayName(fixture.firstName, fixture.lastName),
      matches: rendered,
    })
  }

  const assertions = buildAssertions(results, keyToUserId)
  const passCount = assertions.filter((a) => a.passed).length
  const failCount = assertions.length - passCount

  const reportJson = {
    generated_at: startedAt,
    event_code: TEST_EVENT_CODE,
    event_id: eventId,
    seeded_candidates: FIXTURES.length,
    assertions_total: assertions.length,
    assertions_passed: passCount,
    assertions_failed: failCount,
    assertions,
    results,
  }

  const reportMd = buildMarkdownReport({
    eventCode: TEST_EVENT_CODE,
    eventId,
    generatedAt: startedAt,
    results,
    assertions,
  })

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(REPORT_JSON_PATH, JSON.stringify(reportJson, null, 2), "utf8")
  await writeFile(REPORT_MD_PATH, reportMd, "utf8")

  console.log(`Assertions: ${passCount}/${assertions.length} passed`)
  if (failCount > 0) {
    console.log("Failed assertions:")
    for (const fail of assertions.filter((a) => !a.passed)) {
      console.log(`- ${fail.name}: ${fail.details}`)
    }
  }

  console.log("\nSample source results:")
  for (const row of results.slice(0, 3)) {
    console.log(`- ${row.sourceName}:`)
    for (const m of row.matches.slice(0, 3)) {
      console.log(`  * ${summaryLine(m)}`)
    }
  }

  console.log(`\nWrote ${REPORT_JSON_PATH}`)
  console.log(`Wrote ${REPORT_MD_PATH}`)

  if (failCount > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("Matcher E2E suite failed:", error)
  process.exit(1)
})
