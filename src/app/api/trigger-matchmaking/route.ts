import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { MatchingService } from '@/lib/matching'

export async function POST(request: NextRequest) {
  try {
    const { eventCode } = await request.json()
    
    if (!eventCode) {
      return NextResponse.json({ error: 'Event code is required' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    
    // Find the event by code
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, code, matchmaking_enabled")
      .eq("code", eventCode.toUpperCase())
      .eq("is_active", true)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found or inactive' }, { status: 404 })
    }

    // Enable matchmaking for the event
    const { error: updateError } = await supabase
      .from("events")
      .update({ matchmaking_enabled: true })
      .eq("id", event.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to enable matchmaking' }, { status: 500 })
    }

    // Generate matches using AI
    const matchingService = new MatchingService()
    const result = await matchingService.generateMatches(event.id)
    
    if (result.matches.length === 0) {
      return NextResponse.json({ 
        message: `Matchmaking enabled for event ${event.name} (${event.code}), but no new matches were generated. This could be because there aren't enough present members or all possible matches already exist.`,
        eventName: event.name,
        eventCode: event.code,
        matches: 0 
      })
    }

    // Save matches to database
    await matchingService.saveMatches(event.id, result.matches)

    return NextResponse.json({ 
      message: `✅ Matchmaking successfully deployed for event ${event.name} (${event.code})! Generated ${result.matches.length} new matches.`,
      eventName: event.name,
      eventCode: event.code,
      matches: result.matches.length,
      details: result.matches.map(match => ({
        summary: match.summary,
        bases: match.bases
      }))
    })

  } catch (error) {
    console.error('Trigger matchmaking API error:', error)
    return NextResponse.json({ 
      error: 'Failed to deploy matchmaking',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
