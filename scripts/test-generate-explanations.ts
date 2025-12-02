#!/usr/bin/env tsx

import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(".env.local") })
config({ path: resolve(".env.deploy") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

async function main() {
  const eventId = process.argv[2]
  const userIds = process.argv[3] ? process.argv[3].split(",") : undefined
  const force = process.argv.includes("--force")

  if (!eventId) {
    console.error("❌ Usage: npx tsx scripts/test-generate-explanations.ts <EVENT_ID> [USER_IDS] [--force]")
    console.error("   Example: npx tsx scripts/test-generate-explanations.ts 3d902d6c-8479-4712-9989-866ed322e292")
    console.error("   Example: npx tsx scripts/test-generate-explanations.ts 3d902d6c-8479-4712-9989-866ed322e292 user1,user2 --force")
    process.exit(1)
  }

  console.log(`🔍 Generating explanations for event: ${eventId}`)
  if (userIds) {
    console.log(`   Filtering to users: ${userIds.join(", ")}`)
  }
  if (force) {
    console.log(`   Force: true (will regenerate existing explanations)`)
  }

  const payload: any = {
    event_id: eventId,
    force: force,
  }

  if (userIds && userIds.length > 0) {
    payload.user_ids = userIds
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-match-explanations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()

  if (!response.ok) {
    console.error(`❌ Error (${response.status}):`, text)
    process.exit(1)
  }

  const result = JSON.parse(text)
  console.log("\n✅ Success!")
  console.log(`   Updated: ${result.updated}`)
  console.log(`   Skipped: ${result.skipped}`)
  console.log(`   Total: ${result.total}`)
  console.log(`   Runtime: ${result.runtime_ms}ms`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


