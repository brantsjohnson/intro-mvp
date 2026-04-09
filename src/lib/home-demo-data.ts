/**
 * Demo data for the /home attendee page.
 * Activated via ?demo=1 — bypasses auth entirely, seeds all UI state.
 * All data is fictional.
 */

import type { Profile, Event } from "@/lib/types"

/* ── Demo "logged-in" user ───────────────────────────────────── */
export const DEMO_USER = {
  id: "demo-user-self",
  email: "demo@intro.events",
}

export const DEMO_SELF_PROFILE: Profile = {
  id: "demo-user-self",
  first_name: "Alex",
  last_name: "Rivera",
  email: "demo@intro.events",
  avatar_url: "https://randomuser.me/api/portraits/women/44.jpg",
  job_title: "Head of Growth",
  company: "Luminary Labs",
  what_do_you_do: "I help early-stage startups find product-market fit through data-driven growth loops.",
  location: "San Francisco, CA",
  linkedin_url: "https://linkedin.com",
  mbti: "ENFJ",
  enneagram: null,
  networking_goals: ["Find investors", "Meet potential customers"],
  hobbies: ["Hiking", "Coffee"],
  expertise_tags: ["Growth", "SaaS", "B2B"],
  consent: true,
}

/* ── Demo event ──────────────────────────────────────────────── */
export const DEMO_EVENT: Event = {
  id: "demo-event-001",
  name: "Founders & Funders Summit",
  code: "DEMO01",
  starts_at: "2026-04-10T09:00:00",
  ends_at: "2026-04-10T18:00:00",
  location: "Fort Mason Center, San Francisco",
  header_image_url: null,
  is_active: true,
  matchmaking_enabled: true,
  logo_url: null,
}

