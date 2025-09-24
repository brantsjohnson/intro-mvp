import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventCode, priority = 0, force = false } = await request.json()
    
    if (!eventCode) {
      return NextResponse.json({ error: 'eventCode is required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get event ID
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, name, matchmaking_enabled')
      .eq('code', eventCode.toUpperCase())
      .single()

    if (eventError || !eventData) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!eventData.matchmaking_enabled && !force) {
      return NextResponse.json({ 
        error: 'Matchmaking is disabled for this event. Use force=true to override.' 
      }, { status: 400 })
    }

    const eventId = eventData.id

    // Enqueue all users in the event
    const { data: enqueuedCount, error: enqueueError } = await supabase
      .rpc('enqueue_event_matchmaking', { 
        p_event_id: eventId, 
        p_priority: priority 
      })

    if (enqueueError) {
      console.error('Enqueue error:', enqueueError)
      return NextResponse.json({ 
        error: 'Failed to enqueue users', 
        details: enqueueError.message 
      }, { status: 500 })
    }

    // Trigger the matchmaker function immediately
    const matchmakerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
    const matchmakerResponse = await fetch(matchmakerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ event_id: eventId })
    })

    const matchmakerResult = await matchmakerResponse.json()

    // Get queue stats
    const { data: queueStats, error: statsError } = await supabase
      .rpc('get_matchmaking_queue_stats', { p_event_id: eventId })

    return NextResponse.json({
      success: true,
      event: {
        id: eventId,
        name: eventData.name,
        code: eventCode
      },
      enqueued: enqueuedCount,
      matchmaker_triggered: matchmakerResponse.ok,
      matchmaker_result: matchmakerResult,
      queue_stats: queueStats?.[0] || null
    })

  } catch (error: any) {
    console.error('Admin start matching error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}

// GET endpoint to check queue status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventCode = searchParams.get('eventCode')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    if (eventCode) {
      // Get stats for specific event
      const { data: eventData } = await supabase
        .from('events')
        .select('id')
        .eq('code', eventCode.toUpperCase())
        .single()

      if (!eventData) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      const { data: queueStats, error: statsError } = await supabase
        .rpc('get_matchmaking_queue_stats', { p_event_id: eventData.id })

      return NextResponse.json({
        event_code: eventCode,
        stats: queueStats?.[0] || null
      })
    } else {
      // Get stats for all events
      const { data: allStats, error: statsError } = await supabase
        .rpc('get_matchmaking_queue_stats')

      return NextResponse.json({
        all_events: allStats || []
      })
    }

  } catch (error: any) {
    console.error('Get queue stats error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}