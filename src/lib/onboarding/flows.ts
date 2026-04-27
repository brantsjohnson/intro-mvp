// Branching onboarding flows (need + offer), ported from Google Apps Script source of truth.
// Do NOT edit question text or option labels without updating matching quality expectations.

export type FlowNodeType =
  | "multiple_choice"
  | "free_response"
  | "ai_generated_multiple_choice"
  | "ai_generated_question"
  | "terminal"
  | "system_output"

export interface FlowOption {
  id: string
  label: string
}

export interface FlowNode {
  node_id: string
  journey?: string
  step?: string | number
  type: FlowNodeType
  question?: string
  options?: FlowOption[]
  options_template?: FlowOption[]
  next?: Record<string, string> | string
  ai_mode?: string
  ai_inputs?: string[]
  ai_behavior?: Record<string, unknown>
  output?: Record<string, unknown>
}

export interface FlowDefinition {
  flow_id: string
  version: string
  entry: FlowNode
  nodes: Record<string, FlowNode>
}

// Per-step transcript entry stored inside *_flow_state_json.node_path
export interface StepEntry {
  node_id: string
  question: string
  options: FlowOption[] | null
  answer: string
}

export interface FlowState {
  version: "v2"
  node_path: StepEntry[]
  draft_summary: string
  is_confirmed: boolean
  asked_count: number
}

