// Claude prompts for the branching onboarding flow. Ported verbatim from the
// Google Apps Script sources (src/Code.js + src/offer.js + src/want_embed.js).
// Changes here directly affect match quality; edit with care.

export interface PersonContext {
  name?: string | null
  company?: string | null
  jobTitle?: string | null
  role?: string | null
}

export function formatPersonContextBlock(p: PersonContext | null | undefined): string {
  const pp = p || {}
  let s =
    "Name: " +
    (pp.name || "") +
    "\n" +
    "Company: " +
    (pp.company || "") +
    "\n" +
    "Job title: " +
    (pp.jobTitle || "") +
    "\n"
  if (pp.role) {
    s += "Role / function (explicit field): " + pp.role + "\n"
  } else {
    s +=
      "Role / function: (no separate role column — use job title as the primary role signal; do not contradict explicit answers)\n"
  }
  return s
}

/** Free-text profile the user filled before this flow; use to clarify, not to invent new goals. */
export function formatOnboardingProfileBlock(u: {
  expertise_summary?: string | null
  company_summary?: string | null
}): string {
  const lines: string[] = []
  const exp = (u.expertise_summary || "").trim()
  const co = (u.company_summary || "").trim()
  if (exp) lines.push(`Expertise / what they do: ${exp}`)
  if (co) lines.push(`What their company does: ${co.slice(0, 500)}`)
  return lines.join("\n")
}

// ---- Need: in-flow clarifying MC instructions ----
// Branch-aware version: still deterministic rules-first, but with explicit
// A-F branch objectives and student/between-roles overlay.
export interface NeedDynamicInstructionContext {
  branchCode: "A" | "B" | "C" | "D" | "E" | "F"
  branchLabel: string
  resolvedBranchCode: "A" | "B" | "C" | "D" | "E" | "F" | "truly_unique"
  firstAiTurnInBranch: boolean
  studentOverlay: boolean
  companyKnown: boolean
  companySummaryKnown: boolean
  mappedBranch?: string | null
  coveredSignals?: string[]
  missingSignals?: string[]
}

function formatSignalList(title: string, values: string[] | undefined): string {
  if (!values || values.length === 0) return `${title}: (none)`
  return `${title}: ${values.join("; ")}`
}

