#!/usr/bin/env node

/**
 * Script to create a test event for Brant and Alex
 * 
 * Usage:
 *   npx tsx scripts/create-test-event.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: join(__dirname, '..', '.env.local') })

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
console.log(`\n🔗 Supabase URL: ${supabaseUrl}`)

async function createTestEvent() {
  // Event details
  // Note: "Wahoo" is 5 characters, but API requires 6. Using "WAHOO" directly.
  // If database constraint fails, we'll pad it to 6 characters.
  let eventCode = 'WAHOO'
  const eventName = 'Test just for Brant and Alex'
  const eventLocation = 'Ur mom'
  // Dec 9, 2025 from 21:00-22:00
  const eventStartsAt = '2025-12-09T21:00'
  const eventEndsAt = '2025-12-09T22:00'

  console.log('\n📅 Creating test event...')
  console.log(`   Code: ${eventCode}`)
  console.log(`   Name: ${eventName}`)
  console.log(`   Location: ${eventLocation}`)
  console.log(`   Starts: ${eventStartsAt}`)
  console.log(`   Ends: ${eventEndsAt}`)

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_code: eventCode,
      event_name: eventName,
      event_location: eventLocation,
      event_starts_at: eventStartsAt,
      event_ends_at: eventEndsAt,
      onboarding_question_schema: {},
      matching_config: {}
    })
    .select()
    .single()

  if (error) {
    // If error is about code length, try padding to 6 characters
    if (error.message?.includes('length') || error.message?.includes('6')) {
      console.log('\n⚠️  Event code length issue, trying with padded code...')
      eventCode = 'WAHOOX' // Pad to 6 characters
      
      const { data: retryData, error: retryError } = await supabase
        .from('events')
        .insert({
          event_code: eventCode,
          event_name: eventName,
          event_location: eventLocation,
          event_starts_at: eventStartsAt,
          event_ends_at: eventEndsAt,
          onboarding_question_schema: {},
          matching_config: {}
        })
        .select()
        .single()

      if (retryError) {
        console.error('❌ Error creating event (retry):', retryError)
        if (retryError.code === '23505') {
          console.error(`   Event code ${eventCode} already exists`)
        }
        process.exit(1)
      }

      console.log('\n✅ Event created successfully (with padded code)!')
      console.log(`   Event ID: ${retryData.event_id}`)
      console.log(`   Event Code: ${retryData.event_code}`)
      console.log(`   Event Name: ${retryData.event_name}`)
      console.log(`   Location: ${retryData.event_location}`)
      console.log(`   Starts At: ${retryData.event_starts_at}`)
      console.log(`   Ends At: ${retryData.event_ends_at}`)
      return
    }

    console.error('❌ Error creating event:', error)
    if (error.code === '23505') {
      console.error(`   Event code ${eventCode} already exists`)
    }
    process.exit(1)
  }

  console.log('\n✅ Event created successfully!')
  console.log(`   Event ID: ${data.event_id}`)
  console.log(`   Event Code: ${data.event_code}`)
  console.log(`   Event Name: ${data.event_name}`)
  console.log(`   Location: ${data.event_location}`)
  console.log(`   Starts At: ${data.event_starts_at}`)
  console.log(`   Ends At: ${data.event_ends_at}`)
}

createTestEvent()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error)
    process.exit(1)
  })
