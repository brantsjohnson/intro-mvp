import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { MatchingService } from '@/lib/matching'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin (you can customize this logic)
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single()

    if (!profile?.email?.includes("admin") && profile?.email !== "your-admin-email@example.com") {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { eventId } = await request.json()
    
    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
    }

    // Check if event exists and matchmaking is enabled
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, matchmaking_enabled")
      .eq("id", eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!event.matchmaking_enabled) {
      return NextResponse.json({ error: 'Matchmaking is not enabled for this event' }, { status: 400 })
    }

    // Generate matches using AI
    const matchingService = new MatchingService()
    const result = await matchingService.generateMatches(eventId)
    
    if (result.matches.length === 0) {
      return NextResponse.json({ 
        message: 'No new matches generated',
        matches: 0 
      })
    }

    // Save matches to database
    await matchingService.saveMatches(eventId, result.matches)

    return NextResponse.json({ 
      message: 'Matches generated successfully',
      matches: result.matches.length,
      details: result.matches
    })

  } catch (error) {
    console.error('Matchmaking API error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate matches',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