/* ── Helper to build a Profile ───────────────────────────────── */
function p(
  id: string,
  first: string,
  last: string,
  title: string,
  company: string,
  blurb: string,
  avatarUrl: string,
): Profile {
  return {
    id,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase()}@demo.intro.events`,
    avatar_url: avatarUrl,
    job_title: title,
    company,
    what_do_you_do: blurb,
    location: "San Francisco, CA",
    linkedin_url: "https://linkedin.com",
    mbti: null,
    enneagram: null,
    networking_goals: null,
    hobbies: null,
    expertise_tags: null,
    consent: true,
  }
}

/* ── Top 3 match suggestions ─────────────────────────────────── */
export const DEMO_MATCHES = [
  {
    id: "match-001",
    summary:
      "Both of you are building growth engines for B2B SaaS companies at the Series A stage — Steve is actively looking for a growth advisor.",
    bases: ["B2B SaaS", "Series A", "Growth strategy"],
    shared_activities: "Conference networking",
    dive_deeper: "Ask Steve about their current funnel bottleneck.",
    profile: p(
      "demo-p-001",
      "Steve",
      "Burns",
      "VP of Revenue",
      "Stackform",
      "I lead revenue at a Series A SaaS company. Actively hiring AEs and looking for growth tooling.",
      "/marketing/Steve Burns.png",
    ),
    is_present: true,
    structured_explanation: {
      connection_type: "Potential customer",
      reason_title: "You solve their exact problem",
      reason_summary:
        "Steve's team just lost their RevOps lead and is evaluating tools to fill the gap. Your background in growth systems is exactly what they need.",
      shared_tags: ["B2B SaaS", "Series A", "Revenue ops"],
      helpfulness_bullets: [
        "Steve is evaluating growth tools this quarter",
        "You've built similar systems at companies at the same stage",
        "Both of you prioritize async communication",
      ],
      suggested_icebreaker:
        "\"I saw you're scaling your revenue team — what's the hardest part of the current stage?\"",
    },
    connection_type: "Potential customer",
    algorithm_version: "v2",
  },
  {
    id: "match-002",
    summary:
      "Jada is a growth operator at a PLG startup and has been publicly writing about the exact acquisition channels you specialize in.",
    bases: ["PLG", "Content-led growth", "Seed stage"],
    shared_activities: "Conference networking",
    dive_deeper: "Jada's latest essay on onboarding drop-off is worth discussing.",
    profile: p(
      "demo-p-002",
      "Jada",
      "Harris",
      "Head of Growth",
      "Loopwise",
      "Building the growth motion from scratch at a seed-stage PLG startup. Former Amplitude.",
      "/marketing/Jada Harris.png",
    ),
    is_present: true,
    structured_explanation: {
      connection_type: "Peer / collaborator",
      reason_title: "Complementary expertise",
      reason_summary:
        "Jada has deep PLG knowledge and you have B2B enterprise experience. Together you'd cover the full spectrum.",
      shared_tags: ["Growth", "PLG", "SaaS"],
      helpfulness_bullets: [
        "Jada is looking for a thought partner on pricing experiments",
        "You've run similar activation campaigns",
        "Both attend the same Slack communities",
      ],
      suggested_icebreaker:
        "\"Your thread on activation rate was really good — are you experimenting with in-app nudges yet?\"",
    },
    connection_type: "Peer / collaborator",
    algorithm_version: "v2",
  },
  {
    id: "match-003",
    summary:
      "Sam is a founder who needs exactly the kind of growth advisory you provide — and is actively looking for a fractional growth hire.",
    bases: ["AI", "Fractional roles", "Early-stage"],
    shared_activities: "Conference networking",
    dive_deeper: "Sam mentioned they're fundraising in Q2.",
    profile: p(
      "demo-p-003",
      "Sam",
      "Evanston",
      "Co-founder & CEO",
      "Vessel AI",
      "Building an AI layer for enterprise workflows. Series A in 8 months. Looking for growth help now.",
      "/marketing/Sam Evanston.png",
    ),
    is_present: false,
    structured_explanation: {
      connection_type: "Potential partner",
      reason_title: "You could accelerate their timeline",
      reason_summary:
        "Sam is pre-Series A and needs to show traction. Your network and growth expertise could be a real lever.",
      shared_tags: ["AI", "Enterprise", "Growth"],
      helpfulness_bullets: [
        "Sam is open to a fractional engagement",
        "You've helped two companies get to Series A",
        "Shared interest in AI-native products",
      ],
      suggested_icebreaker:
        "\"What does your growth motion look like right now — are you mostly founder-led sales?\"",
    },
    connection_type: "Potential partner",
    algorithm_version: "v2",
  },
]

/* ── Manual / QR connections ─────────────────────────────────── */
export const DEMO_MANUAL_CONNECTIONS = [
  {
    id: "mc-001",
    eventId: "demo-event-001",
    aId: "demo-user-self",
    bId: "demo-p-004",
    connectionKind: "user_added",
    profile: p(
      "demo-p-004",
      "Dana",
      "Wells",
      "Revenue Operations Manager",
      "Brightlayer",
      "RevOps at a 60-person SaaS company.",
      "/marketing/Dana Wells.png",
    ),
    status: "confirmed" as const,
    createdAt: new Date().toISOString(),
    userAddMethod: "qr",
    createdByUserId: "demo-user-self",
  },
  {
    id: "mc-002",
    eventId: "demo-event-001",
    aId: "demo-p-005",
    bId: "demo-user-self",
    connectionKind: "user_added",
    profile: p(
      "demo-p-005",
      "Mike",
      "Chen",
      "CTO",
      "Coreflow",
      "Building devtools for distributed teams.",
      "/marketing/Mike Chen.png",
    ),
    status: "pending-incoming" as const,
    createdAt: new Date().toISOString(),
    userAddMethod: "qr",
    createdByUserId: "demo-p-005",
  },
]

/* ── Directory ───────────────────────────────────────────────── */
export const DEMO_DIRECTORY = [
  {
    profile: p("demo-p-001", "Steve", "Burns", "VP of Revenue", "Stackform", "", "/marketing/Steve Burns.png"),
    status: "connected" as const,
    isPresent: true,
  },
  {
    profile: p("demo-p-004", "Dana", "Wells", "Revenue Operations Manager", "Brightlayer", "", "/marketing/Dana Wells.png"),
    status: "connected" as const,
    isPresent: true,
  },
  {
    profile: p("demo-p-006", "Rachel", "Torres", "Director of Sales", "Clearpath Finance", "", "/marketing/Rachel Torres.png"),
    status: "connected" as const,
    isPresent: false,
  },
  {
    profile: p("demo-p-002", "Jada", "Harris", "Head of Growth", "Loopwise", "", "/marketing/Jada Harris.png"),
    status: "available" as const,
    isPresent: true,
  },
  {
    profile: p("demo-p-003", "Sam", "Evanston", "Co-founder & CEO", "Vessel AI", "", "/marketing/Sam Evanston.png"),
    status: "available" as const,
    isPresent: false,
  },
  {
    profile: p("demo-p-007", "Alex", "Morgan", "Founder & CEO", "Kalibre", "", "/marketing/Alex Morgan.png"),
    status: "available" as const,
    isPresent: true,
  },
  {
    profile: p("demo-p-008", "Taylor", "Reid", "VP Product", "Databridge", "", "/marketing/Taylor Reid.png"),
    status: "available" as const,
    isPresent: true,
  },
  {
    profile: p("demo-p-009", "Jordan", "Park", "Head of Partnerships", "NexOps", "", "/marketing/Jordan Park.png"),
    status: "available" as const,
    isPresent: false,
  },
]
