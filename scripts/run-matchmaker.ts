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

async function matchEvent(event: { event_id: string; event_name: string; event_code: string }) {
  console.log(`\n🎯 Processing event: ${event.event_name} (${event.event_code})`)
  console.log(`📋 Getting all users in this event...`)

  // Get all users who have attendance for this event
  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance")
    .select("user_id")
    .eq("event_id", event.event_id)

  if (attendanceError) {
    console.error("❌ Error fetching attendance:", attendanceError)
    return { success: 0, errors: 1 }
  }

  if (!attendance || attendance.length === 0) {
    console.log("⚠️  No users found in this event")
    return { success: 0, errors: 0 }
  }

  const userIds = [...new Set(attendance.map(a => a.user_id))]
  console.log(`📊 Found ${userIds.length} unique users`)
  console.log(`🚀 Starting AI-based matching for all users...\n`)

  const matchmakerUrl = `${SUPABASE_URL}/functions/v1/matchmaker`
  let successCount = 0
  let errorCount = 0
  const errors: string[] = []

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i]
    const progress = `[${i + 1}/${userIds.length}]`
    
    try {
      console.log(`${progress} Processing user ${userId}...`)
      
      const response = await fetch(matchmakerUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          event_id: event.event_id,
          user_id: userId,
          force_recompute: true, // Force rematch
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`   ❌ Failed: ${errorText.substring(0, 100)}`)
        errorCount++
        errors.push(`User ${userId}: ${errorText.substring(0, 200)}`)
        continue
      }

      const result = await response.json()
      if (result.ok && result.processed > 0) {
        console.log(`   ✅ Created ${result.processed} matches (${result.inserted || 0} inserted)`)
        successCount++
      } else {
        console.log(`   ⚠️  No matches created`)
        errorCount++
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`)
      errorCount++
      errors.push(`User ${userId}: ${error.message}`)
    }
  }

  console.log(`\n✨ Event ${event.event_code} complete!`)
  console.log(`   ✅ Success: ${successCount} users`)
  console.log(`   ❌ Errors: ${errorCount} users`)
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors:`)
    errors.slice(0, 5).forEach(err => console.log(`   - ${err}`))
    if (errors.length > 5) {
      console.log(`   ... and ${errors.length - 5} more`)
    }
  }

  return { success: successCount, errors: errorCount }
}

async function main() {
  const eventCode = process.argv[2]
  
  let events: Array<{ event_id: string; event_name: string; event_code: string }> = []

  if (eventCode) {
    // Single event mode
    console.log(`🔍 Looking up event: ${eventCode}`)
    
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("event_id, event_name, event_code")
      .eq("event_code", eventCode.toUpperCase())
      .single()

    if (eventError || !event) {
      console.error(`❌ Event not found: ${eventCode}`)
      process.exit(1)
    }

    events = [event]
  } else {
    // All events mode
    console.log(`🔍 Fetching all events...`)
    
    const { data: allEvents, error: eventsError } = await supabase
      .from("events")
      .select("event_id, event_name, event_code")
      .order("event_starts_at", { ascending: false })

    if (eventsError) {
      console.error("❌ Error fetching events:", eventsError)
      process.exit(1)
    }

    if (!allEvents || allEvents.length === 0) {
      console.log("⚠️  No events found")
      return
    }

    events = allEvents
    console.log(`✅ Found ${events.length} event(s)\n`)
  }

  let totalSuccess = 0
  let totalErrors = 0

  for (const event of events) {
    const result = await matchEvent(event)
    totalSuccess += result.success
    totalErrors += result.errors
  }

  console.log(`\n\n🎉 All events complete!`)
  console.log(`   ✅ Total Success: ${totalSuccess} users`)
  console.log(`   ❌ Total Errors: ${totalErrors} users`)
}

main().catch(console.error)