function buildBranchDirective(context: NeedDynamicInstructionContext): string {
  const shared =
    "BRANCH-AWARE REQUIREMENTS (highest priority):\n" +
    "- Use the branch objective below to decide the next best question.\n" +
    "- Ask exactly one multiple-choice question per turn.\n" +
    '- Choices must include "Other" as the final option.\n' +
    "- Build on prior answers; do not restart from generic discovery.\n" +
    "- If the branch goals are already clear, return skip.\n\n"

  const overlay =
    context.studentOverlay
      ? "STUDENT/BETWEEN-ROLES OVERLAY: ACTIVE. Avoid company ICP, hiring pipeline, or sales pipeline assumptions unless explicitly stated. Anchor on field of study, target role family, personal projects, or curiosity area. For partnership/customer paths, default to career exploration unless explicit business intent is stated.\n\n"
      : ""

  const companyGuard = context.companySummaryKnown
    ? "COMPANY SUMMARY: KNOWN. Do not ask what the company does.\n\n"
    : ""

  const signals =
    `${formatSignalList("Covered signals", context.coveredSignals)}\n` +
    `${formatSignalList("Missing signals", context.missingSignals)}\n\n`

  const branchA =
    "Branch A (Meet people generally) objective:\n" +
    "1) Identify who they want to meet: peer, opposite perspective, mentor, mentee, collaborator, or casual.\n" +
    "2) Identify what they want to discuss: work, career path, tools, a challenge, or life outside work.\n" +
    "3) Bonus: capture one shared-interest hook (hobby/topic).\n" +
    "4) If job/internship hints appear, capture specific work target (function, field of study, or role track).\n"

  const branchB =
    "Branch B (Learn about the topic) objective:\n" +
    "1) Capture a specific sub-topic (not umbrella topic).\n" +
    "2) Capture why it matters now: current problem, upcoming decision, tool evaluation, or curiosity.\n" +
    "3) Capture best teacher profile: practitioner, vendor/expert, researcher, or peer learner.\n"

  const branchC =
    "Branch C (Build partnerships) objective:\n" +
    "1) On first AI turn, commit to one sub-intent: sales/integration, sponsor-find, sponsor-offer, investor-raising, investor-investing, cross-sector.\n" +
    "2) Then capture target profile details by sub-intent:\n" +
    "   - sales/integration: partner industry, stage, size\n" +
    "   - sponsor-find: what needs sponsorship and audience\n" +
    "   - sponsor-offer: audience they want to reach\n" +
    "   - investor-raising: stage, sector, check size\n" +
    "   - investor-investing: thesis and sector focus\n" +
    "   - cross-sector: cause area, geography, partner type\n"

  const branchD =
    "Branch D (Find customers) objective:\n" +
    "1) Fill ideal-customer gap: industry, buyer role, or company size (only what is missing).\n" +
    "2) Capture buying situation: actively evaluating, exploring, replacing vendor, or problem-aware only.\n" +
    "Never re-ask what the company does when summary exists.\n"

  const branchE =
    "Branch E (Represent an organization) objective:\n" +
    "1) Capture why the org is here: recruit, sell, partner, learn, build presence, support clients.\n" +
    "2) Capture who they want to meet: peers, buyers, suppliers, regulators, talent, press, investors.\n" +
    "3) Bonus: one specific topic the org can lead.\n" +
    "Anchor on known company name and never ask what the company does.\n"

  const branchFFirstTurn =
    "Branch F (Other) first-turn objective:\n" +
    "Map intent to one of A/B/C/D/E or truly_unique on this turn.\n" +
    'Include "mapped_branch" in JSON with one of: "A","B","C","D","E","truly_unique".\n' +
    "If mapped to truly_unique, next question should identify who would help, grounded in user words.\n" +
    "After mapping to A-E, continue using that branch objective.\n"

  const branchFResolved =
    context.resolvedBranchCode === "truly_unique"
      ? "Branch F mapped objective (truly_unique): ask who would be most helpful to meet, grounded in the user's own words and constraints.\n"
      : `Branch F mapped objective: use mapped branch ${context.resolvedBranchCode} rules for this turn.\n`

  const branchMap: Record<string, string> = {
    A: branchA,
    B: branchB,
    C: branchC,
    D: branchD,
    E: branchE,
    F:
      context.firstAiTurnInBranch && !context.mappedBranch
        ? branchFFirstTurn
        : branchFResolved,
  }

  const objectiveKey =
    context.resolvedBranchCode === "truly_unique" ? "F" : context.resolvedBranchCode

  return (
    shared +
    `Current branch: ${context.branchCode} (${context.branchLabel})\n` +
    `Resolved branch target: ${context.resolvedBranchCode}\n` +
    `First AI turn in branch: ${context.firstAiTurnInBranch ? "yes" : "no"}\n` +
    `Company known: ${context.companyKnown ? "yes" : "no"}\n` +
    `Company summary known: ${context.companySummaryKnown ? "yes" : "no"}\n\n` +
    overlay +
    companyGuard +
    signals +
    branchMap[objectiveKey] +
    "\n"
  )
}

