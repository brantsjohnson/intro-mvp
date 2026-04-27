/**
 * Scripted version of the `/api/onboarding/{need,offer}/{advance,confirm,rewrite}` flow.
 *
 * Response shapes match `ApiAdvanceResponse` / `ApiRewriteResponse` used by
 * `event-branching-onboarding.tsx` exactly, so the component can swap its
 * network transport for this script with no UI changes.
 *
 * Design goals:
 *  - Option-based questions only (no `freeResponse`) so the demo never
 *    requires keyboard input.
 *  - Pre-picked "canonical" answer for each step (first option) so the demo
 *    can visually highlight the intended path if desired.
 *  - Two pre-authored `draftSummary` variants (initial + tweak) per phase so
 *    the "Not quite - let me tweak it" path still works without AI.
 */

export interface DemoOption {
  id: string
  label: string
}

export interface DemoQuestionStep {
  kind: "question"
  nodeId: string
  question: string
  options: DemoOption[]
  /** The canonical, "AI-suggested" answer - used as the pre-filled selection. */
  suggestedAnswerId: string
}

export interface DemoConfirmStep {
  kind: "confirm"
  nodeId: string
  draftSummary: string
  /** Second summary variant shown after the user clicks "tweak". */
  rewrittenSummary: string
}

export type DemoScriptStep = DemoQuestionStep | DemoConfirmStep

export interface DemoScript {
  steps: DemoScriptStep[]
}

export const NEED_DEMO_SCRIPT: DemoScript = {
  steps: [
    {
      kind: "question",
      nodeId: "need_goal",
      question:
        "What's the single most useful thing you'd like to walk away with from Founders & Funders Summit?",
      options: [
        { id: "investors", label: "Warm intros to seed-stage investors" },
        { id: "customers", label: "Early enterprise customers" },
        { id: "cofounder", label: "Technical co-founder signals" },
        { id: "press", label: "Press and storytelling help" },
      ],
      suggestedAnswerId: "investors",
    },
    {
      kind: "question",
      nodeId: "need_stage",
      question: "What stage are you raising at?",
      options: [
        { id: "seed", label: "Seed - closing in the next 60 days" },
        { id: "pre_seed", label: "Pre-seed / still pre-revenue" },
        { id: "series_a", label: "Series A" },
        { id: "not_raising", label: "Not raising yet - exploring" },
      ],
      suggestedAnswerId: "seed",
    },
    {
      kind: "question",
      nodeId: "need_sector",
      question: "Which investor focus fits you best?",
      options: [
        { id: "ai_infra", label: "AI and infra" },
        { id: "b2b_saas", label: "B2B SaaS" },
        { id: "consumer", label: "Consumer" },
        { id: "fintech", label: "Fintech" },
      ],
      suggestedAnswerId: "ai_infra",
    },
    {
      kind: "question",
      nodeId: "need_investor_type",
      question: "What type of investor would be the best fit?",
      options: [
        { id: "operator_vc", label: "Operator-turned-VC at a $100M+ fund" },
        { id: "angel", label: "Individual angels writing $25-100k checks" },
        { id: "strategic", label: "Strategic / corporate VC" },
        { id: "solo_gp", label: "Solo GPs and emerging managers" },
      ],
      suggestedAnswerId: "operator_vc",
    },
    {
      kind: "confirm",
      nodeId: "need_confirm",
      draftSummary:
        "Raising a seed round in the next 60 days for an AI/infra B2B SaaS. Looking for warm introductions to operator-turned-VCs at $100M+ funds, with a preference for investors who have shipped technical products themselves.",
      rewrittenSummary:
        "Raising a seed round in the next 60 days for an AI/infra B2B SaaS. Also open to strong individual angels with deep AI operator networks, in addition to operator-turned-VCs at $100M+ funds.",
    },
  ],
}

export const OFFER_DEMO_SCRIPT: DemoScript = {
  steps: [
    {
      kind: "question",
      nodeId: "offer_help",
      question: "What can you offer other attendees this weekend?",
      options: [
        { id: "fundraising", label: "Fundraising playbook + investor intros" },
        { id: "gtm", label: "Early-stage GTM and positioning feedback" },
        { id: "hiring", label: "Engineering and design hiring intros" },
        { id: "design", label: "Brand / UX design reviews" },
      ],
      suggestedAnswerId: "fundraising",
    },
    {
      kind: "question",
      nodeId: "offer_depth",
      question: "How deep can you go on that?",
      options: [
        { id: "intros", label: "Warm intros to 2-3 people in my network" },
        { id: "working_session", label: "30-min working session on the spot" },
        { id: "async_notes", label: "Quick async notes after the event" },
        { id: "longterm", label: "Ongoing coffee-chat cadence" },
      ],
      suggestedAnswerId: "intros",
    },
    {
      kind: "question",
      nodeId: "offer_background",
      question: "What background makes you credible on this?",
      options: [
        { id: "recent_raise", label: "Just closed a $6M seed a few months ago" },
        { id: "multi_exit", label: "Two prior exits in the space" },
        { id: "ex_vc", label: "Former principal at a seed fund" },
        { id: "operator", label: "20+ years of operator experience" },
      ],
      suggestedAnswerId: "recent_raise",
    },
    {
      kind: "confirm",
      nodeId: "offer_confirm",
      draftSummary:
        "Recently closed a $6M seed. Happy to share the exact fundraising playbook (pitch, data room, investor list) and make 2-3 warm introductions for founders with strong technical stories who are raising right now.",
      rewrittenSummary:
        "Recently closed a $6M seed. Happy to share the fundraising playbook and make warm intros - especially for founders building AI/infra products - and I can do a 30-min working session on positioning on request.",
    },
  ],
}

/**
 * Response shape matching `ApiAdvanceResponse` in event-branching-onboarding.tsx.
 */
export interface DemoAdvanceResponse {
  phase: "question" | "confirm" | "done"
  nodeId: string | null
  question: string | null
  options: DemoOption[] | null
  freeResponse: boolean
  draftSummary: string | null
  suggestedAnswerId?: string | null
}

/**
 * Return the script response for a given (1-based) step index.
 *  - index 0 or undefined => first question (entry call).
 *  - index past the last step => phase: "done".
 */
export function getDemoAdvanceResponse(
  script: DemoScript,
  stepIndex: number,
): DemoAdvanceResponse {
  const step = script.steps[stepIndex]
  if (!step) {
    return {
      phase: "done",
      nodeId: null,
      question: null,
      options: null,
      freeResponse: false,
      draftSummary: null,
      suggestedAnswerId: null,
    }
  }
  if (step.kind === "question") {
    return {
      phase: "question",
      nodeId: step.nodeId,
      question: step.question,
      options: step.options,
      freeResponse: false,
      draftSummary: null,
      suggestedAnswerId: step.suggestedAnswerId,
    }
  }
  return {
    phase: "confirm",
    nodeId: step.nodeId,
    question: null,
    options: null,
    freeResponse: false,
    draftSummary: step.draftSummary,
    suggestedAnswerId: null,
  }
}

export function getDemoRewriteSummary(script: DemoScript): string {
  const confirm = script.steps.find(
    (s): s is DemoConfirmStep => s.kind === "confirm",
  )
  return confirm?.rewrittenSummary || confirm?.draftSummary || ""
}
