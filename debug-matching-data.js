// Debug script to check what data the AI matching service is actually receiving
// Run this with: node debug-matching-data.js

const { createClient } = require('@supabase/supabase-js')

// You'll need to set these environment variables or replace with your actual values
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugMatchingData() {
  console.log('🔍 Debugging AI Matching Data for FRESH Event...\n')

  try {
    // 1. Get the FRESH event
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

    console.log('✅ Event found:', event)
    console.log('')

    // 2. Get all members for the event (not just present ones for debugging)
    const { data: allMembers, error: allMembersError } = await supabase
      .from("event_members")
      .select(`
        user_id,
        is_present,
        profiles!inner (
          id,
          first_name,
          last_name,
          job_title,
          company,
          what_do_you_do,
          location,
          mbti,
          enneagram,
          networking_goals
        )
      `)
      .eq("event_id", event.id)

    if (allMembersError) {
      console.error('❌ Error loading all members:', allMembersError)
      return
    }

    console.log(`📊 Total members in FRESH event: ${allMembers.length}`)
    console.log('All members:')
    allMembers.forEach((member, index) => {
      console.log(`  ${index + 1}. ${member.profiles.first_name} ${member.profiles.last_name} (Present: ${member.is_present})`)
    })
    console.log('')

    // 3. Get present members (what the AI actually sees)
    const { data: presentMembers, error: presentMembersError } = await supabase
      .from("event_members")
      .select(`
        user_id,
        is_present,
        profiles!inner (
          id,
          first_name,
          last_name,
          job_title,
          company,
          what_do_you_do,
          location,
          mbti,
          enneagram,
          networking_goals
        )
      `)
      .eq("event_id", event.id)
      .eq("is_present", true)

    if (presentMembersError) {
      console.error('❌ Error loading present members:', presentMembersError)
      return
    }

    console.log(`🎯 Present members (what AI sees): ${presentMembers.length}`)
    if (presentMembers.length < 2) {
      console.log('⚠️  WARNING: Less than 2 present members - AI matching will return empty results!')
      console.log('   This is why no matches were generated.')
      return
    }

    // 4. Get hobbies for all members
    const userIds = presentMembers.map(m => m.user_id)
    const { data: hobbies, error: hobbiesError } = await supabase
      .from("profile_hobbies")
      .select(`
        user_id,
        hobbies!inner (label)
      `)
      .in("user_id", userIds)

    if (hobbiesError) {
      console.error('❌ Error loading hobbies:', hobbiesError)
    } else {
      console.log(`🎨 Hobbies data:`, hobbies)
    }

    // 5. Get expertise for all members
    const { data: expertise, error: expertiseError } = await supabase
      .from("profile_expertise")
      .select(`
        user_id,
        expertise_tags!inner (label)
      `)
      .in("user_id", userIds)

    if (expertiseError) {
      console.error('❌ Error loading expertise:', expertiseError)
    } else {
      console.log(`💼 Expertise data:`, expertise)
    }

    // 6. Get networking goals for the event
    const { data: networkingGoals, error: networkingGoalsError } = await supabase
      .from("event_networking_goals")
      .select("user_id, networking_goals")
      .eq("event_id", event.id)
      .in("user_id", userIds)

    if (networkingGoalsError) {
      console.error('❌ Error loading networking goals:', networkingGoalsError)
    } else {
      console.log(`🎯 Networking goals data:`, networkingGoals)
    }

    // 7. Show what the AI would actually receive
    console.log('\n🤖 Data that would be sent to AI:')
    const profilesWithData = presentMembers.map(member => ({
      id: member.profiles.id,
      first_name: member.profiles.first_name,
      last_name: member.profiles.last_name,
      job_title: member.profiles.job_title,
      company: member.profiles.company,
      what_do_you_do: member.profiles.what_do_you_do,
      location: member.profiles.location,
      mbti: member.profiles.mbti,
      enneagram: member.profiles.enneagram,
      networking_goals: networkingGoals?.find(ng => ng.user_id === member.user_id)?.networking_goals || [],
      hobbies: hobbies?.filter(h => h.user_id === member.user_id).map(h => h.hobbies.label) || [],
      expertise: expertise?.filter(e => e.user_id === member.user_id).map(e => e.expertise_tags.label) || []
    }))

    profilesWithData.forEach((profile, index) => {
      console.log(`\n👤 Profile ${index + 1}: ${profile.first_name} ${profile.last_name}`)
      console.log(`   Job: ${profile.job_title || 'Not specified'} at ${profile.company || 'Not specified'}`)
      console.log(`   What they do: ${profile.what_do_you_do || 'Not specified'}`)
      console.log(`   Location: ${profile.location || 'Not specified'}`)
      console.log(`   MBTI: ${profile.mbti || 'Not specified'}`)
      console.log(`   Enneagram: ${profile.enneagram || 'Not specified'}`)
      console.log(`   Networking Goals: ${profile.networking_goals.length > 0 ? profile.networking_goals.join(', ') : 'None'}`)
      console.log(`   Hobbies: ${profile.hobbies.length > 0 ? profile.hobbies.join(', ') : 'None'}`)
      console.log(`   Expertise: ${profile.expertise.length > 0 ? profile.expertise.join(', ') : 'None'}`)
    })

    // 8. Check for existing matches
    const { data: existingMatches, error: existingMatchesError } = await supabase
      .from("matches")
      .select("a, b, bases, summary")
      .eq("event_id", event.id)

    if (existingMatchesError) {
      console.error('❌ Error loading existing matches:', existingMatchesError)
    } else {
      console.log(`\n🔗 Existing matches: ${existingMatches.length}`)
      existingMatches.forEach((match, index) => {
        console.log(`   ${index + 1}. ${match.a} <-> ${match.b} (${match.bases.join(', ')})`)
      })
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

debugMatchingData()
