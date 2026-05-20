// Shared engine logic used by /api/onboarding/need/* and /offer/* routes.
//
// State machine contract:
// - Client calls advance with { currentNodeId, answer }.
//   * First call: currentNodeId null, answer null → server returns entry node.
//   * Subsequent calls: server applies the answer to currentNodeId, then resolves + emits next
//     question OR returns a confirm phase with a draft summary.
// - State shape:
//   { version, node_path: StepEntry[], draft_summary, is_confirmed, asked_count, pending }
//   `pending` holds the last question we emitted, so we can replay the rendered copy
//   (important for AI-generated questions) when persisting the answered entry.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { callAiJson, callAiText, isAiEnabled } from "./ai"
import {
  FlowNode,
  FlowOption,
  FlowState,
  StepEntry,
  extractQuestionTopicsFromHistory,
  resolveNextNodeId,
  getFlowNode,
} from "./flows"
import {
  buildOfferIntroInstructions,
  buildOfferSummaryInstructions,
  buildOfferValidationInstructions,
  buildRewriteNeedSummaryUserPayload,
  buildRewriteOfferSummaryUserPayload,
  formatOnboardingProfileBlock,
  formatPersonContextBlock,
  getAiMultipleChoiceInstructions,
  type NeedDynamicInstructionContext,
  REWRITE_NEED_SUMMARY_INSTRUCTIONS,
  REWRITE_OFFER_SUMMARY_INSTRUCTIONS,
} from "./prompts"
import {
  buildShortHistory,
  buildTranscriptBlock,
  coerceState,
  entryNode,
  extractSelectedOptionId,
  flowForKind,
  flowStateToJson,
  FlowKind,
  loadOnboardingContext,
  MAX_STEPS_CONST,
  OnboardingContext,
  resolveAnswerLabel,
} from "./state"

interface PendingQuestion {
  node_id: string
  question: string
  options: FlowOption[] | null
  free_response: boolean
}

interface ExtendedFlowState extends FlowState {
  pending?: PendingQuestion | null
  mapped_need_branch?: "A" | "B" | "C" | "D" | "E" | "truly_unique" | null
}

type NeedBranchCode = "A" | "B" | "C" | "D" | "E" | "F"

const NEED_BRANCH_LABELS: Record<NeedBranchCode, string> = {
  A: "Meet people generally",
  B: "Learn about the topic",
  C: "Build partnerships",
  D: "Find customers",
  E: "Represent an organization",
  F: "Other",
}

const STUDENT_OVERLAY_HINTS = [
  "student",
  "intern",
  "unemployed",
  "between roles",
  "sabbatical",
  "freelancer between gigs",
  "looking for work",
  "job seeker",
]

export interface AdvanceResult {
  phase: "question" | "confirm" | "done"
  nodeId?: string
  question?: string
  options?: FlowOption[] | null
  freeResponse?: boolean
  draftSummary?: string
  state: ExtendedFlowState
}

export interface AdvanceInput {
  currentNodeId?: string | null
  answer?: string | null
}

// ---- Need flow ----

