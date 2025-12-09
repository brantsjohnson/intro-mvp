#!/usr/bin/env tsx

/**
 * Script to update an event name
 * Usage: npx tsx scripts/update-event-name.ts <eventId> <newEventName>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const eventId = process.argv[2]
const newEventName = process.argv[3]

if (!eventId || !newEventName) {
  console.error('Usage: npx tsx scripts/update-event-name.ts <eventId> <newEventName>')
  console.error('Example: npx tsx scripts/update-event-name.ts 3d902d6c-8479-4712-9989-866ed322e292 "Utah Tech Week"')
  process.exit(1)
}

async function updateEventName() {
  try {
    console.log(`Updating event ${eventId} name to "${newEventName}"...`)
    
    const { data, error } = await supabase
      .from('events')
      .update({ event_name: newEventName })
      .eq('event_id', eventId)
      .select()
      .single()

    if (error) {
      console.error('❌ Error updating event:', error)
      process.exit(1)
    }

    console.log('✅ Event name updated successfully!')
    console.log(`   Event ID: ${data.event_id}`)
    console.log(`   Event Code: ${data.event_code}`)
    console.log(`   Event Name: ${data.event_name}`)
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

updateEventName()

