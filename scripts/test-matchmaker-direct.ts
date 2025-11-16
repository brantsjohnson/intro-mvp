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

async function test() {
  const eventId = process.argv[2] || '3d902d6c-8479-4712-9989-866ed322e292'
  const userId = process.argv[3] || '81242b4e-53f0-0570-c049-93556b40bfcc'
  
  console.log(`Testing matchmaker for event ${eventId}, user ${userId}`)
  
  const matchmakerUrl = `${url}/functions/v1/matchmaker`
  const response = await fetch(matchmakerUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_id: eventId,
      user_id: userId
    })
  })

  const text = await response.text()
  console.log(`Status: ${response.status}`)
  console.log(`Response:`, text)
  
  if (!response.ok) {
    try {
      const json = JSON.parse(text)
      console.error('Error details:', JSON.stringify(json, null, 2))
    } catch {
      console.error('Raw error:', text)
    }
    process.exit(1)
  }
  
  try {
    const result = JSON.parse(text)
    console.log('Success:', JSON.stringify(result, null, 2))
  } catch {
    console.log('Raw result:', text)
  }
}

test()
