#!/usr/bin/env node

/**
 * Script to update event end time
 * 
 * Usage:
 *   npx tsx scripts/update-event-time.ts <eventId> <newEndTime>
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

async function updateEventTime() {
  // Event ID from the previous creation
  const eventId = 'ceef94ea-eb23-44a4-83e8-5fa0fcd811c2'
  const newEndTime = '2025-12-09T23:00' // 11:00 PM

  console.log('\n🕐 Updating event end time...')
  console.log(`   Event ID: ${eventId}`)
  console.log(`   New End Time: ${newEndTime}`)

  const { data, error } = await supabase
    .from('events')
    .update({
      event_ends_at: newEndTime
    })
    .eq('event_id', eventId)
    .select()
    .single()

  if (error) {
    console.error('❌ Error updating event:', error)
    process.exit(1)
  }

  console.log('\n✅ Event updated successfully!')
  console.log(`   Event Code: ${data.event_code}`)
  console.log(`   Event Name: ${data.event_name}`)
  console.log(`   Starts At: ${data.event_starts_at}`)
  console.log(`   Ends At: ${data.event_ends_at}`)
}

updateEventTime()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error)
    process.exit(1)
  })
