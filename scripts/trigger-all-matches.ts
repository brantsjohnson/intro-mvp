#!/usr/bin/env tsx
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve('.env.local') })
config({ path: resolve('.env.deploy') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY
const eventId = process.argv[2] || '3d902d6c-8479-4712-9989-866ed322e292'

if (!url || !key) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

async function triggerAllMatches() {
  const supabase = createClient(url, key)
  
  console.log(`🚀 Triggering AI matching for event: ${eventId}\n`)
  
  const { data: attendees } = await supabase
    .from('attendance')
    .select('user_id')
    .eq('event_id', eventId)
  
  const userIds = [...new Set(attendees?.map(a => a.user_id).filter(Boolean) || [])]
  
  console.log(`📊 Found ${userIds.length} users. Processing...\n`)
  
  let success = 0
  let totalCreated = 0
  let errors = 0
  
  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i]
    const progress = `[${i + 1}/${userIds.length}]`
    
    try {
      const response = await fetch(`${url}/functions/v1/matchmaker`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'apikey': key!
        },
        body: JSON.stringify({ event_id: eventId, user_id: userId })
      })
      
      const result = await response.json()
      if (response.ok && result.ok) {
        success++
        const created = result.matches_created || 0
        totalCreated += created
        console.log(`${progress} ✅ ${userId.substring(0, 8)}: ${created} matches created`)
      } else {
        errors++
        console.log(`${progress} ❌ ${userId.substring(0, 8)}: ${result.error || 'Failed'}`)
      }
    } catch (e: any) {
      errors++
      console.log(`${progress} ❌ ${userId.substring(0, 8)}: ${e.message || 'Error'}`)
    }
  }
  
  console.log(`\n✨ Complete!`)
  console.log(`   ✅ Success: ${success}/${userIds.length} users`)
  console.log(`   📊 Total matches created: ${totalCreated}`)
  if (errors > 0) {
    console.log(`   ❌ Errors: ${errors}`)
  }
}

triggerAllMatches().catch(console.error)

