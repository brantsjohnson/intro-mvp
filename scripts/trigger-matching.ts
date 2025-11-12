#!/usr/bin/env ts-node
/**
 * Script to trigger AI matching for all events (or a specific event code)
 * Usage: npx tsx scripts/trigger-matching.ts [eventCode]
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function triggerMatching(eventCode?: string) {
  try {
    let events: { event_id: string; event_code: string; event_name: string }[] = []

    if (eventCode) {
      const { data, error } = await supabase
        .from('events')
        .select('event_id, event_code, event_name')
        .eq('event_code', eventCode.toUpperCase())
        .single()

      if (error || !data) {
        console.error(`Event not found: ${eventCode}`)
        process.exit(1)
      }
      events = [data]
    } else {
      const { data, error } = await supabase
        .from('events')
        .select('event_id, event_code, event_name')

      if (error) {
        console.error('Error fetching events:', error)
        process.exit(1)
      }
      events = data || []
    }

    if (events.length === 0) {
      console.log('No events found')
      return
    }

    console.log(`Found ${events.length} event(s). Starting matching...\n`)

    for (const event of events) {
      console.log(`\n🎯 Processing: ${event.event_name} (${event.event_code})`)

      const matchmakerUrl = `${supabaseUrl}/functions/v1/matchmaker`
      const response = await fetch(matchmakerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: event.event_id,
          event_code: event.event_code
        })
      })

      const result = await response.json()

      if (response.ok) {
        console.log(`✅ Success! Processed ${result.processed || 0} users`)
        if (result.errors > 0) {
          console.log(`⚠️  ${result.errors} errors occurred`)
        }
      } else {
        console.error('❌ Error:', result.error || result)
        if (result.details) {
          console.error('Details:', result.details)
        }
      }
    }

    console.log('\n✨ Matching complete!')
  } catch (error: any) {
    console.error('Fatal error:', error.message)
    process.exit(1)
  }
}

const eventCode = process.argv[2]
triggerMatching(eventCode)
