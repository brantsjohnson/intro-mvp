#!/usr/bin/env tsx

import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const envFiles = [".env.local"]
for (const file of envFiles) {
  try {
    config({ path: resolve(file) })
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  const eventCode = process.argv[2] || "TEST12"
  const userId = process.argv[3]
  
  console.log(`🔍 Looking up event: ${eventCode}`)
  
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("event_id, event_name")
    .eq("event_code", eventCode.toUpperCase())
    .single()

  if (eventError || !event) {
    console.error(`❌ Event not found: ${eventCode}`)
    process.exit(1)
  }

  console.log(`✅ Found event: ${event.event_name} (${event.event_id})\n`)

  let query = supabase
    .from("connections")
    .select("*")
    .eq("event_id", event.event_id)
    .eq("connection_kind", "system_match")
  
  if (userId) {
    console.log(`🔍 Filtering for user: ${userId}\n`)
    query = query.or(`a_id.eq.${userId},b_id.eq.${userId}`)
  }

  const { data: matches, error: matchesError } = await query

  if (matchesError) {
    console.error("❌ Error fetching matches:", matchesError)
    process.exit(1)
  }

  console.log(`📊 Total matches: ${matches?.length || 0}\n`)

  if (matches && matches.length > 0) {
    console.log("Sample matches:")
    matches.slice(0, 3).forEach((m, i) => {
      console.log(`\n[${i + 1}]`)
      console.log(`  a_id: ${m.a_id}`)
      console.log(`  b_id: ${m.b_id}`)
      console.log(`  created_at: ${m.created_at}`)
      console.log(`  match_score: ${m.match_score}`)
      console.log(`  match_explanation_text: ${m.match_explanation_text?.substring(0, 100)}...`)
    })

    // Group by user
    const userMatches = new Map<string, number>()
    for (const m of matches) {
      userMatches.set(m.a_id, (userMatches.get(m.a_id) || 0) + 1)
      userMatches.set(m.b_id, (userMatches.get(m.b_id) || 0) + 1)
    }

    console.log(`\n📈 Matches per user:`)
    for (const [userId, count] of userMatches.entries()) {
      console.log(`  ${userId}: ${count} matches`)
    }
  } else {
    console.log("⚠️  No matches found in database")
  }
}

main().catch(console.error)
