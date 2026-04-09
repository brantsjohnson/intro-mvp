/**
 * Demo data for the sponsor event dashboard.
 * Activated via ?demo=1 in the URL — intended for sales demos and screenshots.
 * All data is fictional and does not represent real people or companies.
 */

import type { IntentRow } from "@/components/sponsor/sponsor-insights-tab"

export const DEMO_ROI = {
  messages_sent: 63,
  replies_received: 38,
  linkedin_logged: 29,
  met_marked: 28,
  engaged_leads_total: 82,
  qualified_leads: 118,
  strong_fits: 52,
  potential_deals_low: 48000,
  potential_deals_high: 155000,
  top_reason_tags: ["B2B SaaS", "early-stage", "revenue ops"],
  top_industries: ["fintech", "devtools"],
  funnel: [
    { id: "recommended", label: "Recommended", count: 118 },
    { id: "met", label: "Met", count: 28 },
    { id: "pending_deal", label: "Pending Deal", count: 11 },
    { id: "closed", label: "Closed", count: 6 },
  ],
  outreach_by_day: [
    { date: "Apr 1", count: 5 },
    { date: "Apr 2", count: 12 },
    { date: "Apr 3", count: 18 },
    { date: "Apr 4", count: 9 },
    { date: "Apr 5", count: 14 },
    { date: "Apr 6", count: 3 },
    { date: "Apr 7", count: 2 },
    { date: "Apr 8", count: 21 },
    { date: "Apr 9", count: 7 },
  ],
  top_topics: [
    { tag: "B2B SaaS", count: 34 },
    { tag: "revenue ops", count: 21 },
    { tag: "early-stage", count: 17 },
  ],
  outreach_table: [],
  migrationRequired: false,
}

export const DEMO_CONNECTION_TYPES: IntentRow[] = [
  { key: "investors", label: "Investors / funding", count: 184 },
  { key: "hiring", label: "Hiring / talent", count: 152 },
  { key: "customers", label: "Potential customers", count: 131 },
  { key: "partnerships", label: "Partnerships / BD", count: 104 },
  { key: "mentors", label: "Mentors / advisors", count: 87 },
  { key: "cofounder", label: "Co-founder", count: 46 },
  { key: "community", label: "Community / networking", count: 38 },
]

export const DEMO_TOTAL_ATTENDEES = 581

export type DemoRecRow = {
  user_id: string
  display_name: string
  career_title: string | null
  company_name: string | null
  score: number
  reason_tags: string[]
  fit_signals?: string[]
  match_explanation_text: string | null
  current_status: string
  notes: string | null
  lead_id: string | null
  linkedin_url: string | null
}