export function getAiMultipleChoiceInstructions(
  mode: string,
  context?: NeedDynamicInstructionContext,
): string {
  const PHASE1 =
    "You are a gap-check engine for a networking match system.\n" +
    "You always receive:\n" +
    "- PERSON CONTEXT: name, company, job title, and optional role/function field.\n" +
    "- FULL QUESTIONNAIRE TRANSCRIPT: every step with node id, full question text (including options), and the user's answer.\n" +
    "Treat the transcript as ground truth for what was asked and chosen.\n" +
    "Use job title/profile only to disambiguate wording; never override explicit answers.\n\n" +
    "PHASE 1 (silent):\n" +
    "1) Synthesize one concise draft summary from the full transcript.\n" +
    "2) Decide what key signal is still missing for matching quality.\n"

  const PHASE2 =
    "PHASE 2:\n" +
    "- If questions_asked >= 7 or required signals are already clear, return skip.\n" +
    "- Otherwise ask exactly one multiple-choice question that fills the highest-priority missing signal.\n" +
    "- Never repeat already-covered topics.\n" +
    "- Keep question concise and practical.\n\n"

  const CHOICES =
    "Choice rules:\n" +
    '- 4 to 7 choices total, with "Other" always last.\n' +
    "- Choices must be non-overlapping and parallel.\n" +
    "- Each choice should be short and concrete.\n\n"

  const requireMappedBranch =
    context?.branchCode === "F" &&
    context?.firstAiTurnInBranch &&
    !context?.mappedBranch

  const FORMAT =
    "Format rules:\n" +
    "- Return JSON only.\n" +
    '- Always include "draft_summary".\n' +
    "- If asking a question:\n" +
    '  {"draft_summary":"...","question":"...","choices":["...","...","Other"]}\n' +
    "- If no question needed:\n" +
    '  {"draft_summary":"...","question":null,"choices":null}\n' +
    (requireMappedBranch
      ? '- Also include "mapped_branch": "A" | "B" | "C" | "D" | "E" | "truly_unique".\n'
      : "")

  const BRANCH = context ? `\n${buildBranchDirective(context)}\n` : ""
  const BASE = PHASE1 + PHASE2 + CHOICES + BRANCH + FORMAT

  if (mode === "event_topics_for_learning") {
    return (
      BASE +
      "\nMode override: event_topics_for_learning\n" +
      "Use event context to propose concrete sub-topic options relevant to this event.\n"
    )
  }

  if (mode === "clarify_job_target") {
    return (
      BASE +
      "\nMode override: clarify_job_target\n" +
      "If job/internship intent exists, do not stop until function/field/role-track specificity is clear (unless step cap reached).\n"
    )
  }

  if (mode === "sponsor_roi_type") {
    return (
      BASE +
      "\nMode override: sponsor_roi_type\n" +
      "Focus on customer-profile, buying context, and best conversation partner. Avoid internal seller-pain framing.\n"
    )
  }

  return BASE
}
// ---- Need: rewrite summary after user correction ----
// Port of rewriteNeedSummary_() in src/Code.js.
export const REWRITE_NEED_SUMMARY_INSTRUCTIONS =
  "You are revising a one-sentence need summary for a networking match system.\n\n" +
  "You will receive:\n" +
  "- Person context (job title and optional role)\n" +
  "- Optional PROFILE snippets from earlier onboarding\n" +
  "- Full questionnaire transcript (every question and answer)\n" +
  "- Short Q/A history\n" +
  "- The current draft summary\n" +
  "- The user's correction message\n\n" +
  "Rules:\n" +
  '- Rewrite as ONE fluent sentence starting with "Looking for..." or "Needs help with...".\n' +
  "- Synthesize the whole journey (all transcript steps that still matter) plus the correction into coherent prose — do not paste their wording verbatim or stack clauses that mirror each question.\n" +
  "- Incorporate ONLY what the user explicitly stated in the transcript, profile (when provided), and correction. Do not invent details.\n" +
  "- Use job title/role and profile only to disambiguate; never contradict what they selected in the transcript.\n" +
  "- Use the correction to override or clarify anything in the current draft that was wrong.\n" +
  "- Keep it concrete; aim under ~32 words unless extra words are needed for distinct signals from multiple steps.\n" +
  "- Return ONLY the revised sentence — no preamble, no JSON, no quotes.\n"

