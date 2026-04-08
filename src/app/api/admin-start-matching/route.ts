import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  createServiceRoleClient,
  requirePlatformAdminForRoute,
} from '@/lib/platform-admin'

export async function POST(request: NextRequest) {
  try {
    const gate = await requirePlatformAdminForRoute()
    if (!gate.ok) return gate.response

    const { eventCode } = await request.json()
    
    if (!eventCode) {
      return NextResponse.json({ error: 'eventCode is required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // Get event ID
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('event_id, event_name, event_code')
      .eq('event_code', eventCode.toUpperCase())
      .single()

    if (eventError || !eventData) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const eventId = eventData.event_id

    // Trigger the matchmaker function directly
    const matchmakerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
    const matchmakerResponse = await fetch(matchmakerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ event_code: eventCode })
    })

    const matchmakerResult = await matchmakerResponse.json()

    return NextResponse.json({
      success: true,
      event: {
        event_id: eventId,
        event_name: eventData.event_name,
        event_code: eventData.event_code
      },
      matchmaker_triggered: matchmakerResponse.ok,
      matchmaker_result: matchmakerResult
    })

  } catch (error: any) {
    console.error('Admin start matching error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}

// GET endpoint to check event status
export async function GET(request: NextRequest) {
  try {
    const gate = await requirePlatformAdminForRoute()
    if (!gate.ok) return gate.response

    const { searchParams } = new URL(request.url)
    const eventCode = searchParams.get('eventCode')

    const supabase = createServiceRoleClient()

    if (eventCode) {
      // Get event details and match count
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('event_id, event_name, event_code')
        .eq('event_code', eventCode.toUpperCase())
        .single()

      if (eventError || !eventData) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      // Get match count for this event
      const { count: matchCount, error: countError } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventData.event_id)
        .eq('connection_kind', 'system_match')

      return NextResponse.json({
        event_code: eventCode,
        event: eventData,
        match_count: matchCount || 0
      })
    } else {
      // Get all events with match counts
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('event_id, event_name, event_code')

      if (eventsError) {
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
      }

      return NextResponse.json({
        events: events || []
      })
    }

  } catch (error: any) {
    console.error('Get event stats error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}