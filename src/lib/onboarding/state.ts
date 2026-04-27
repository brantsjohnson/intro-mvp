import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/database.types"
import {
  FlowDefinition,
  FlowNode,
  FlowOption,
  FlowState,
  NEED_FLOW,
  NEED_MAX_STEPS,
  OFFER_FLOW,
  OFFER_MAX_STEPS,
  StepEntry,
  getFlowNode,
  normalizeChoiceId,
  resolveNextNodeId,
} from "./flows"

// ---- Supabase service-role client (server-only) ----

export function getServiceSupabase(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient<Database>(url, key)
}

// ---- Common types ----

export type FlowKind = "need" | "offer"

export interface OnboardingUserRow {
  user_id: string
  first_name: string | null
  last_name: string | null
  career_title: string | null
  career_years_experience: number | null
  company_name: string | null
  company_url: string | null
  company_summary: string | null
  expertise_summary: string | null
  offer_summary_text: string | null
  want_summary_text: string | null
}

export interface OnboardingAttendanceRow {
  event_id: string
  user_id: string
  need_flow_state_json: Json | null
  need_summary_final: string | null
  offer_flow_state_json: Json | null
  offer_summary_final: string | null
  flow_onboarding_version: number | null
  onboarding_completed: boolean | null
}

export interface OnboardingEventRow {
  event_id: string
  event_name: string | null
}

export interface OnboardingContext {
  user: OnboardingUserRow
  attendance: OnboardingAttendanceRow
  event: OnboardingEventRow
}

export async function loadOnboardingContext(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string,
): Promise<{ ctx: OnboardingContext | null; error?: string }> {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select(
      "user_id, first_name, last_name, career_title, career_years_experience, company_name, company_url, company_summary, expertise_summary, offer_summary_text, want_summary_text",
    )
    .eq("user_id", userId)
    .maybeSingle()
  if (userError) return { ctx: null, error: userError.message }
  if (!user) return { ctx: null, error: "user_not_found" }

  let { data: attendance, error: attendanceError } = await supabase
    .from("attendance")
    .select(
      "event_id, user_id, need_flow_state_json, need_summary_final, offer_flow_state_json, offer_summary_final, flow_onboarding_version, onboarding_completed",
    )
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle()
  if (attendanceError) return { ctx: null, error: attendanceError.message }
  if (!attendance) {
    // Bootstrap the attendance row so the onboarding flow can start directly from a ?eventId= URL.
    const { data: inserted, error: insertError } = await supabase
      .from("attendance")
      .upsert(
        { event_id: eventId, user_id: userId, checked_in_at: new Date().toISOString() },
        { onConflict: "event_id,user_id" },
      )
      .select(
        "event_id, user_id, need_flow_state_json, need_summary_final, offer_flow_state_json, offer_summary_final, flow_onboarding_version, onboarding_completed",
      )
      .maybeSingle()
    if (insertError || !inserted) {
      return { ctx: null, error: insertError?.message || "attendance_bootstrap_failed" }
    }
    attendance = inserted
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("event_id, event_name")
    .eq("event_id", eventId)
    .maybeSingle()
  if (eventError) return { ctx: null, error: eventError.message }
  if (!event) return { ctx: null, error: "event_not_found" }

  return {
    ctx: {
      user: user as OnboardingUserRow,
      attendance: attendance as OnboardingAttendanceRow,
      event: event as OnboardingEventRow,
    },
  }
}

// ---- Flow state helpers ----

export function emptyState(): FlowState {
  return {
    version: "v2",
    node_path: [],
    draft_summary: "",
    is_confirmed: false,
    asked_count: 0,
  }
}

export function coerceState(raw: Json | null | undefined): FlowState {
  const base = emptyState()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>
  const nodePath = Array.isArray(obj.node_path) ? (obj.node_path as StepEntry[]) : []
  return {
    version: "v2",
    node_path: nodePath.map((entry) => ({
      node_id: String(entry?.node_id || ""),
      question: String(entry?.question || ""),
      options: Array.isArray(entry?.options) ? (entry.options as FlowOption[]) : null,
      answer: String(entry?.answer || ""),
    })),
    draft_summary: typeof obj.draft_summary === "string" ? obj.draft_summary : "",
    is_confirmed: obj.is_confirmed === true,
    asked_count: typeof obj.asked_count === "number" ? obj.asked_count : nodePath.length,
  }
}

export function flowStateToJson(state: FlowState): Json {
  return state as unknown as Json
}

export function flowForKind(kind: FlowKind): FlowDefinition {
  return kind === "need" ? NEED_FLOW : OFFER_FLOW
}

export function maxStepsFor(kind: FlowKind): number {
  return kind === "need" ? NEED_MAX_STEPS : OFFER_MAX_STEPS
}

export function entryNode(flow: FlowDefinition): FlowNode {
  return flow.entry
}

// Build a transcript block mirroring the GAS buildQuestionnaireTranscript_() output.
export function buildTranscriptBlock(state: FlowState): string {
  if (!state.node_path.length) return ""
  return state.node_path
    .map((entry, i) => {
      const stem = entry.question || ""
      const options = entry.options && entry.options.length
        ? "\n" + entry.options.map((o) => `${o.id}) ${o.label}`).join("\n")
        : ""
      return `Q${i + 1}: ${stem}${options}\nA${i + 1}: ${entry.answer || ""}`
    })
    .join("\n\n")
}

// Short history string for prompts (matches GAS short history pattern).
export function buildShortHistory(state: FlowState): string {
  return state.node_path
    .map((e, i) => `Q${i + 1}: ${e.question}\nA${i + 1}: ${e.answer}`)
    .join("\n")
}

// Resolve a label back to a full option label when the user answered with just a letter.
export function resolveAnswerLabel(node: FlowNode | null, answer: string): string {
  if (!node || !answer) return answer
  const letter = normalizeChoiceId(answer)
  if (!letter) return answer
  const opts = (node.options && node.options.length
    ? node.options
    : node.options_template) as FlowOption[] | undefined
  if (!opts) return answer
  const match = opts.find((o) => o.id === letter)
  if (!match) return answer
  // If answer is just a letter (no extra text) return the full label.
  const trimmed = answer.trim()
  if (trimmed.length <= 2) return match.label
  // Otherwise user already provided text — keep it.
  return answer
}

export { resolveNextNodeId, getFlowNode, normalizeChoiceId }

// Convenience: extract selected option id from a free-form answer using the current node's options.
// Handles:
//  - "A", "A.", "A - blah" → "A"
//  - exact label match (case-insensitive)
//  - "Other: ..." free-text responses → maps to the option whose label is "Other"
export function extractSelectedOptionId(node: FlowNode | null, answer: string): string | null {
  if (!node || !answer) return null
  const opts = (node.options && node.options.length
    ? node.options
    : node.options_template) as FlowOption[] | undefined

  const trimmed = answer.trim()
  const lower = trimmed.toLowerCase()

  if (opts) {
    const exact = opts.find((o) => o.label.toLowerCase() === lower)
    if (exact) return exact.id
    if (lower.startsWith("other") && /^other[\s:,-]/.test(lower)) {
      const otherOpt = opts.find((o) => o.label.trim().toLowerCase() === "other")
      if (otherOpt) return otherOpt.id
    }
  }

  // Letter prefix ("A", "A.", "A: blah")
  const letter = normalizeChoiceId(answer)
  if (letter && opts?.find((o) => o.id === letter)) return letter
  return letter
}

export const MAX_STEPS_CONST = {
  need: NEED_MAX_STEPS,
  offer: OFFER_MAX_STEPS,
} as const