export async function needAdvance(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  input: AdvanceInput,
): Promise<AdvanceResult> {
  const flow = flowForKind("need")
  const state = coerceState(ctx.attendance.need_flow_state_json) as ExtendedFlowState
  state.pending = (ctx.attendance.need_flow_state_json as Record<string, unknown>)?.pending as PendingQuestion | null ?? null
  state.mapped_need_branch =
    ((ctx.attendance.need_flow_state_json as Record<string, unknown>)?.mapped_need_branch as
      | "A"
      | "B"
      | "C"
      | "D"
      | "E"
      | "truly_unique"
      | null
      | undefined) ?? null

  // Idempotent re-entry: pending question exists and client didn't submit an
  // answer (e.g. page refresh, React strict-mode remount). Re-emit what we
  // already rendered instead of demanding an answer.
  if (state.pending && !input.answer) {
    return {
      phase: "question",
      nodeId: state.pending.node_id,
      question: state.pending.question,
      options: state.pending.options,
      freeResponse: state.pending.free_response,
      state,
    }
  }

  // First emission: no pending, no answer → return entry.
  if (!state.pending && !input.answer) {
    const entry = entryNode(flow)
    const pending: PendingQuestion = {
      node_id: entry.node_id,
      question: entry.question || "",
      options: entry.options || null,
      free_response: entry.type === "free_response",
    }
    state.pending = pending
    await persistState(supabase, ctx, "need", state)
    return {
      phase: "question",
      nodeId: pending.node_id,
      question: pending.question,
      options: pending.options,
      freeResponse: pending.free_response,
      state,
    }
  }

  // Otherwise we must have a pending question + an answer.
  const pendingNodeId = input.currentNodeId || state.pending?.node_id || null
  if (!pendingNodeId) {
    // Nothing to apply; re-emit entry.
    return needAdvance(supabase, ctx, { currentNodeId: null, answer: null })
  }
  const pendingNode = getFlowNode(flow, pendingNodeId)
  if (!pendingNode) throw new Error(`Unknown need node: ${pendingNodeId}`)

  const answerText = (input.answer ?? "").toString().trim()
  if (!answerText) throw new Error("answer_required")

  const renderedQuestion = state.pending?.question || pendingNode.question || ""
  const renderedOptions =
    state.pending?.options ??
    ((pendingNode.options && pendingNode.options.length
      ? pendingNode.options
      : pendingNode.options_template) || null)

  // Use the actually-rendered options (including AI-generated labels) for both option-id
  // extraction and label resolution, otherwise `options_template` placeholders leak in.
  const nodeForMatch = { ...pendingNode, options: renderedOptions || undefined }
  const selectedOptionId = extractSelectedOptionId(nodeForMatch, answerText)
  const resolvedAnswerLabel = resolveAnswerLabel(nodeForMatch, answerText)

  const entry: StepEntry = {
    node_id: pendingNode.node_id,
    question: renderedQuestion,
    options: renderedOptions,
    answer: resolvedAnswerLabel,
  }
  state.node_path.push(entry)
  state.asked_count = state.node_path.length
  state.pending = null

  // Step cap: straight to summary.
  if (state.asked_count >= MAX_STEPS_CONST.need) {
    return await finalizeNeedSummary(supabase, ctx, state)
  }

  // Resolve next node from the flow graph (no per-node heuristics — AI_LOOP handles
  // gap-checking and termination from here).
  const nextId = resolveNextNodeId(flow, pendingNode.node_id, selectedOptionId) || "END"

  if (!nextId || nextId === "END" || nextId === "AFTER_SUMMARY" || nextId === "AFTER_CONFIRM") {
    return await finalizeNeedSummary(supabase, ctx, state)
  }

  const nextNode = getFlowNode(flow, nextId)
  if (!nextNode) return await finalizeNeedSummary(supabase, ctx, state)

  if (nextNode.type === "ai_generated_multiple_choice") {
    const ai = await generateNeedAiQuestion(ctx, state, nextNode)
    if (!ai || ai.skip) {
      if (ai?.mappedBranch) state.mapped_need_branch = ai.mappedBranch
      if (ai?.draftSummary) state.draft_summary = ai.draftSummary
      return await finalizeNeedSummary(supabase, ctx, state)
    }
    if (ai.mappedBranch) state.mapped_need_branch = ai.mappedBranch
    if (ai.draftSummary) state.draft_summary = ai.draftSummary
    const pending: PendingQuestion = {
      node_id: nextNode.node_id,
      question: ai.question,
      options: ai.choices,
      free_response: false,
    }
    state.pending = pending
    await persistState(supabase, ctx, "need", state)
    return {
      phase: "question",
      nodeId: pending.node_id,
      question: pending.question,
      options: pending.options,
      freeResponse: false,
      state,
    }
  }

  const pending: PendingQuestion = {
    node_id: nextNode.node_id,
    question: nextNode.question || "",
    options: nextNode.options || null,
    free_response: nextNode.type === "free_response",
  }
  state.pending = pending
  await persistState(supabase, ctx, "need", state)
  return {
    phase: "question",
    nodeId: pending.node_id,
    question: pending.question,
    options: pending.options,
    freeResponse: pending.free_response,
    state,
  }
}

interface AiQuestionResult {
  question: string
  choices: FlowOption[]
  draftSummary: string
  skip?: boolean
  mappedBranch?: "A" | "B" | "C" | "D" | "E" | "truly_unique"
}

const SPONSOR_COMPANY_CONTEXT_MAX = 1200

function inferNeedBranchFromMainGoal(state: ExtendedFlowState): NeedBranchCode {
  const first = state.node_path[0]
  const text = `${first?.answer || ""} ${first?.question || ""}`.toLowerCase()
  if (text.includes("learn")) return "B"
  if (text.includes("partnership")) return "C"
  if (text.includes("customer")) return "D"
  if (text.includes("represent")) return "E"
  if (text.includes("other")) return "F"
  return "A"
}

function normalizeMappedBranch(raw: unknown): "A" | "B" | "C" | "D" | "E" | "truly_unique" | null {
  if (!raw) return null
  const value = String(raw).trim().toLowerCase()
  if (["a", "b", "c", "d", "e"].includes(value)) return value.toUpperCase() as "A" | "B" | "C" | "D" | "E"
  if (value === "truly_unique") return "truly_unique"
  return null
}

function hasPriorNeedAiTurns(state: ExtendedFlowState): boolean {
  return state.node_path.some((entry) =>
    /(AI_|AI_LOOP|_TEXT$|_INDUSTRY_PICK$|_PROBLEM_TEXT$|O_Q2_CLARIFY_1$)/.test(entry.node_id),
  )
}

function inferStudentOverlay(ctx: OnboardingContext, transcript: string): boolean {
  const title = (ctx.user.career_title || "").toLowerCase()
  const combined = `${title} ${transcript.toLowerCase()}`
  return STUDENT_OVERLAY_HINTS.some((hint) => combined.includes(hint))
}