export function buildRewriteNeedSummaryUserPayload(
  currentDraft: string,
  qaHistory: string,
  correction: string,
  personBlock: string,
  fullTranscript: string,
  profileBlock?: string,
): string {
  const profile = (profileBlock || "").trim()
  return (
    `PERSON CONTEXT:\n${personBlock || "(none)"}\n\n` +
    (profile
      ? `PROFILE (earlier onboarding — clarify only; do not replace explicit questionnaire answers):\n${profile}\n\n`
      : "") +
    `FULL QUESTIONNAIRE TRANSCRIPT:\n${fullTranscript || "(none)"}\n\n` +
    `Short Q/A history:\n${qaHistory || "(none)"}\n\n` +
    `Current draft summary:\n${currentDraft || "(none yet)"}\n\n` +
    `User correction:\n${correction}\n\n` +
    `Return the revised one-sentence summary only.`
  )
}

// ---- Offer: intro question (Q1) ----
// Port of generateOfferIntroQuestion_() in src/offer.js.
export interface OfferIntroContext {
  jobTitle: string
  company: string
  companyDescription: string
  yearsInRole: string | number | null
  needCore: string
  needTags: string[]
}

export function buildOfferIntroInstructions(ctx: OfferIntroContext): string {
  return `
You generate a smart, context-aware question to identify what this person can offer at an event.

CRITICAL RULES:
1. DO NOT mention their NEED in the offer options
   - If they need "marketing cofounder", DO NOT offer them "marketing" options
   - Their need indicates what they LACK, not what they HAVE
2. Infer what they offer from:
   - Their job title (VP Engineering → tech/product expertise)
   - INVERSE of their need (seeking marketing → likely has product/tech)
   - Their company's domain (from company_description)
3. Each choice must be 3-7 words MAX
4. NO "and" in any choice (one idea per choice)
5. Option E must ALWAYS be "Other"

CONTEXT:
- Job title: ${ctx.jobTitle}
- Company: ${ctx.company}
- Company description: ${ctx.companyDescription}
- Years in role: ${ctx.yearsInRole ?? ""}
- Their NEED (what they're looking for): ${ctx.needCore}
- Need tags: ${(ctx.needTags || []).join(", ")}

INFERENCE EXAMPLES:
- VP Engineering + seeking "marketing cofounder" → Offers: product strategy, technical architecture, engineering hiring
- Marketing Director + company in "cybersecurity" → Offers: cybersecurity marketing, security industry connections
- Sales VP + seeking "fundraising help" → Offers: sales strategy, revenue growth advice

QUESTION GENERATION RULES:
- Make the question feel natural and conversational, not robotic
- Reference their specific context when it makes sense (e.g., "Given your role at [Company]" or "Based on your experience in [domain]")
- Keep it concise (8-15 words)
- Avoid meta-language like "to help us understand" or "tell us about"
- Make it feel like a genuine conversation starter
- Examples of good questions:
  * "What could you help others with based on your experience?"
  * "What would be most valuable for you to offer here?"
  * "What expertise or connections could you share?"
  * "What could others benefit from your experience with?"

TASK:
Generate 4 offer options (A-D) based on:
1. Their actual role/title
2. Their company's industry/domain
3. The OPPOSITE of what they need
4. Their seniority level

OUTPUT (JSON):
{
  "question": "Natural, contextual question (8-15 words, feel conversational)",
  "choices": [
    "Short option A (3-7 words)",
    "Short option B (3-7 words)",
    "Short option C (3-7 words)",
    "Short option D (3-7 words)",
    "Other"
  ]
}

CHOICE QUALITY RULES:
- A/B should be EXPERTISE (what they know deeply)
- C/D should be CONNECTIONS or RESOURCES (who they know, what they can access)
- Keep language concrete: "Product strategy for SaaS" not "Guidance on strategy"
- NO generic fluff: "insights", "guidance", "networking opportunities"

Return ONLY valid JSON.`
}

// ---- Offer: validation question (Q2) ----
// Port of generateOfferValidationQuestion_() in src/offer.js.
export interface OfferValidationContext {
  selectedOffer: string
  lastQ: string
  lastA: string
  jobTitle: string
  company: string
  companyDescription: string
}

