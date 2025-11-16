#!/usr/bin/env tsx

import { config } from "dotenv"
import { resolve } from "node:path"

const envFiles = [".env.deploy", ".env.local"]
for (const file of envFiles) {
  try {
    config({ path: resolve(file) })
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

async function main() {
  const userId = process.argv[2] || "13281143-05cf-495b-882f-bef357d4ce4b"
  const eventCode = process.argv[3] || "TEST12"
  
  console.log(`🔍 Testing matchmaker for user: ${userId}`)
  console.log(`🔍 Event: ${eventCode}\n`)

  // Get event ID
  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_code", eventCode.toUpperCase())
    .single()

  if (eventError || !event) {
    console.error(`❌ Event not found: ${eventCode}`)
    process.exit(1)
  }

  const eventId = event.event_id
  console.log(`✅ Event ID: ${eventId}\n`)

  // Call matchmaker
  const matchmakerUrl = `${SUPABASE_URL}/functions/v1/matchmaker`
  console.log(`🚀 Calling matchmaker...\n`)

  const response = await fetch(matchmakerUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      event_id: eventId,
      user_id: userId,
    }),
  })

  const result = await response.json()
  
  console.log(`Response status: ${response.status}`)
  console.log(`Response body:`)
  console.log(JSON.stringify(result, null, 2))

  // Check matches after
  const { data: matches } = await supabase
    .from("connections")
    .select("*")
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)

  console.log(`\n📊 Matches in database after: ${matches?.length || 0}`)
  if (matches && matches.length > 0) {
    matches.forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.a_id === userId ? m.b_id : m.a_id}`)
    })
  }
}

main().catch(console.error)