function collectNeedSignals(
  branch: NeedBranchCode,
  resolved: NeedDynamicInstructionContext["resolvedBranchCode"],
  transcript: string,
  studentOverlay: boolean,
): { covered: string[]; missing: string[] } {
  const t = transcript.toLowerCase()
  const covered: string[] = []
  const missing: string[] = []
  const has = (patterns: RegExp[]) => patterns.some((p) => p.test(t))

  if (resolved === "A") {
    if (has([/\bpeer\b/, /\bmentor\b/, /\bmentee\b/, /collabor/i, /opposite perspective/i, /casual/i])) covered.push("who_to_meet")
    else missing.push("who_to_meet")

    if (has([/\bwork\b/, /career/i, /\btool/i, /\bchallenge/i, /outside work/i, /\bhobby/i])) covered.push("talk_topics")
    else missing.push("talk_topics")

    if (has([/\bhobby\b/, /\bsport/i, /\bmusic\b/, /\btravel\b/, /\bbook\b/, /\bgaming\b/])) covered.push("shared_interest_hook")
    else missing.push("shared_interest_hook")

    const jobHint = has([/\bjob\b/, /\bintern/i, /\bwork opportunit/i, /\bcareer\b/])
    const jobSpecific = has([/\bproduct\b/, /\bengineer/i, /\bdesign\b/, /\bmarketing\b/, /\bsales\b/, /\bfinance\b/, /\boperations\b/, /\bdata\b/, /\blegal\b/, /\bmajor\b/, /\bfield of study\b/, /\bmba\b/])
    if (jobHint) {
      if (jobSpecific) covered.push("job_target_specificity")
      else missing.push("job_target_specificity")
    }
  }

  if (resolved === "B") {
    if (has([/\bsub-?topic\b/, /\bspecific\b/, /\bworkflow\b/, /\btool\b/, /\bindustry\b/, /\brole\b/])) covered.push("specific_subtopic")
    else missing.push("specific_subtopic")
    if (has([/\bdecision\b/, /\bproblem\b/, /\bevaluat/i, /\bcuriosity\b/, /\bright now\b/, /\burgent\b/])) covered.push("why_now")
    else missing.push("why_now")
    if (has([/\bpractitioner\b/, /\bexpert\b/, /\bresearcher\b/, /\bpeer\b/, /\bvendor\b/])) covered.push("teacher_profile")
    else missing.push("teacher_profile")
  }

  if (resolved === "C") {
    if (has([/sales\/integration/i, /\bintegration\b/, /\bsponsor/i, /\binvestor/i, /cross-sector/i])) covered.push("partnership_subtype")
    else missing.push("partnership_subtype")
    if (has([/\bindustry\b/, /\bstage\b/, /\bsize\b/, /\baudience\b/, /\bcheck size\b/, /\bsector\b/, /\bgeography\b/, /\bthesis\b/, /\bcause area\b/])) covered.push("partner_profile_target")
    else missing.push("partner_profile_target")
    if (studentOverlay) covered.push("student_overlay_applied")
  }

  if (resolved === "D") {
    if (has([/\bindustry\b/, /\bbuyer\b/, /\brole\b/, /\bcompany size\b/])) covered.push("ideal_customer")
    else missing.push("ideal_customer")
    if (has([/\bactively evaluating\b/, /\bexploring\b/, /\breplacing\b/, /\bproblem-aware\b/])) covered.push("buying_situation")
    else missing.push("buying_situation")
  }

  if (resolved === "E") {
    if (has([/\brecruit\b/, /\bsell\b/, /\bpartner\b/, /\blearn\b/, /\bpresence\b/, /\bsupport clients\b/])) covered.push("org_goal_today")
    else missing.push("org_goal_today")
    if (has([/\bpeers?\b/, /\bbuyers?\b/, /\bsuppliers?\b/, /\bregulators?\b/, /\btalent\b/, /\bpress\b/, /\binvestors?\b/])) covered.push("target_people")
    else missing.push("target_people")
    if (has([/\btopic\b/, /\bconversation\b/, /\blead\b/])) covered.push("org_topic_hook")
    else missing.push("org_topic_hook")
  }

  if (branch === "F" && resolved === "truly_unique") {
    if (has([/\bwho\b/, /\bhelp\b/, /\bconnect\b/, /\bmeet\b/])) covered.push("who_would_help")
    else missing.push("who_would_help")
  }

  return { covered, missing }
}

function buildNeedInstructionContext(
  ctx: OnboardingContext,
  state: ExtendedFlowState,
  transcript: string,
): NeedDynamicInstructionContext {
  const branchCode = inferNeedBranchFromMainGoal(state)
  const mapped = normalizeMappedBranch(state.mapped_need_branch)
  const resolvedBranchCode =
    branchCode === "F" && mapped ? mapped : branchCode
  const studentOverlay = inferStudentOverlay(ctx, transcript)
  const signals = collectNeedSignals(branchCode, resolvedBranchCode, transcript, studentOverlay)
  return {
    branchCode,
    branchLabel: NEED_BRANCH_LABELS[branchCode],
    resolvedBranchCode,
    firstAiTurnInBranch: !hasPriorNeedAiTurns(state),
    studentOverlay,
    companyKnown: Boolean((ctx.user.company_name || "").trim()),
    companySummaryKnown: Boolean((ctx.user.company_summary || "").trim()),
    mappedBranch: mapped,
    coveredSignals: signals.covered,
    missingSignals: signals.missing,
  }
}

