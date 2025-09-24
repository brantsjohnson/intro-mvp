#!/usr/bin/env node

// Test script for the new queue-based matchmaking system
// Run with: node test-matchmaking.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL')
  console.error('   SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function testMatchmaking() {
  console.log('🧪 Testing Queue-Based Matchmaking System\n')

  // Test 1: Check if Edge Function exists
  console.log('1️⃣ Testing Edge Function availability...')
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/matchmaker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    const result = await response.json()
    if (response.ok) {
      console.log('✅ Edge Function is accessible')
      console.log(`   Response: ${result.msg || 'OK'}`)
    } else {
      console.log('❌ Edge Function error:', result.error)
    }
  } catch (error) {
    console.log('❌ Edge Function not accessible:', error.message)
  }

  // Test 2: Check database functions
  console.log('\n2️⃣ Testing database functions...')
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_matchmaking_queue_stats`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    if (response.ok) {
      const stats = await response.json()
      console.log('✅ Database functions are accessible')
      console.log(`   Found ${stats.length} events with matchmaking enabled`)
    } else {
      console.log('❌ Database functions error:', await response.text())
    }
  } catch (error) {
    console.log('❌ Database functions not accessible:', error.message)
  }

  // Test 3: Test manual trigger (if event code provided)
  const eventCode = process.argv[2]
  if (eventCode) {
    console.log(`\n3️⃣ Testing manual trigger for event: ${eventCode}`)
    try {
      const response = await fetch('http://localhost:3000/api/admin-start-matching', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ eventCode })
      })
      
      const result = await response.json()
      if (response.ok) {
        console.log('✅ Manual trigger successful')
        console.log(`   Event: ${result.event?.name}`)
        console.log(`   Enqueued: ${result.enqueued} users`)
        console.log(`   Matchmaker triggered: ${result.matchmaker_triggered}`)
      } else {
        console.log('❌ Manual trigger error:', result.error)
      }
    } catch (error) {
      console.log('❌ Manual trigger failed:', error.message)
      console.log('   Make sure your Next.js app is running on localhost:3000')
    }
  } else {
    console.log('\n3️⃣ Skipping manual trigger test (no event code provided)')
    console.log('   Usage: node test-matchmaking.js EVENT_CODE')
  }

  console.log('\n📋 Next Steps:')
  console.log('1. Deploy the database migrations')
  console.log('2. Deploy the Edge Function: supabase functions deploy matchmaker')
  console.log('3. Set environment variables in Supabase')
  console.log('4. Set up the cron job for automatic processing')
  console.log('5. Test with a real event code')
  
  console.log('\n📖 See MATCHMAKING_DEPLOYMENT.md for detailed instructions')
}

testMatchmaking().catch(console.error)
