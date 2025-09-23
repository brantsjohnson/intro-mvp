const { createClient } = require('@supabase/supabase-js')

// Use the anon key from the environment
const supabaseUrl = 'https://szrznjvllslymamzecyq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cnpuanZsbHNseW1hbXplY3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0OTQxNDMsImV4cCI6MjA3NDA3MDE0M30.WQpvus7uonb0a0MYhQ1KZYw5uU4Xuu_ZnHMmXbifzCs'

const supabase = createClient(supabaseUrl, supabaseKey)

async function triggerMatchmaking() {
  try {
    console.log('🔍 Looking for FRESH event...')
    
    // Find the FRESH event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, code, matchmaking_enabled")
      .eq("code", "FRESH")
      .eq("is_active", true)
      .single()

    if (eventError || !event) {
      console.error('❌ Event not found:', eventError)
      return
    }

    console.log('✅ Found event:', event.name, '(', event.code, ')')
    console.log('📊 Matchmaking enabled:', event.matchmaking_enabled)

    // Enable matchmaking if not already enabled
    if (!event.matchmaking_enabled) {
      console.log('🔧 Enabling matchmaking...')
      const { error: updateError } = await supabase
        .from("events")
        .update({ matchmaking_enabled: true })
        .eq("id", event.id)

      if (updateError) {
        console.error('❌ Failed to enable matchmaking:', updateError)
        return
      }
      console.log('✅ Matchmaking enabled')
    }

    // Get event members
    console.log('👥 Loading event members...')
    const { data: members, error: membersError } = await supabase
      .from("event_members")
      .select(`
        user_id,
        profiles!inner (
          id,
          first_name,
          last_name,
          job_title,
          company
        )
      `)
      .eq("event_id", event.id)

    // Also try without the inner join to see if there are members without profiles
    const { data: allMembers, error: allMembersError } = await supabase
      .from("event_members")
      .select("user_id")
      .eq("event_id", event.id)

    console.log('📊 All members (including those without profiles):', allMembers?.length || 0)
    if (allMembers) {
      allMembers.forEach(member => {
        console.log(`  - User ID: ${member.user_id}`)
      })
    }

    if (membersError) {
      console.error('❌ Failed to load members:', membersError)
    }

    console.log(`👥 Found ${members.length} members:`)
    if (members) {
      members.forEach(member => {
        console.log(`  - ${member.profiles.first_name} ${member.profiles.last_name} (${member.profiles.job_title})`)
      })
    }

    if (members.length < 2) {
      console.log('⚠️  Not enough members for matchmaking (need at least 2)')
      console.log('🔍 Continuing to check system status...')
    }

    // Get existing matches
    const { data: existingMatches } = await supabase
      .from("matches")
      .select("a, b, bases, summary")
      .eq("event_id", event.id)

    console.log(`🔗 Found ${existingMatches.length} existing matches`)

    // Check if there are any users in the system
    console.log('👤 Checking for users in the system...')
    const { data: allUsers, error: usersError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, job_title, company")
      .limit(10)

    if (usersError) {
      console.error('❌ Failed to load users:', usersError)
    } else {
      console.log(`👤 Found ${allUsers.length} users in the system:`)
      allUsers.forEach(user => {
        console.log(`  - ${user.first_name} ${user.last_name} (${user.job_title})`)
      })
    }

    // Check if there are any event members in any events
    console.log('📅 Checking for event members in any events...')
    const { data: allEventMembers, error: allEventMembersError } = await supabase
      .from("event_members")
      .select(`
        event_id,
        user_id,
        profiles!inner (first_name, last_name)
      `)
      .limit(10)

    if (allEventMembersError) {
      console.error('❌ Failed to load event members:', allEventMembersError)
    } else {
      console.log(`📅 Found ${allEventMembers.length} event members across all events:`)
      allEventMembers.forEach(member => {
        console.log(`  - ${member.profiles.first_name} ${member.profiles.last_name} in event ${member.event_id}`)
      })
    }

    if (members.length >= 2) {
      // Trigger the API endpoint
      console.log('🚀 Triggering matchmaking API...')
      const response = await fetch('https://intro-mvp.vercel.app/api/trigger-matchmaking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventCode: 'FRESH' })
      })

      const result = await response.json()
      console.log('📋 API Response:', result)
    } else {
      console.log('❌ Cannot trigger matchmaking - not enough members in FRESH event')
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

triggerMatchmaking()