function pickNeedAiMode(node: FlowNode): string {
  if (node.ai_mode) return node.ai_mode
  if (Array.isArray(node.ai_inputs) && node.ai_inputs.includes("event_attendee_industries_distribution")) {
    return "event_topics_for_learning"
  }
  return "clarify_last_answer"
}

function buildEventContextBlock(ctx: OnboardingContext): string {
  const eventName = (ctx.event.event_name || "").trim()
  const schema = ctx.event.onboarding_question_schema
  const schemaText = schema ? JSON.stringify(schema).slice(0, 1400) : ""
  const parts = [`Event name: ${eventName || "(unknown)"}`]
  if (schemaText) parts.push(`Event onboarding schema: ${schemaText}`)
  return parts.join("\n")
}

function normalizeAiChoices(rawChoices: string[] | null | undefined, maxChoices: number): FlowOption[] {
  const letters = ["A", "B", "C", "D", "E", "F", "G"]
  if (!rawChoices || rawChoices.length === 0) return []
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const value of rawChoices) {
    const label = String(value || "").trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(label)
  }

  const nonOther = cleaned.filter((label) => label.toLowerCase() !== "other")
  const hasOther = cleaned.some((label) => label.toLowerCase() === "other")
  const capped = nonOther.slice(0, Math.max(1, maxChoices - 1))
  const finalLabels = hasOther ? [...capped, "Other"] : [...capped, "Other"]

  return finalLabels
    .slice(0, maxChoices)
    .map((label, idx) => ({ id: letters[idx] || String(idx + 1), label }))
}

function splitOfferSelections(answer: string): string[] {
  return String(answer || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Server-side call to the same edge function as profile onboarding (HTML scrape + description). */
async function fetchCompanyWebsiteEnrichment(url: string): Promise<{
  company_name?: string
  company_description?: string
} | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key || !url.trim()) return null
  const controller = new AbortController()
  const kill = setTimeout(() => controller.abort(), 14_000)
  try {
    const res = await fetch(`${base}/functions/v1/company-enrich`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ url: url.trim() }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    const company_name = typeof j.company_name === "string" ? j.company_name : undefined
    const company_description =
      (typeof j.company_description === "string" && j.company_description) ||
      (typeof j.description === "string" && j.description) ||
      (typeof j.summary === "string" && j.summary) ||
      undefined
    return { company_name, company_description }
  } catch {
    return null
  } finally {
    clearTimeout(kill)
  }
}

function buildSponsorCompanyWebsiteContextBlock(
  ctx: OnboardingContext,
  liveScrape: { company_name?: string; company_description?: string } | null,
): string {
  const name =
    (ctx.user.company_name || "").trim() || (liveScrape?.company_name || "").trim()
  const url = (ctx.user.company_url || "").trim()
  const fromDb = (ctx.user.company_summary || "").trim()
  const fromScrape = (liveScrape?.company_description || "").trim()

  const parts: string[] = []
  if (name) parts.push(`Company name: ${name}`)
  if (url) parts.push(`Company website: ${url}`)
  if (fromDb) {
    parts.push(
      `Company description (from profile / earlier site enrichment):\n${fromDb.slice(0, SPONSOR_COMPANY_CONTEXT_MAX)}${fromDb.length > SPONSOR_COMPANY_CONTEXT_MAX ? "…" : ""}`,
    )
  }
  if (fromScrape) {
    parts.push(
      `Live website scrape (fetched for this question — meta + page signals; use to infer what they sell):\n${fromScrape.slice(0, SPONSOR_COMPANY_CONTEXT_MAX)}${fromScrape.length > SPONSOR_COMPANY_CONTEXT_MAX ? "…" : ""}`,
    )
  }
  if (parts.length === 0) {
    return "(No company URL or descriptions available — infer only from transcript and job title.)"
  }
  return parts.join("\n\n")
}