export const DEMO_RECOMMENDATIONS: DemoRecRow[] = [
  {
    user_id: "demo-001",
    display_name: "Steve Burns",
    career_title: "VP of Revenue",
    company_name: "Stackform",
    score: 91,
    reason_tags: ["B2B SaaS", "revenue ops", "Series A"],
    fit_signals: [],
    match_explanation_text:
      "Steve leads revenue at a Series A SaaS company — exactly the buyer profile you described. He's publicly talked about overhauling their sales stack.",
    current_status: "messaged",
    notes: null,
    lead_id: "lead-demo-001",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-002",
    display_name: "Jada Harris",
    career_title: "Head of Growth",
    company_name: "Loopwise",
    score: 87,
    reason_tags: ["PLG", "early-stage", "B2B SaaS"],
    fit_signals: [],
    match_explanation_text:
      "Jada is scaling growth at a seed-stage product-led company. She mentioned looking for tooling to improve conversion from trial to paid.",
    current_status: "recommended",
    notes: null,
    lead_id: "lead-demo-002",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-003",
    display_name: "Sam Evanston",
    career_title: "Co-founder & CEO",
    company_name: "Vessel AI",
    score: 84,
    reason_tags: ["AI", "B2B SaaS", "Series A"],
    fit_signals: [],
    match_explanation_text:
      "Sam is building an AI layer for enterprise workflows. Your product could directly plug into their sales process.",
    current_status: "replied",
    notes: "Responded within 2 hours. Very interested.",
    lead_id: "lead-demo-003",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-004",
    display_name: "Rachel Torres",
    career_title: "Director of Sales",
    company_name: "Clearpath Finance",
    score: 80,
    reason_tags: ["fintech", "revenue ops", "mid-market"],
    fit_signals: [],
    match_explanation_text:
      "Rachel manages a 12-person sales team at a fintech scaleup. The team is actively evaluating new tools this quarter.",
    current_status: "linkedin",
    notes: null,
    lead_id: "lead-demo-004",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-005",
    display_name: "Mike Chen",
    career_title: "CTO",
    company_name: "Coreflow",
    score: 77,
    reason_tags: ["devtools", "B2B SaaS", "seed"],
    fit_signals: [],
    match_explanation_text:
      "Mike's team recently hired a head of sales and is looking to establish their first sales process from scratch.",
    current_status: "recommended",
    notes: null,
    lead_id: "lead-demo-005",
    linkedin_url: null,
  },
  {
    user_id: "demo-006",
    display_name: "Dana Wells",
    career_title: "Revenue Operations Manager",
    company_name: "Brightlayer",
    score: 74,
    reason_tags: ["revenue ops", "B2B SaaS"],
    fit_signals: [],
    match_explanation_text:
      "Dana owns RevOps at a 60-person SaaS company. Mentioned pipeline visibility as a top pain point.",
    current_status: "met",
    notes: "Met at the coffee break. Follow up Monday.",
    lead_id: "lead-demo-006",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-007",
    display_name: "Alex Morgan",
    career_title: "Founder & CEO",
    company_name: "Kalibre",
    score: 70,
    reason_tags: ["HR tech", "early-stage"],
    fit_signals: [],
    match_explanation_text:
      "Alex is a first-time founder building in HR tech. Looking for sales infrastructure to support their first enterprise deals.",
    current_status: "recommended",
    notes: null,
    lead_id: "lead-demo-007",
    linkedin_url: null,
  },
  {
    user_id: "demo-008",
    display_name: "Taylor Reid",
    career_title: "VP Product",
    company_name: "Databridge",
    score: 67,
    reason_tags: ["data", "Series B"],
    fit_signals: [],
    match_explanation_text:
      "Taylor influences buy decisions at a data infrastructure company growing toward enterprise. Their sales team is under-tooled for the deal size they're chasing.",
    current_status: "messaged",
    notes: null,
    lead_id: "lead-demo-008",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-009",
    display_name: "Jordan Park",
    career_title: "Head of Partnerships",
    company_name: "NexOps",
    score: 63,
    reason_tags: ["partnerships", "B2B SaaS"],
    fit_signals: [],
    match_explanation_text:
      "Jordan is building a partner program and needs tooling to track and activate referral pipelines.",
    current_status: "recommended",
    notes: null,
    lead_id: "lead-demo-009",
    linkedin_url: "https://linkedin.com",
  },
  {
    user_id: "demo-010",
    display_name: "Casey Miller",
    career_title: "Account Executive",
    company_name: "Trilobit",
    score: 60,
    reason_tags: ["B2B SaaS", "mid-market"],
    fit_signals: [],
    match_explanation_text:
      "Casey is an AE at a mid-market SaaS company and actively evaluating tools to improve their own deal velocity.",
    current_status: "recommended",
    notes: null,
    lead_id: "lead-demo-010",
    linkedin_url: null,
  },
]

export const DEMO_PROFILE = {
  company_description: "We help B2B sales teams close deals faster with AI-powered pipeline intelligence.",
  product_offering: "AI sales copilot — deal scoring, follow-up drafts, and pipeline health alerts.",
  ideal_customer_json: {
    industries: ["SaaS", "fintech", "devtools"],
    roles: ["VP Sales", "Head of Revenue", "CRO", "RevOps"],
    company_stages: ["seed", "series a", "series b"],
  },
  event_goals: "Book 5–10 product demos. Find 2–3 design partners.",
}
