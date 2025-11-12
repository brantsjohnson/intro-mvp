#!/usr/bin/env ts-node

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
  console.error('Missing Supabase configuration')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  const args = process.argv.slice(2)
  const skipVerify = args.includes('--no-verify')
  const filteredArgs = args.filter(arg => arg !== '--no-verify')
  const eventCodeArg = filteredArgs[0]

  try {
    let events: { event_id: string; event_code: string; event_name: string }[] = []

    if (eventCodeArg) {
      const { data, error } = await supabase
        .from('events')
        .select('event_id, event_code, event_name')
        .eq('event_code', eventCodeArg.toUpperCase())
        .single()
      if (error || !data) {
        console.error('Event not found for code:', eventCodeArg)
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

    for (const ev of events) {
      console.log(`\n🧹 Deleting system matches for ${ev.event_name} (${ev.event_code})...`)

      const { data: before, error: beforeErr } = await supabase
        .from('connections')
        .select('a_id, b_id')
        .eq('event_id', ev.event_id)
        .eq('connection_kind', 'system_match')
      if (beforeErr) {
        console.error('Error counting before:', beforeErr)
        continue
      }
      console.log(`Found ${before?.length || 0} existing system matches to delete`)

      const { error: delErr } = await supabase
        .from('connections')
        .delete()
        .eq('event_id', ev.event_id)
        .eq('connection_kind', 'system_match')
      if (delErr) {
        console.error('Delete error:', delErr)
        continue
      }

      if (!skipVerify) {
        const { data: after, error: afterErr } = await supabase
          .from('connections')
          .select('a_id, b_id')
          .eq('event_id', ev.event_id)
          .eq('connection_kind', 'system_match')
        if (afterErr) {
          console.error('Error verifying after:', afterErr)
        } else {
          console.log(`✅ Deleted ${(before?.length || 0) - (after?.length || 0)} matches. Remaining: ${after?.length || 0}`)
        }
      } else {
        console.log('⚠️  Verification skipped (--no-verify). Remaining matches were not checked.')
      }
    }

    console.log('\nDone.')
  } catch (err) {
    console.error('Fatal error:', err)
    process.exit(1)
  }
}

main()