async function generateNeedAiQuestion(
  ctx: OnboardingContext,
  state: ExtendedFlowState,
  node: FlowNode,
): Promise<AiQuestionResult | null> {
  if (!isAiEnabled()) return null
  const mode = pickNeedAiMode(node)
  const personBlock = formatPersonContextBlock(personContext(ctx))
  const profileBlock = formatOnboardingProfileBlock(ctx.user)
  const transcript = buildTranscriptBlock(state)
  const branchContext = buildNeedInstructionContext(ctx, state, transcript)
  const system = getAiMultipleChoiceInstructions(mode, branchContext)
  const topics = extractQuestionTopicsFromHistory(transcript)
  const eventContext = buildEventContextBlock(ctx)

  let liveScrape: { company_name?: string; company_description?: string } | null = null
  if (mode === "sponsor_roi_type") {
    const url = (ctx.user.company_url || "").trim()
    const summaryLen = (ctx.user.company_summary || "").trim().length
    const urlLooksLikeSite = Boolean(url && /[.]/.test(url))
    if (urlLooksLikeSite && summaryLen < 120) {
      liveScrape = await fetchCompanyWebsiteEnrichment(url)
    }
  }

  const sponsorCompanyBlock =
    mode === "sponsor_roi_type" ? buildSponsorCompanyWebsiteContextBlock(ctx, liveScrape) : ""

  const userPayload =
    `PERSON CONTEXT:\n${personBlock}\n\n` +
    (profileBlock ? `PROFILE SNIPPETS:\n${profileBlock}\n\n` : "") +
    (sponsorCompanyBlock
      ? `COMPANY_WEBSITE_CONTEXT (infer what they sell, sector, and service - ground industry / ICP / buyer questions here; do not contradict explicit questionnaire answers):\n${sponsorCompanyBlock}\n\n`
      : "") +
    `FULL QUESTIONNAIRE TRANSCRIPT:\n${transcript || "(none)"}\n\n` +
    `Topics already covered: ${topics || "(none)"}\n` +
    `questions_asked: ${state.asked_count}\n` +
    `EVENT CONTEXT:\n${eventContext}\n\n` +
    `Return JSON per the format rules.`

  const json = await callAiJson<{
    draft_summary?: string
    question?: string | null
    choices?: string[] | null
    mapped_branch?: string | null
  }>({
    system,
    user: userPayload,
    maxTokens: 700,
    temperature: 0.3,
  })
  if (!json) return null

  const draftSummary = typeof json.draft_summary === "string" ? json.draft_summary.trim() : ""
  const skip = !json.question || !Array.isArray(json.choices) || json.choices.length === 0
  const mappedBranch = normalizeMappedBranch(json.mapped_branch)

  if (skip) {
    return {
      question: "",
      choices: [],
      draftSummary,
      skip: true,
      mappedBranch: mappedBranch || undefined,
    }
  }

  const choices = normalizeAiChoices(json.choices as string[], 6)
  if (choices.length < 2) {
    return {
      question: "",
      choices: [],
      draftSummary,
      skip: true,
      mappedBranch: mappedBranch || undefined,
    }
  }

  return {
    question: String(json.question).trim(),
    choices,
    draftSummary,
    mappedBranch: mappedBranch || undefined,
  }
}
async function finalizeNeedSummary(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  state: ExtendedFlowState,
): Promise<AdvanceResult> {
  const draft = state.draft_summary || (await generateNeedFinalSummary(ctx, state))
  state.draft_summary = draft
  state.pending = null
  await persistState(supabase, ctx, "need", state)
  return { phase: "confirm", draftSummary: draft, state }
}

async function generateNeedFinalSummary(
  ctx: OnboardingContext,
  state: ExtendedFlowState,
): Promise<string> {
  if (!isAiEnabled()) return fallbackNeedSummary(state)
  const personBlock = formatPersonContextBlock(personContext(ctx))
  const profileBlock = formatOnboardingProfileBlock(ctx.user)
  const transcript = buildTranscriptBlock(state)
  const history = buildShortHistory(state)
  const system =
    "You write what a person is looking for at a networking event.\n" +
    "Use the full transcript to produce one clear summary that reflects their actual path and details.\n" +
    "Include concrete intent signals: who they want to meet, what they want to discuss, and any specific target context (role/domain/partner/customer profile) when present.\n" +
    "Do not over-genericize. Preserve useful specifics from user answers.\n" +
    "If PROFILE SNIPPETS appear, use them only to clarify phrasing when transcript detail is thin; never contradict explicit answers.\n" +
    "Use only stated facts; do not invent goals.\n" +
    'Start with "Looking for..." or "Needs help with...".\n' +
    "Usually one sentence, max two short sentences. Return only summary text."
  const user =
    `PERSON CONTEXT:\n${personBlock}\n\n` +
    (profileBlock ? `PROFILE SNIPPETS:\n${profileBlock}\n\n` : "") +
    `FULL QUESTIONNAIRE TRANSCRIPT:\n${transcript || "(none)"}\n\n` +
    `Short history:\n${history || "(none)"}\n\n` +
    `Return the summary only.`
  const text = await callAiText({ system, user, maxTokens: 220, temperature: 0.3 })
  return text || fallbackNeedSummary(state)
}

