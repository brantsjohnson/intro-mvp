import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { userId, eventCode } = await request.json()
    
    if (!userId || !eventCode) {
      return NextResponse.json({ 
        error: 'userId and eventCode are required' 
      }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get event ID from event code
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, is_active, starts_at, ends_at, matchmaking_enabled')
      .eq('code', eventCode.toUpperCase())
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
        error: 'Event is not live or matchmaking is disabled',
        event_status: {
          is_active: eventData.is_active,
          matchmaking_enabled: eventData.matchmaking_enabled,
          is_within_date_range: now >= startsAt && now <= endsAt,
          starts_at: eventData.starts_at,
          ends_at: eventData.ends_at,
          current_time: now.toISOString()
        }
      }, { status: 400 })
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
        event_code: eventCode,
        user_id: userId,
        auto_match_new_user: true
      })
    })

    const matchmakerResult = await matchmakerResponse.json()

    if (!matchmakerResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to auto-match user',
        details: matchmakerResult.error
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'New user auto-matched successfully',
      user_id: userId,
      event_code: eventCode,
      event_id: eventData.id,
      matchmaker_result: matchmakerResult
    })

  } catch (error: any) {
    console.error('Auto-match new user error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
