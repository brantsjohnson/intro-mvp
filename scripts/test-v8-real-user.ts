#!/usr/bin/env tsx

// Verification script for the v8 matcher (LLM ranker + structured explanations).
//
// Calls the deployed matchmaker with force_recompute=true for a real attendee
// against a real event, then dumps the three structured fields per pick so you
// can diff against the Claude-on-CSV output. Intended to be run after deploying
// v8 to validate the LLM ranker is firing and the copy reads well.
//
// Usage:
//   pnpm tsx scripts/test-v8-real-user.ts <user_id> <event_code>
//
// Example (Brantly Johnson at the live event):
//   pnpm tsx scripts/test-v8-real-user.ts 13281143-05cf-495b-882f-bef357d4ce4b NTHATR

import { config } from "dotenv"
import { resolve } from "node:path"

for (const file of [".env.deploy", ".env.local"]) {
  try {
    config({ path: resolve(file) })
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

async function main() {
  const userId = process.argv[2]
  const eventCode = process.argv[3]
  if (!userId || !eventCode) {
    console.error("Usage: tsx scripts/test-v8-real-user.ts <user_id> <event_code>")
    process.exit(1)
  }

  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("event_id, event_name")
    .eq("event_code", eventCode.toUpperCase())
    .maybeSingle()
  if (eventErr || !event) {
    console.error(`Event not found for code ${eventCode}: ${eventErr?.message ?? "no row"}`)
    process.exit(1)
  }

  const { data: viewer, error: viewerErr } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, career_title, company_name")
    .eq("user_id", userId)
    .maybeSingle()
  if (viewerErr || !viewer) {
    console.error(`Viewer not found: ${viewerErr?.message ?? "no row"}`)
    process.exit(1)
  }

  const viewerLabel = `${viewer.first_name || ""} ${viewer.last_name || ""}`.trim() || userId
  console.log(`Viewer: ${viewerLabel} (${userId})`)
  console.log(`Event:  ${event.event_name} (${event.event_id})`)
  console.log("Calling matchmaker with force_recompute=true...\n")

  const response = await fetch(`${SUPABASE_URL}/functions/v1/matchmaker`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
    },
    body: JSON.stringify({
      event_id: event.event_id,
      user_id: userId,
      force_recompute: true,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok !== true) {
    console.error("Matchmaker call failed:", response.status, JSON.stringify(payload, null, 2))
    process.exit(1)
  }

  console.log(`Selection path: ${payload.selection_path || "unknown"}`)
  console.log(`Processed:      ${payload.processed} match(es)`)
  console.log(`Inserted:       ${payload.inserted}\n`)

  const matches = Array.isArray(payload.matches) ? payload.matches : []

  // Resolve candidate names from users table for nicer output.
  const candidateIds = matches.map((m: any) => String(m.id)).filter(Boolean)
  const { data: candidateRows } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, career_title, company_name")
    .in("user_id", candidateIds)
  const byId = new Map(
    (candidateRows ?? []).map((row: any) => [String(row.user_id), row]),
  )

  matches.forEach((m: any, idx: number) => {
    const c = byId.get(String(m.id)) as any
    const name = c
      ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || m.id
      : String(m.id)
    const role = c
      ? [c.career_title, c.company_name].filter(Boolean).join(" at ")
      : ""

    console.log(`[${idx + 1}] ${name} ${role ? `— ${role}` : ""}`)
    console.log(`    raw_score: ${m.raw_score}  normalized: ${m.score}`)
    if (m.fallback_used) console.log(`    fallback_used: true`)
    if (m.why_meet_card) console.log(`    card:      ${m.why_meet_card}`)
    if (m.why_meet_paragraph) {
      console.log(`    paragraph: ${m.why_meet_paragraph}`)
    }
    if (m.what_they_are_looking_for) {
      console.log(`    looking_for: ${m.what_they_are_looking_for}`)
    }
    console.log("")
  })
}

main().catch((err) => {
  console.error("Verification script failed:", err)
  process.exit(1)
})