export function buildOfferValidationInstructions(ctx: OfferValidationContext): string {
  return `
You generate a VALIDATION question for what they just selected in Q1.

CRITICAL RULES:
1. Ask about WHAT THEY SELECTED in Q1, NOT about their need
2. Make it feel like a natural follow-up conversation, not an interrogation
3. Be SPECIFIC to what they selected - avoid vague phrases like "tech resources" or "network"
4. Reference their selection directly in the question when it makes sense
5. Make it clear WHY we're asking (implicitly) - to help match them with the right people

CONTEXT:
- They selected in Q1: ${ctx.selectedOffer}
- Q1 question was: ${ctx.lastQ}
- Their Q1 answer: ${ctx.lastA}
- Job title: ${ctx.jobTitle}
- Company: ${ctx.company}
- Company description: ${ctx.companyDescription}

QUESTION GENERATION RULES:
- Make questions feel natural and conversational
- Reference what they selected directly (e.g., "your connections to investors" not "your network in tech resources")
- Avoid awkward phrasing that makes people think "why are you asking this?"
- Keep it concise (8-15 words)
- Make it feel like a helpful clarification, not a test

VALIDATION PATTERNS:

If they selected EXPERTISE (e.g., "Product strategy", "Engineering leadership", "Fraud detection"):
- Reference the specific expertise they mentioned
- Ask about depth/experience level naturally
- Good: "How would you describe your experience with [specific thing they selected]?"
- Good: "What's your level of experience with [specific thing]?"
- Bad: "How would you describe your network in tech resources?" (wrong type, too vague)

If they selected CONNECTIONS (e.g., "Connections to investors", "Know SaaS founders", "Access to tech industry resources"):
- Reference the SPECIFIC type of connections they mentioned
- Ask about the nature/quality of those connections
- Good: "How would you describe your connections to [specific group they mentioned]?"
- Good: "What's your network like in [specific area they mentioned]?"
- Bad: "How would you describe your network in tech resources?" (too vague, doesn't reference what they selected)

If they selected RESOURCES (e.g., "Access to tech industry resources", "Product authentication technology"):
- Ask about how they can help others access these resources
- Good: "How could others access [specific resource they mentioned] through you?"
- Good: "What's the best way for others to benefit from your [specific resource]?"

If they selected INDUSTRY-SPECIFIC (e.g., "Cybersecurity for healthcare", "SaaS product strategy"):
- Ask about their specific experience in that industry/domain
- Good: "Does [Company] work specifically in [industry]?"
- Good: "What's your experience with [specific industry/domain]?"

TASK:
Based on what they selected (${ctx.selectedOffer}), generate a natural, contextual validation question that:
1. References what they actually selected (be specific, not generic)
2. Feels like a helpful follow-up, not an awkward interrogation
3. Helps us understand how they can help others

OUTPUT (JSON):
{
  "question": "Natural validation question (8-15 words, specific to what they selected)",
  "choices": [
    "Choice A (3-7 words, natural language)",
    "Choice B (3-7 words, natural language)",
    "Choice C (3-7 words, natural language)",
    "Other"
  ]
}

Return ONLY valid JSON.`
}

// ---- Offer: final summary (consumed by matching) ----
// Port of generateOfferSummary_() in src/offer.js.
export interface OfferSummaryContext {
  name: string
  company: string
  companyDescription: string
  jobTitle: string
  yearsInRole: string | number | null
  expertiseSummary: string
  needCore: string
  offerQ1: string
  offerA1: string
  offerQ2: string
  offerA2: string
}

