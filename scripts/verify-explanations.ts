#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve('.env.local') })
config({ path: resolve('.env.deploy') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  const eventId = process.argv[2] || '3d902d6c-8479-4712-9989-866ed322e292'
  
  const { data, error } = await supabase
    .from('connections')
    .select('match_explanation_text, created_at')
    .eq('event_id', eventId)
    .eq('connection_kind', 'system_match')
    .not('match_explanation_text', 'is', null)
    .limit(5)

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log(`Found ${data?.length || 0} connections with explanations`)
  if (data && data.length > 0) {
    console.log('\nSample explanations:')
    data.slice(0, 3).forEach((conn, i) => {
      console.log(`\n${i + 1}. ${conn.match_explanation_text?.substring(0, 100)}...`)
    })
  }
}

main()