// ---- NEED flow (source of truth) ----
// Mirrors `FLOW` in src/Code.js in the GAS project.
export const NEED_FLOW: FlowDefinition = {
  flow_id: "event_goal_branching_v1",
  version: "1.0.0",
  entry: {
    node_id: "Q1_MAIN_GOAL",
    journey: "ALL",
    step: 1,
    type: "multiple_choice",
    question: "What is your main goal at this event?",
    options: [
      { id: "A", label: "Meet people generally" },
      { id: "B", label: "Learn about the topic" },
      { id: "C", label: "Build partnerships" },
      { id: "D", label: "Find customers" },
      { id: "E", label: "Represent an organization" },
      { id: "F", label: "Other" },
    ],
    next: {
      A: "A_Q2_WHY_MEET",
      B: "B_Q2_LEARN_TEXT",
      C: "C_Q2_REL_TYPE",
      D: "D_Q2_PROBLEM_TEXT",
      E: "E_Q2_ROLE",
      F: "O_Q2_CLARIFY_1",
    },
  },
  nodes: {
    A_Q2_WHY_MEET: {
      node_id: "A_Q2_WHY_MEET",
      journey: "A",
      step: "2",
      type: "multiple_choice",
      question: "Why do you want to meet people today?",
      options: [
        { id: "A", label: "Talk with people in similar roles" },
        { id: "B", label: "Get help or advice on a problem" },
        { id: "C", label: "Explore job or hiring opportunities" },
        { id: "D", label: "Understand different industries" },
        { id: "E", label: "Other" },
      ],
      next: {
        A: "A_Q3_RELATE_ON",
        B: "A_Q3_HELP_TEXT",
        C: "A_Q3_JOB_MODE",
        D: "A_Q3_INDUSTRY_PICK",
        E: "A_AI_CLARIFY_1",
      },
    },
    A_Q3_RELATE_ON: {
      node_id: "A_Q3_RELATE_ON",
      journey: "A",
      step: "3A",
      type: "multiple_choice",
      question: "What do you want to compare or relate on?",
      options: [
        { id: "A", label: "Day-to-day work" },
        { id: "B", label: "Career path or next steps" },
        { id: "C", label: "Tools, systems, or workflows" },
        { id: "D", label: "Challenges common to my role" },
        { id: "E", label: "General shared experiences" },
        { id: "F", label: "Other" },
      ],
      next: {
        A: "AI_LOOP",
        B: "A_Q4_CAREER_FOCUS",
        C: "A_Q4_TOOLS_INTEREST",
        D: "A_Q4_CHALLENGE_TYPE",
        E: "AI_LOOP",
        F: "A_AI_CLARIFY_1",
      },
    },
    A_Q4_CAREER_FOCUS: {
      node_id: "A_Q4_CAREER_FOCUS",
      journey: "A",
      step: "4B",
      type: "multiple_choice",
      question: "Where are you most focused right now?",
      options: [
        { id: "A", label: "Early career / figuring things out" },
        { id: "B", label: "Growing or leveling up" },
        { id: "C", label: "Changing direction" },
        { id: "D", label: "Leadership or specialization" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q4_TOOLS_INTEREST: {
      node_id: "A_Q4_TOOLS_INTEREST",
      journey: "A",
      step: "4C",
      type: "multiple_choice",
      question: "What kind of tools or systems are you most interested in?",
      options: [
        { id: "A", label: "Software or tech tools" },
        { id: "B", label: "Processes or workflows" },
        { id: "C", label: "Team systems or collaboration" },
        { id: "D", label: "Personal productivity" },
        { id: "E", label: "A mix" },
        { id: "F", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q4_CHALLENGE_TYPE: {
      node_id: "A_Q4_CHALLENGE_TYPE",
      journey: "A",
      step: "4D",
      type: "multiple_choice",
      question: "What kind of challenge are you dealing with most?",
      options: [
        { id: "A", label: "Time or prioritization" },
        { id: "B", label: "Decision-making or uncertainty" },
        { id: "C", label: "People or communication" },
        { id: "D", label: "Scaling or complexity" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q3_HELP_TEXT: {
      node_id: "A_Q3_HELP_TEXT",
      journey: "A",
      step: "3B",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q3_JOB_MODE: {
      node_id: "A_Q3_JOB_MODE",
      journey: "A",
      step: "3C",
      type: "multiple_choice",
      question: "Which best describes what you're open to right now?",
      options: [
        { id: "A", label: "Looking for job opportunities" },
        { id: "B", label: "Learning about teams or companies" },
        { id: "C", label: "Hiring or building a team" },
        { id: "D", label: "Other" },
      ],
      next: {
        A: "A_Q4_JOB_SEEKING_TEXT",
        B: "A_Q4_INDUSTRIES_INTEREST_TEXT",
        C: "A_Q4_HIRING_TEXT",
        D: "A_AI_CLARIFY_1",
      },
    },
    A_Q4_JOB_SEEKING_TEXT: {
      node_id: "A_Q4_JOB_SEEKING_TEXT",
      journey: "A",
      step: "4C-A",
      type: "multiple_choice",
      question: "What kind of work are you most trying to break into?",
      options: [
        { id: "A", label: "Startups or early-stage companies" },
        { id: "B", label: "Venture capital or investing" },
        { id: "C", label: "Corporate or established companies" },
        { id: "D", label: "A specific industry or sector" },
        { id: "E", label: "Still figuring out the direction" },
        { id: "F", label: "Other" },
      ],
      next: { "*": "A_AI_JOB_TARGET_CLARIFY" },
    },
    A_AI_JOB_TARGET_CLARIFY: {
      node_id: "A_AI_JOB_TARGET_CLARIFY",
      journey: "A",
      step: "AI-JOB-TARGET",
      type: "ai_generated_multiple_choice",
      question: "(AI narrows job or study focus)",
      ai_mode: "clarify_job_target",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q4_INDUSTRIES_INTEREST_TEXT: {
      node_id: "A_Q4_INDUSTRIES_INTEREST_TEXT",
      journey: "A",
      step: "4C-B",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q4_HIRING_TEXT: {
      node_id: "A_Q4_HIRING_TEXT",
      journey: "A",
      step: "4C-C",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_Q3_INDUSTRY_PICK: {
      node_id: "A_Q3_INDUSTRY_PICK",
      journey: "A",
      step: "3D",
      type: "ai_generated_multiple_choice",
      question: "Which industry are you most curious about today?",
      options_template: [
        { id: "A", label: "{Top Industry 1}" },
        { id: "B", label: "{Top Industry 2}" },
        { id: "C", label: "{Top Industry 3}" },
        { id: "D", label: "Other" },
      ],
      ai_inputs: ["event_attendee_industries_distribution"],
      next: {
        A: "A_Q4_INDUSTRY_LEARN_SPECIFIC",
        B: "A_Q4_INDUSTRY_LEARN_SPECIFIC",
        C: "A_Q4_INDUSTRY_LEARN_SPECIFIC",
        D: "A_Q4_INDUSTRY_LEARN_SPECIFIC",
      },
    },
    A_Q4_INDUSTRY_LEARN_SPECIFIC: {
      node_id: "A_Q4_INDUSTRY_LEARN_SPECIFIC",
      journey: "A",
      step: "4D",
      type: "ai_generated_multiple_choice",
      question: "What do you want to learn specifically from this industry?",
      options: [
        { id: "A", label: "Market trends" },
        { id: "B", label: "How companies operate" },
        { id: "C", label: "Career paths or roles" },
        { id: "D", label: "Tools or technologies used" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    A_AI_CLARIFY_1: {
      node_id: "A_AI_CLARIFY_1",
      journey: "A",
      step: "AI-3E",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    B_Q2_LEARN_TEXT: {
      node_id: "B_Q2_LEARN_TEXT",
      journey: "B",
      step: "2B",
      type: "ai_generated_multiple_choice",
      ai_mode: "event_topics_for_learning",
      question: "(AI generates topic question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    C_Q2_REL_TYPE: {
      node_id: "C_Q2_REL_TYPE",
      journey: "C",
      step: "2",
      type: "multiple_choice",
      question: "What kind of business relationship are you looking for?",
      options: [
        { id: "A", label: "A business we could work with or integrate with" },
        { id: "B", label: "Company sponsors" },
        { id: "C", label: "Investors or funding relationships" },
        { id: "D", label: "Cross-sector collaboration (e.g. government, nonprofit, education)" },
        { id: "E", label: "Other" },
      ],
      next: {
        A: "C_Q3_INTEGRATION_FIT_TEXT",
        B: "C_Q3_SPONSORSHIP_TYPE",
        C: "C_Q3_INVESTOR_MODE",
        D: "C_Q3_COLLAB_TEXT",
        E: "C_AI_CLARIFY_1",
      },
    },
    C_Q3_INTEGRATION_FIT_TEXT: {
      node_id: "C_Q3_INTEGRATION_FIT_TEXT",
      journey: "C",
      step: "3A",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    C_Q3_SPONSORSHIP_TYPE: {
      node_id: "C_Q3_SPONSORSHIP_TYPE",
      journey: "C",
      step: "3B",
      type: "multiple_choice",
      question: "What kind of sponsorship relationship are you exploring?",
      options: [
        { id: "A", label: "Finding sponsors for an event or initiative" },
        { id: "B", label: "Sponsoring events, communities, or content" },
        { id: "C", label: "Co-marketing or brand partnerships" },
        { id: "D", label: "Exploring options — not defined yet" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    C_Q3_INVESTOR_MODE: {
      node_id: "C_Q3_INVESTOR_MODE",
      journey: "C",
      step: "3C",
      type: "multiple_choice",
      question: "What best describes what you're open to?",
      options: [
        { id: "A", label: "Raising investment" },
        { id: "B", label: "Exploring future fundraising" },
        { id: "C", label: "Investing in others" },
        { id: "D", label: "Learning from investors" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    C_Q3_COLLAB_TEXT: {
      node_id: "C_Q3_COLLAB_TEXT",
      journey: "C",
      step: "3D",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    C_AI_CLARIFY_1: {
      node_id: "C_AI_CLARIFY_1",
      journey: "C",
      step: "3E",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "{AI-generated clarifying question based on response}",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    D_Q2_PROBLEM_TEXT: {
      node_id: "D_Q2_PROBLEM_TEXT",
      journey: "D",
      step: "2",
      type: "ai_generated_multiple_choice",
      ai_mode: "sponsor_roi_type",
      question:
        "(AI uses company URL/summary + optional live scrape to infer what they sell; MC narrows client industry, service slice, and/or best people to meet)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    E_Q2_ROLE: {
      node_id: "E_Q2_ROLE",
      journey: "E",
      step: "2",
      type: "multiple_choice",
      question: "What best describes your role at this event?",
      options: [
        { id: "A", label: "Talking to people about what we do" },
        { id: "B", label: "Learning and listening" },
        { id: "C", label: "Supporting partners or clients" },
        { id: "D", label: "Speaking or participating on a panel" },
        { id: "E", label: "Being available to connect" },
        { id: "F", label: "Other" },
      ],
      next: {
        A: "E_Q3A_WHO_TALK_TO",
        B: "E_Q3B_LEARN_INDUSTRY_PICK",
        C: "E_Q3C_INDUSTRY_SERVE",
        D: "E_Q3D_PANEL_OUTCOME",
        E: "E_Q3E_OPEN_TO_CONNECT",
        F: "E_AI_CLARIFY_1",
      },
    },
    E_Q3A_WHO_TALK_TO: {
      node_id: "E_Q3A_WHO_TALK_TO",
      journey: "E",
      step: "3",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    E_Q3B_LEARN_INDUSTRY_PICK: {
      node_id: "E_Q3B_LEARN_INDUSTRY_PICK",
      journey: "E",
      step: "3",
      type: "ai_generated_multiple_choice",
      question: "What are you most interested in learning about?",
      options_template: [
        { id: "A", label: "{Top Industry 1}" },
        { id: "B", label: "{Top Industry 2}" },
        { id: "C", label: "{Top Industry 3}" },
        { id: "D", label: "Other" },
      ],
      ai_inputs: ["event_attendee_industries_distribution"],
      next: { "*": "AI_LOOP" },
    },
    E_Q3C_INDUSTRY_SERVE: {
      node_id: "E_Q3C_INDUSTRY_SERVE",
      journey: "E",
      step: "3",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates question)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    E_Q3D_PANEL_OUTCOME: {
      node_id: "E_Q3D_PANEL_OUTCOME",
      journey: "E",
      step: "3",
      type: "multiple_choice",
      question: "What would you most like to come out of your participation?",
      options: [
        { id: "A", label: "Conversations with people interested in my topic" },
        { id: "B", label: "Connecting with other speakers" },
        { id: "C", label: "Continuing discussions after the event" },
        { id: "D", label: "Getting feedback or reactions" },
        { id: "E", label: "Nothing specific" },
        { id: "F", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    E_Q3E_OPEN_TO_CONNECT: {
      node_id: "E_Q3E_OPEN_TO_CONNECT",
      journey: "E",
      step: "3",
      type: "multiple_choice",
      question: "Who would you be most open to connecting with?",
      options: [
        { id: "A", label: "Anyone who wants to talk" },
        { id: "B", label: "People in my field" },
        { id: "C", label: "People from different backgrounds" },
        { id: "D", label: "People looking for advice" },
        { id: "E", label: "No preference" },
        { id: "F", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    E_AI_CLARIFY_1: {
      node_id: "E_AI_CLARIFY_1",
      journey: "E",
      step: "3",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "{AI-generated clarifying question based on response}",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    O_Q2_CLARIFY_1: {
      node_id: "O_Q2_CLARIFY_1",
      journey: "Other",
      step: "2",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "{AI-generated question based on their response to figure out what they mean}",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    AI_LOOP: {
      node_id: "AI_LOOP",
      type: "ai_generated_multiple_choice",
      ai_mode: "clarify_last_answer",
      question: "(AI generates the next clarifying question or stops if it has enough info)",
      options_template: [
        { id: "A", label: "{AI Option 1}" },
        { id: "B", label: "{AI Option 2}" },
        { id: "C", label: "{AI Option 3}" },
        { id: "D", label: "{AI Option 4}" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "AI_LOOP" },
    },
    END: {
      node_id: "END",
      type: "terminal",
      next: "AFTER_SUMMARY",
    },
    AFTER_SUMMARY: {
      node_id: "AFTER_SUMMARY",
      type: "system_output",
      output: {
        kind: "ai_generated_summary",
        format: "bullets",
        constraints: {
          min_bullets: 2,
          max_bullets: 4,
          tone: "plain_language",
          avoid_taxonomy_terms: true,
        },
      },
      next: "AFTER_CONFIRM",
    },
    AFTER_CONFIRM: {
      node_id: "AFTER_CONFIRM",
      type: "multiple_choice",
      question: "Is this right?",
      options: [
        { id: "A", label: "Yes" },
        { id: "B", label: "Needs changes" },
      ],
      next: {
        A: "DONE",
        B: "AFTER_TWEAK",
      },
    },
    AFTER_TWEAK: {
      node_id: "AFTER_TWEAK",
      type: "free_response",
      question: "What would you like to change?",
      options: [],
      next: { "*": "AFTER_CONFIRM" },
    },
    DONE: {
      node_id: "DONE",
      type: "terminal",
    },
  },
}

// ---- OFFER flow (source of truth) ----
// Mirrors OFFER_FLOW in src/offer.js in the GAS project. Q1/Q2 are AI-personalized
// via prompts in src/lib/onboarding/prompts.ts; the hard-coded option arrays below
// serve as fallback when the AI call fails.
export const OFFER_FLOW: FlowDefinition = {
  flow_id: "event_offer_flow_v1",
  version: "1.0.0",
  entry: {
    node_id: "OFFER_Q1",
    type: "ai_generated_multiple_choice",
    ai_mode: "offer_intro",
    question: "What kind of problem do people usually come to you with?",
    options: [
      { id: "A", label: "Strategic planning support" },
      { id: "B", label: "Operational problem-solving" },
      { id: "C", label: "Industry or role-specific advice" },
      { id: "D", label: "Introductions or connections" },
      { id: "E", label: "Other" },
    ],
    next: { "*": "OFFER_Q2" },
  },
  nodes: {
    OFFER_Q1: {
      node_id: "OFFER_Q1",
      type: "ai_generated_multiple_choice",
      ai_mode: "offer_intro",
      question: "What kind of problem do people usually come to you with?",
      options: [
        { id: "A", label: "Strategic planning support" },
        { id: "B", label: "Operational problem-solving" },
        { id: "C", label: "Industry or role-specific advice" },
        { id: "D", label: "Introductions or connections" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "OFFER_Q2" },
    },
    OFFER_Q2: {
      node_id: "OFFER_Q2",
      type: "ai_generated_multiple_choice",
      ai_mode: "offer_validate",
      question: "Who would benefit most from talking to you today?",
      options: [
        { id: "A", label: "Founders and business owners" },
        { id: "B", label: "Team leads and managers" },
        { id: "C", label: "Individual contributors" },
        { id: "D", label: "People exploring a transition" },
        { id: "E", label: "Other" },
      ],
      next: { "*": "END" },
    },
    END: {
      node_id: "END",
      type: "terminal",
      next: "AFTER_SUMMARY",
    },
    AFTER_SUMMARY: {
      node_id: "AFTER_SUMMARY",
      type: "system_output",
      next: "AFTER_CONFIRM",
    },
    AFTER_CONFIRM: {
      node_id: "AFTER_CONFIRM",
      type: "multiple_choice",
      question: "Is this right?",
      options: [
        { id: "A", label: "Yes" },
        { id: "B", label: "Needs changes" },
      ],
      next: {
        A: "DONE",
        B: "AFTER_TWEAK",
      },
    },
    AFTER_TWEAK: {
      node_id: "AFTER_TWEAK",
      type: "free_response",
      question: "What would you like to change?",
      options: [],
      next: { "*": "AFTER_CONFIRM" },
    },
    DONE: {
      node_id: "DONE",
      type: "terminal",
    },
  },
}

// Hard caps (match src/Code.js need step limit + src/offer.js offer limit)
export const NEED_MAX_STEPS = 7
export const OFFER_MAX_STEPS = 4

// ---- Flow helpers ----

export function getFlowNode(flow: FlowDefinition, nodeId: string): FlowNode | null {
  if (!nodeId) return null
  if (flow.entry && flow.entry.node_id === nodeId) return flow.entry
  return flow.nodes[nodeId] ?? null
}

export function resolveNextNodeId(
  flow: FlowDefinition,
  currentNodeId: string | null,
  selectedOptionId: string | null,
): string | null {
  if (!currentNodeId) return null
  const node = getFlowNode(flow, currentNodeId)
  if (!node) return null
  const nextMap = node.next
  if (!nextMap) return null
  if (typeof nextMap === "string") return nextMap
  if (selectedOptionId && nextMap[selectedOptionId]) return nextMap[selectedOptionId]
  if (nextMap["*"]) return nextMap["*"]
  // Fallback so newly-added "Other" options don't stall the flow.
  if (selectedOptionId && nextMap["END"]) return nextMap["END"]
  return null
}

// Accepts "A", "A.", "A - blah", "A: blah", "A) blah". Returns the uppercase letter or null.
export function normalizeChoiceId(answerText: string | null | undefined): string | null {
  if (!answerText) return null
  const s = String(answerText).trim()
  const m = s.match(/^([A-Za-z])\b/)
  return m ? m[1].toUpperCase() : null
}

// Extract first-line question text for repeat-topic dedupe (port of extractQuestionTopics_).
export function extractQuestionTopicsFromHistory(history: string): string {
  if (!history) return ""
  return String(history)
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split("\n")
      const qLine = lines.find((l) => /^Q\d+:/.test(l))
      if (!qLine) return ""
      return qLine.replace(/^Q\d+:\s*/, "").split("\n")[0].trim()
    })
    .filter(Boolean)
    .join(", ")
}
