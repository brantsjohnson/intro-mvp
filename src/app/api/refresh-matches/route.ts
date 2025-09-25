import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventId, newUserId } = await request.json()
    
    if (!eventId || !newUserId) {
      return NextResponse.json({ 
        error: 'eventId and newUserId are required' 
      }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get event details
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('code, is_active, starts_at, ends_at, matchmaking_enabled')
      .eq('id', eventId)
      .single()

    if (eventError || !eventData) {
      return NextResponse.json({ 
        error: 'Event not found' 
      }, { status: 404 })
    }

    // Check if event is live
    const now = new Date()
    const startsAt = new Date(eventData.starts_at)
    const endsAt = new Date(eventData.ends_at)
    
    const isEventLive = eventData.is_active && 
                       eventData.matchmaking_enabled && 
                       now >= startsAt && 
                       now <= endsAt

    if (!isEventLive) {
      return NextResponse.json({ 
        success: true,
        message: 'Event is not live, skipping auto-matching',
        event_status: {
          is_active: eventData.is_active,
          matchmaking_enabled: eventData.matchmaking_enabled,
          is_within_date_range: now >= startsAt && now <= endsAt
        }
      })
    }

    // Call the Edge Function to auto-match the new user
    const matchmakerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
    const matchmakerResponse = await fetch(matchmakerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        event_id: eventId,
        user_id: newUserId,
        auto_match_new_user: true
      })
    })

    const matchmakerResult = await matchmakerResponse.json()

    if (!matchmakerResponse.ok) {
      console.error('Auto-match failed:', matchmakerResult)
      return NextResponse.json({ 
        success: false,
        error: 'Failed to auto-match user',
        details: matchmakerResult.error
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'New user auto-matched successfully',
      user_id: newUserId,
      event_id: eventId,
      event_code: eventData.code,
      matchmaker_result: matchmakerResult
    })

  } catch (error: any) {
    console.error('Refresh matches error:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
