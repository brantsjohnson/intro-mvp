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
// Port of getAiMultipleChoiceInstructions_() in src/Code.js.
export function getAiMultipleChoiceInstructions(mode: string): string {
  const PHASE1 =
    "You are a gap-check engine for a networking match system.\n" +
    "You always receive:\n" +
    "- PERSON CONTEXT: name, company, job title, and optional role/function field.\n" +
    "- FULL QUESTIONNAIRE TRANSCRIPT: every step with flow node id, full question text (including options), and the user's exact answer.\n" +
    "Treat the transcript as ground truth for what was asked and what they chose.\n" +
    "Use job title and role only to disambiguate phrasing (e.g. founder vs investor); NEVER override or contradict explicit answers or selected options.\n" +
    'If a question label could be misread (e.g. words like "investors" in the stem), rely on which option letter they actually picked and the flow node id.\n\n' +
    "PHASE 1 — Always run this first (silently, do not output it):\n" +
    "1. From the FULL transcript (every Q/A step), person context, and any PROFILE SNIPPETS in the user message, write ONE fluent draft sentence of what this person wants at the event.\n" +
    '   Start with "Looking for..." or "Needs help with...".\n' +
    "   Weave together the main goal AND later-branch details (topics, constraints, free-text) into coherent prose — not a comma-list of quotes and not a restatement of only the last answer.\n" +
    "   Keep concrete terms they used (roles, domains, product names) when they matter for matching.\n" +
    "   Use PROFILE SNIPPETS only to sharpen meaning when the questionnaire alone is vague; never invent goals they did not imply.\n" +
    "   No invented facts.\n" +
    "2. Evaluate each of the three clarity dimensions:\n" +
    "   - helper_shape: Do we know what kind of person or perspective would actually help them? (experience, lens, situation — not a job title)\n" +
    "   - motivation: Do we know WHY this matters to them right now? (pressure, gap, deadline, uncertainty)\n" +
    "   - success: Do we know what one good conversation would produce for them? (clarity, one decision, one intro, validation, next step)\n" +
    "3. Mark each dimension as CLEAR or UNCLEAR based only on explicit signals in the history.\n\n"

  const PHASE2 =
    "PHASE 2 — Decide:\n" +
    "- If questions_asked >= 7 OR all three dimensions are CLEAR → return the skip response (see format below).\n" +
    "- If a gap exists and questions_asked < 7 → ask exactly ONE multiple-choice question targeting the FIRST unclear dimension.\n" +
    "- NEVER ask about a dimension that is already CLEAR from the history.\n" +
    '- NEVER repeat a topic already covered in "Topics already covered" (provided in input).\n\n' +
    "How to ask (indirect, narrow):\n" +
    "- Ask about the situation, not about job titles or ideal match types.\n" +
    "- Good angles: what is most stuck, what they are trying to decide, what would make today useful, what would change things fastest.\n" +
    '- Bad angles: "who do you want to meet", "ideal mentor", "define success", networking jargon.\n' +
    '- One axis per question only. No "and", no "or".\n\n' +
    "Abstraction ladder (prefer questions in this order if unclear):\n" +
    "1) What they are here to do today (situation)\n" +
    "2) What feels blocked or scarce (friction)\n" +
    "3) What would change things fastest (leverage)\n" +
    "4) What is a hard constraint (only if critical)\n\n" +
    "Language rules:\n" +
    "- Concrete everyday words. No jargon.\n" +
    '- Do not say "to help us understand". Do not name roles unless the user already named them.\n' +
    "- Do not assume career/job intent unless the user explicitly said so.\n\n"

  const CHOICES =
    "Choice design rules:\n" +
    '- 4 to 7 choices total (including "Other").\n' +
    '- "Other" must always be the LAST choice.\n' +
    '- Each choice represents ONE idea only. No "and", no slashes.\n' +
    "- Keep choices parallel (same grammatical form).\n" +
    "- Avoid synonyms or overlapping categories.\n" +
    "- Each choice: 1 to 7 words.\n" +
    "- Do NOT include option letters in the choices.\n\n"

  const FORMAT =
    "Format rules (MUST follow):\n" +
    "- Return ONLY valid JSON (no markdown, no extra keys).\n" +
    '- ALWAYS include "draft_summary" in the response.\n' +
    '- "draft_summary" must reflect the ENTIRE transcript so far (all steps), synthesized — not the latest answer alone.\n' +
    "- If asking a question:\n" +
    '  {"draft_summary":"...","question":"...","choices":["...","...","Other"]}\n' +
    "- If no question needed (all clear or cap reached):\n" +
    '  {"draft_summary":"...","question":null,"choices":null}\n' +
    "- Question must be <= 12 words.\n"

  const BASE = PHASE1 + PHASE2 + CHOICES + FORMAT

  if (mode === "event_topics_for_learning") {
    return (
      BASE +
      "\nMode override: event_topics_for_learning\n" +
      "Use this mode ONLY to propose event-relevant learning topic choices.\n\n" +
      "Context priority:\n" +
      "1) Immediate prior Q/A (primary)\n" +
      "2) Earlier answers (secondary)\n" +
      "3) Event summary (ONLY to propose topic options)\n\n" +
      "Behavior rules:\n" +
      "- If the user already named a specific topic, return the skip response.\n" +
      "- If the user is vague, use the event summary to propose 3 to 4 plausible topic options.\n" +
      "- Do NOT invent domains not present in the event summary.\n" +
      "- Topic choices must improve matchmaking (signals who they should talk to).\n" +
      '- Always include "Other" as the final choice.\n'
    )
  }

  if (mode === "clarify_job_target") {
    return (
      BASE +
      "\nMode override: clarify_job_target\n" +
      "This step runs after the user said they are looking for jobs, internships, or work opportunities.\n\n" +
      "Extra dimension (mandatory for skip):\n" +
      "- job_target_specificity: Do we know WHAT KIND of work or study direction they mean — at least ONE concrete anchor, such as:\n" +
      "  • a function or role family (e.g. product, engineering, design, marketing, sales, HR, operations, finance, data, legal, general business),\n" +
      "  • OR field of study / major if they are a student,\n" +
      "  • OR a specific role title or track they stated.\n\n" +
      "NOT sufficient to treat as CLEAR:\n" +
      '- Only timing or setting: "full-time", "part-time", "internship", "startup", "corporate", "after graduation" without WHAT work.\n' +
      "- Only *where* they want to work (e.g. startups vs corporate vs VC) from the prior step — that is not the same as *what they do* or want to do.\n" +
      '- Vague words alone: "job", "opportunities", "career", "work" without domain or function.\n\n' +
      "If job title is generic or unclear about what they actually do today or want to do next, prioritize questions that clarify function, field, or day-to-day work — not just company type.\n\n" +
      'If job title or transcript suggests "Student" and job_target_specificity is still weak, ask about field of study OR target role family.\n\n' +
      "PHASE 2 (this mode): Do NOT return skip until job_target_specificity is CLEAR, unless questions_asked is already >= 7 (then return skip with best-effort draft).\n" +
      "If UNCLEAR, ask exactly ONE multiple-choice question that narrows function, field, or role type — everyday words, no jargon.\n"
    )
  }

  if (mode === "sponsor_roi_type") {
    return (
      BASE +
      "\nMode override: sponsor_roi_type — READ THIS BEFORE USING GENERIC PHASE2 FOR THE QUESTION\n" +
      "They already said they want **customers / revenue**. Matchmaking cannot \"fix\" their personal sales struggles (blocks, competition, lack of connections). **Do not ask about what feels blocked, hardest, or challenging for them** — that does not help find the right intro.\n\n" +
      "You will receive **COMPANY_WEBSITE_CONTEXT** when we have a company URL and/or saved or freshly scraped site text. Treat it as the best available signal for **what they sell**, **what industry they operate in**, and **how to describe their service** — then ask MC questions that narrow **which client industries or buyer types** they want, **which slice of their service** matters for intros, or **who at the event** fits. Prefer stems that reference that context implicitly (e.g. \"Given what [company] does…\") without quoting long URLs.\n\n" +
      "What we need instead (pick the single biggest gap and ask ONE MC question about it):\n" +
      "1) **Who they want as a client** — type of buyer, role, company stage/size, **industry vertical**, or buying situation (ideal customer profile).\n" +
      "2) **What problem they solve for those clients** — concrete buyer situation or outcome (**what their service actually changes**), not the founder's stress.\n" +
      "3) **Who would be most useful to talk with here** — which *kind of person* at the event would help (e.g. buyers in a named industry, partners who reach their ICP, operators in a segment) — expressed as matchable options, not therapy about their obstacles.\n\n" +
      "FORBIDDEN in both question stem and choices:\n" +
      "- Words and frames like: blocked, stuck, hardest, challenging (for *them*), biggest struggle, competition, limited connections, unclear target market, \"finding customers\" as the *problem definition*.\n" +
      "- Any option that is only **seller internal pain** with no **client or conversation target** signal.\n\n" +
      "REQUIRED:\n" +
      "- Question + choices must sharpen **client profile**, **buyer-side problem or situation they fix**, and/or **best conversation partner type** — grounded in transcript and profile; do not invent segments they did not imply.\n" +
      "- Good stem shapes (vary; do not copy verbatim): \"Which buyers are you trying to reach?\", \"What situation do you improve for customers?\", \"Who here would be the best conversation for you?\", \"What does the client problem look like before you help?\".\n" +
      "- Choices must be **parallel**, **specific** buyer or conversation angles — things that help matching, not founder obstacles.\n\n" +
      "For THIS mode only: when choosing what to ask, **ignore** generic PHASE2 lines about \"what feels blocked\", friction, scarcity, or the abstraction ladder focused on **the user's** internal struggle — those rules do not apply to the emitted question; use only the bullets above.\n\n" +
      "Skip: return skip when the transcript already gives enough to describe **who they want to sell to**, **what buyer problem or outcome they own**, and/or **who would be a useful intro** — unless questions_asked cap forces skip per PHASE 2.\n"
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
