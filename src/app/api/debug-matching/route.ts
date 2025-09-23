import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Get the FRESH event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, code, matchmaking_enabled")
      .eq("code", "FRESH")
      .eq("is_active", true)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found', details: eventError }, { status: 404 })
    }

    // Get all members for the event (not just present ones for debugging)
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
      return NextResponse.json({ error: 'Error loading all members', details: allMembersError }, { status: 500 })
    }

    // Get present members (what the AI actually sees)
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
      return NextResponse.json({ error: 'Error loading present members', details: presentMembersError }, { status: 500 })
    }

    // Get hobbies for all members
    const userIds = presentMembers.map(m => m.user_id)
    const { data: hobbies, error: hobbiesError } = await supabase
      .from("profile_hobbies")
      .select(`
        user_id,
        hobbies!inner (label)
      `)
      .in("user_id", userIds)

    // Get expertise for all members
    const { data: expertise, error: expertiseError } = await supabase
      .from("profile_expertise")
      .select(`
        user_id,
        expertise_tags!inner (label)
      `)
      .in("user_id", userIds)

    // Get networking goals for the event
    const { data: networkingGoals, error: networkingGoalsError } = await supabase
      .from("event_networking_goals")
      .select("user_id, networking_goals")
      .eq("event_id", event.id)
      .in("user_id", userIds)

    // Get existing matches
    const { data: existingMatches, error: existingMatchesError } = await supabase
      .from("matches")
      .select("a, b, bases, summary")
      .eq("event_id", event.id)

    // Show what the AI would actually receive
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

    return NextResponse.json({
      event,
      summary: {
        totalMembers: allMembers.length,
        presentMembers: presentMembers.length,
        hasEnoughForMatching: presentMembers.length >= 2
      },
      allMembers: allMembers.map(m => ({
        name: `${m.profiles.first_name} ${m.profiles.last_name}`,
        is_present: m.is_present,
        user_id: m.user_id
      })),
      presentMembers: presentMembers.map(m => ({
        name: `${m.profiles.first_name} ${m.profiles.last_name}`,
        user_id: m.user_id
      })),
      dataForAI: profilesWithData,
      relatedData: {
        hobbies: hobbies || [],
        expertise: expertise || [],
        networkingGoals: networkingGoals || [],
        existingMatches: existingMatches || []
      },
      errors: {
        hobbiesError: hobbiesError?.message,
        expertiseError: expertiseError?.message,
        networkingGoalsError: networkingGoalsError?.message,
        existingMatchesError: existingMatchesError?.message
      }
    })

  } catch (error) {
    console.error('Debug matching API error:', error)
    return NextResponse.json({ 
      error: 'Failed to debug matching data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