function fallbackNeedSummary(state: ExtendedFlowState): string {
  const answers = state.node_path
    .map((e) => e.answer?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("; ")
  return `Looking for help with: ${answers || "meaningful conversations at the event"}.`
}

export async function needRewrite(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  correction: string,
): Promise<string> {
  const state = coerceState(ctx.attendance.need_flow_state_json) as ExtendedFlowState
  state.mapped_need_branch =
    ((ctx.attendance.need_flow_state_json as Record<string, unknown>)?.mapped_need_branch as
      | "A"
      | "B"
      | "C"
      | "D"
      | "E"
      | "truly_unique"
      | null
      | undefined) ?? null
  if (!isAiEnabled()) {
    state.draft_summary = correction.trim() || state.draft_summary
    await persistState(supabase, ctx, "need", state)
    return state.draft_summary
  }
  const personBlock = formatPersonContextBlock(personContext(ctx))
  const profileBlock = formatOnboardingProfileBlock(ctx.user)
  const transcript = buildTranscriptBlock(state)
  const history = buildShortHistory(state)
  const payload = buildRewriteNeedSummaryUserPayload(
    state.draft_summary || "",
    history,
    correction,
    personBlock,
    transcript,
    profileBlock,
  )
  const revised = await callAiText({
    system: REWRITE_NEED_SUMMARY_INSTRUCTIONS,
    user: payload,
    maxTokens: 180,
    temperature: 0.3,
  })
  state.draft_summary = (revised || state.draft_summary || correction).trim()
  await persistState(supabase, ctx, "need", state)
  return state.draft_summary
}

export async function needBack(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
): Promise<AdvanceResult> {
  const state = coerceState(ctx.attendance.need_flow_state_json) as ExtendedFlowState
  state.pending = (ctx.attendance.need_flow_state_json as Record<string, unknown>)?.pending as PendingQuestion | null ?? null
  state.mapped_need_branch =
    ((ctx.attendance.need_flow_state_json as Record<string, unknown>)?.mapped_need_branch as
      | "A"
      | "B"
      | "C"
      | "D"
      | "E"
      | "truly_unique"
      | null
      | undefined) ?? null

  // Nothing to step back to – just re-emit the entry node.
  if (state.node_path.length === 0) {
    state.pending = null
    state.draft_summary = ""
    state.is_confirmed = false
    return needAdvance(supabase, ctx, { currentNodeId: null, answer: null })
  }

  const lastEntry = state.node_path.pop()!
  state.asked_count = state.node_path.length
  // Going backwards invalidates any draft summary / confirmation that was tied
  // to the popped answer. The frontend should re-confirm after re-answering.
  state.draft_summary = ""
  state.is_confirmed = false

  const isFreeResponse = !lastEntry.options || lastEntry.options.length === 0
  const pending: PendingQuestion = {
    node_id: lastEntry.node_id,
    question: lastEntry.question,
    options: lastEntry.options,
    free_response: isFreeResponse,
  }
  state.pending = pending

  await persistState(supabase, ctx, "need", state)
  return {
    phase: "question",
    nodeId: pending.node_id,
    question: pending.question,
    options: pending.options,
    freeResponse: pending.free_response,
    state,
  }
}

export async function needConfirm(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
): Promise<string> {
  const state = coerceState(ctx.attendance.need_flow_state_json) as ExtendedFlowState
  state.mapped_need_branch =
    ((ctx.attendance.need_flow_state_json as Record<string, unknown>)?.mapped_need_branch as
      | "A"
      | "B"
      | "C"
      | "D"
      | "E"
      | "truly_unique"
      | null
      | undefined) ?? null
  state.is_confirmed = true
  state.pending = null
  const finalSummary = state.draft_summary || fallbackNeedSummary(state)
  state.draft_summary = finalSummary
  const { error } = await supabase
    .from("attendance")
    .update({
      need_flow_state_json: flowStateToJson(state as FlowState),
      need_summary_final: finalSummary,
      flow_onboarding_version: 2,
    })
    .eq("event_id", ctx.attendance.event_id)
    .eq("user_id", ctx.attendance.user_id)
  if (error) throw new Error(error.message)
  return finalSummary
}

// ---- Offer flow ----

export async function offerAdvance(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  input: AdvanceInput,
): Promise<AdvanceResult> {
  const flow = flowForKind("offer")
  const state = coerceState(ctx.attendance.offer_flow_state_json) as ExtendedFlowState
  state.pending = (ctx.attendance.offer_flow_state_json as Record<string, unknown>)?.pending as PendingQuestion | null ?? null

  // Idempotent re-entry: pending question exists and client didn't submit an
  // answer (e.g. page refresh, React strict-mode remount). Re-emit what we
  // already rendered instead of demanding an answer.
  if (state.pending && !input.answer) {
    return {
      phase: "question",
      nodeId: state.pending.node_id,
      question: state.pending.question,
      options: state.pending.options,
      freeResponse: state.pending.free_response,
      state,
    }
  }

  if (!state.pending && !input.answer) {
    const entry = entryNode(flow)
    const ai = await generateOfferIntro(ctx)
    const question = ai?.question || entry.question || ""
    const choices = ai?.choices?.length ? ai.choices : entry.options || []
    const pending: PendingQuestion = {
      node_id: entry.node_id,
      question,
      options: choices,
      free_response: false,
    }
    state.pending = pending
    await persistState(supabase, ctx, "offer", state)
    return {
      phase: "question",
      nodeId: pending.node_id,
      question: pending.question,
      options: pending.options,
      freeResponse: false,
      state,
    }
  }

  const pendingNodeId = input.currentNodeId || state.pending?.node_id || null
  if (!pendingNodeId) return offerAdvance(supabase, ctx, { currentNodeId: null, answer: null })
  const pendingNode = getFlowNode(flow, pendingNodeId)
  if (!pendingNode) throw new Error(`Unknown offer node: ${pendingNodeId}`)

  const answerText = (input.answer ?? "").toString().trim()
  if (!answerText) throw new Error("answer_required")

  const renderedQuestion = state.pending?.question || pendingNode.question || ""
  const renderedOptions =
    state.pending?.options ??
    ((pendingNode.options && pendingNode.options.length
      ? pendingNode.options
      : pendingNode.options_template) || null)

  const resolvedAnswerLabel = resolveAnswerLabel(
    { ...pendingNode, options: renderedOptions || undefined },
    answerText,
  )

  const entry: StepEntry = {
    node_id: pendingNode.node_id,
    question: renderedQuestion,
    options: renderedOptions,
    answer: resolvedAnswerLabel,
  }
  state.node_path.push(entry)
  state.asked_count = state.node_path.length
  state.pending = null

  if (pendingNode.node_id === "OFFER_Q1") {
    const ai = await generateOfferValidation(ctx, state)
    const q2 = getFlowNode(flow, "OFFER_Q2")!
    const question = ai?.question || q2.question || ""
    const choices = ai?.choices?.length ? ai.choices : q2.options || []
    const pending: PendingQuestion = {
      node_id: q2.node_id,
      question,
      options: choices,
      free_response: false,
    }
    state.pending = pending
    await persistState(supabase, ctx, "offer", state)
    return {
      phase: "question",
      nodeId: pending.node_id,
      question: pending.question,
      options: pending.options,
      freeResponse: false,
      state,
    }
  }

  // After Q2 (or anything beyond): finalize.
  return await finalizeOfferSummary(supabase, ctx, state)
}

async function generateOfferIntro(
  ctx: OnboardingContext,
): Promise<{ question: string; choices: FlowOption[] } | null> {
  if (!isAiEnabled()) return null
  const needCore = ctx.attendance.need_summary_final || ctx.user.want_summary_text || ""
  const system = buildOfferIntroInstructions({
    jobTitle: ctx.user.career_title || "",
    company: ctx.user.company_name || "",
    companyDescription: ctx.user.company_summary || "",
    yearsInRole: ctx.user.career_years_experience,
    needCore,
    needTags: [],
  })
  const json = await callAiJson<{ question?: string; choices?: string[] }>({
    system,
    user: "Generate the Q1 offer question and 5 options per the rules.",
    maxTokens: 500,
    temperature: 0.3,
  })
  if (!json || !json.question || !Array.isArray(json.choices)) return null
  const choices = normalizeAiChoices(json.choices, 5)
  if (choices.length < 2) return null
  return { question: String(json.question).trim(), choices }
}

async function generateOfferValidation(
  ctx: OnboardingContext,
  state: ExtendedFlowState,
): Promise<{ question: string; choices: FlowOption[] } | null> {
  if (!isAiEnabled()) return null
  const last = state.node_path[state.node_path.length - 1]
  if (!last) return null
  const selections = splitOfferSelections(last.answer || "")
  const primarySelection = selections.find((value) => !/^other\b/i.test(value)) || selections[0] || last.answer || ""
  const system = buildOfferValidationInstructions({
    selectedOffer: primarySelection,
    lastQ: last.question || "",
    lastA: selections.join("; ") || last.answer || "",
    jobTitle: ctx.user.career_title || "",
    company: ctx.user.company_name || "",
    companyDescription: ctx.user.company_summary || "",
  })
  const json = await callAiJson<{ question?: string; choices?: string[] }>({
    system,
    user: "Generate the Q2 validation question and 4 options per the rules. If multiple options were selected, focus on the strongest non-Other selection first.",
    maxTokens: 500,
    temperature: 0.3,
  })
  if (!json || !json.question || !Array.isArray(json.choices)) return null
  const choices = normalizeAiChoices(json.choices, 5)
  if (choices.length < 2) return null
  return { question: String(json.question).trim(), choices }
}

async function finalizeOfferSummary(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  state: ExtendedFlowState,
): Promise<AdvanceResult> {
  const draft = await generateOfferDraftSummary(ctx, state)
  state.draft_summary = draft
  state.pending = null
  await persistState(supabase, ctx, "offer", state)
  return { phase: "confirm", draftSummary: draft, state }
}

async function generateOfferDraftSummary(
  ctx: OnboardingContext,
  state: ExtendedFlowState,
): Promise<string> {
  const q1 = state.node_path[0]
  const q2 = state.node_path[1]
  if (!isAiEnabled()) return fallbackOfferSummary(state)
  const system = buildOfferSummaryInstructions({
    name: [ctx.user.first_name, ctx.user.last_name].filter(Boolean).join(" "),
    company: ctx.user.company_name || "",
    companyDescription: ctx.user.company_summary || "",
    jobTitle: ctx.user.career_title || "",
    yearsInRole: ctx.user.career_years_experience,
    expertiseSummary: ctx.user.expertise_summary || "",
    needCore: ctx.attendance.need_summary_final || ctx.user.want_summary_text || "",
    offerQ1: q1?.question || "",
    offerA1: q1?.answer || "",
    offerQ2: q2?.question || "",
    offerA2: q2?.answer || "",
  })
  const json = await callAiJson<{ offer_core_AI?: string }>({
    system,
    user: "Generate the offer summary per rules.",
    maxTokens: 400,
    temperature: 0.4,
  })
  const core = json?.offer_core_AI?.trim()
  return core || fallbackOfferSummary(state)
}

function fallbackOfferSummary(state: ExtendedFlowState): string {
  const parts = state.node_path.map((e) => e.answer?.trim()).filter(Boolean)
  if (!parts.length) return "Can help with insights from their role and experience."
  return `Can help with ${parts.join("; ")}.`
}

export async function offerRewrite(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  correction: string,
): Promise<string> {
  const state = coerceState(ctx.attendance.offer_flow_state_json) as ExtendedFlowState
  if (!isAiEnabled()) {
    state.draft_summary = correction.trim() || state.draft_summary
    await persistState(supabase, ctx, "offer", state)
    return state.draft_summary
  }
  const personBlock = formatPersonContextBlock(personContext(ctx))
  const profileBlock = formatOnboardingProfileBlock(ctx.user)
  const offerQa = state.node_path
    .map((e, i) => `Q${i + 1}: ${e.question}\nA${i + 1}: ${e.answer}`)
    .join("\n\n")
  const needCore = ctx.attendance.need_summary_final || ctx.user.want_summary_text || ""
  const payload = buildRewriteOfferSummaryUserPayload(
    state.draft_summary || "",
    offerQa,
    needCore,
    correction,
    personBlock,
    profileBlock,
  )
  const revised = await callAiText({
    system: REWRITE_OFFER_SUMMARY_INSTRUCTIONS,
    user: payload,
    maxTokens: 220,
    temperature: 0.3,
  })
  state.draft_summary = (revised || state.draft_summary || correction).trim()
  await persistState(supabase, ctx, "offer", state)
  return state.draft_summary
}

export async function offerBack(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
): Promise<AdvanceResult> {
  const state = coerceState(ctx.attendance.offer_flow_state_json) as ExtendedFlowState
  state.pending = (ctx.attendance.offer_flow_state_json as Record<string, unknown>)?.pending as PendingQuestion | null ?? null

  if (state.node_path.length === 0) {
    state.pending = null
    state.draft_summary = ""
    state.is_confirmed = false
    return offerAdvance(supabase, ctx, { currentNodeId: null, answer: null })
  }

  const lastEntry = state.node_path.pop()!
  state.asked_count = state.node_path.length
  state.draft_summary = ""
  state.is_confirmed = false

  const isFreeResponse = !lastEntry.options || lastEntry.options.length === 0
  const pending: PendingQuestion = {
    node_id: lastEntry.node_id,
    question: lastEntry.question,
    options: lastEntry.options,
    free_response: isFreeResponse,
  }
  state.pending = pending

  await persistState(supabase, ctx, "offer", state)
  return {
    phase: "question",
    nodeId: pending.node_id,
    question: pending.question,
    options: pending.options,
    freeResponse: pending.free_response,
    state,
  }
}

export async function offerConfirm(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
): Promise<{ offerFinal: string; wroteUserBaseline: boolean }> {
  const state = coerceState(ctx.attendance.offer_flow_state_json) as ExtendedFlowState
  state.is_confirmed = true
  state.pending = null
  const finalSummary = state.draft_summary || fallbackOfferSummary(state)
  state.draft_summary = finalSummary

  const { error } = await supabase
    .from("attendance")
    .update({
      offer_flow_state_json: flowStateToJson(state as FlowState),
      offer_summary_final: finalSummary,
      flow_onboarding_version: 2,
      onboarding_completed: true,
    })
    .eq("event_id", ctx.attendance.event_id)
    .eq("user_id", ctx.attendance.user_id)
  if (error) throw new Error(error.message)

  let wroteUserBaseline = false
  if (!ctx.user.offer_summary_text || ctx.user.offer_summary_text.trim().length === 0) {
    const { error: userErr } = await supabase
      .from("users")
      .update({ offer_summary_text: finalSummary })
      .eq("user_id", ctx.user.user_id)
    if (!userErr) wroteUserBaseline = true
  }

  return { offerFinal: finalSummary, wroteUserBaseline }
}

// ---- Shared helpers ----

async function persistState(
  supabase: SupabaseClient<Database>,
  ctx: OnboardingContext,
  kind: FlowKind,
  state: ExtendedFlowState,
): Promise<void> {
  const payload =
    kind === "need"
      ? { need_flow_state_json: flowStateToJson(state as FlowState) }
      : { offer_flow_state_json: flowStateToJson(state as FlowState) }
  const { error } = await supabase
    .from("attendance")
    .update(payload)
    .eq("event_id", ctx.attendance.event_id)
    .eq("user_id", ctx.attendance.user_id)
  if (error) throw new Error(error.message)
}

function personContext(ctx: OnboardingContext) {
  return {
    name: [ctx.user.first_name, ctx.user.last_name].filter(Boolean).join(" ") || null,
    company: ctx.user.company_name,
    jobTitle: ctx.user.career_title,
    role: null,
  }
}

export { loadOnboardingContext }