export function buildOfferSummaryInstructions(ctx: OfferSummaryContext): string {
  return `
You generate a structured "Offer" summary for event matchmaking.

PRIMARY SOURCES: A1, A2, plus job title / company / company description / expertise (when provided) so the offer reads like one coherent capability — not two pasted fragments.

STRUCTURE for offer_core_AI:
- Start with "Can help with" (or close natural equivalent)
- In fluent prose, merge: (1) what they help with or know deeply from A1, (2) who benefits or what situations from A2
- Preserve concrete specifics they named (tools, domains, role types, industries, credentials) — you may tighten phrasing but must not drop those anchors or swap them for vague synonyms
- Use job title, company domain, and expertise only to frame the offer when it adds clarity; never describe what they lack (that belongs in NEED)

STYLE:
- One or two flowing sentences, 18–45 words
- Do NOT concatenate with semicolons as if pasting Q/A. Do NOT quote the questions.

FORBIDDEN:
- Generic substitutes: "business development" for "build their business", "career advice" for "summer internship for MBA"
- Omitting specifics: MBA, internship, roles, industries, audience types when they appeared in A1/A2
- Including their NEED (what they lack)—only include what they OFFER
- Ultra-short blurbs that drop A1 or A2 when both have substance

INPUT CONTEXT:
- Job title: ${ctx.jobTitle}
- Company: ${ctx.company}
- Company description: ${ctx.companyDescription}
- Expertise (from profile): ${ctx.expertiseSummary || "(none)"}
- Years in role: ${ctx.yearsInRole ?? ""}
- Their NEED (do NOT put in offer): ${ctx.needCore}

A1 (problems people bring): ${ctx.offerA1}
A2 (who benefits): ${ctx.offerA2}

CHECKLIST before returning: Does offer_core_AI contain (1) substance from A1 and (2) substance from A2 when both exist? If either is missing, revise.

OUTPUT (JSON):
{
  "offer_core_AI": "Can help with …",
  "offer_tags_AI": ["tag1", "tag2", ...],
  "offer_confidence": "high" | "medium" | "low"
}

Return ONLY valid JSON.`
}

// ---- Offer: rewrite summary after user correction (mirror of need rewrite) ----
export const REWRITE_OFFER_SUMMARY_INSTRUCTIONS =
  "You are revising an offer summary for a networking match system.\n\n" +
  "You will receive:\n" +
  "- Person context (job title and optional role)\n" +
  "- Offer Q/A (what problems they solve, who benefits)\n" +
  "- Optional expertise/company context from their profile\n" +
  "- Their NEED summary (what they LACK — never include this in the offer)\n" +
  "- The current draft offer summary\n" +
  "- The user's correction message\n\n" +
  "Rules:\n" +
  '- Rewrite as fluent prose (one or two sentences), usually starting with "Can help with" when natural.\n' +
  "- Synthesize ALL offer Q/A steps plus the correction into a coherent whole — not a verbatim repeat of one answer.\n" +
  "- Incorporate ONLY what the user explicitly stated in the Q/A, profile snippets (if any), and correction. Do not invent details.\n" +
  "- NEVER put their need in the offer — offer = what they have, need = what they lack.\n" +
  "- Use the correction to override or clarify anything in the current draft that was wrong.\n" +
  "- Keep concrete anchors they named; aim ~18–45 words.\n" +
  "- Return ONLY the revised summary — no preamble, no JSON, no quotes.\n"

export function buildRewriteOfferSummaryUserPayload(
  currentDraft: string,
  offerQa: string,
  needCore: string,
  correction: string,
  personBlock: string,
  profileBlock?: string,
): string {
  const profile = (profileBlock || "").trim()
  return (
    `PERSON CONTEXT:\n${personBlock || "(none)"}\n\n` +
    (profile ? `PROFILE (for context only — offer must still match Q/A):\n${profile}\n\n` : "") +
    `OFFER Q/A:\n${offerQa || "(none)"}\n\n` +
    `Their NEED (do not include in offer):\n${needCore || "(none)"}\n\n` +
    `Current draft offer summary:\n${currentDraft || "(none yet)"}\n\n` +
    `User correction:\n${correction}\n\n` +
    `Return the revised offer summary only.`
  )
}

