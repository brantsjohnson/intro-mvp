#!/usr/bin/env tsx

import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

// Load environment variables
const envFiles = [".env.deploy", ".env.production.local", ".env.local"]
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log("🔍 Fetching events...\n")
  
  const { data: events, error } = await supabase
    .from("events")
    .select("event_id, event_name, event_code")
    .limit(20)

  if (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }

  if (!events || events.length === 0) {
    console.log("⚠️  No events found")
    return
  }

  console.log(`📋 Found ${events.length} event(s):\n`)
  events.forEach((event, i) => {
    console.log(`${i + 1}. ${event.event_name}`)
    console.log(`   Code: ${event.event_code}`)
    console.log(`   ID: ${event.event_id}`)
    console.log("")
  })

  console.log("\n💡 To run matchmaker, use:")
  console.log(`   npx tsx scripts/run-matchmaker.ts <EVENT_CODE>`)
}

main().catch(console.error)

