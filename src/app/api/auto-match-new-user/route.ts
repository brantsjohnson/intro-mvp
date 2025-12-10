import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EmailService } from '@/lib/email-service'

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
      .select('id, event_name, is_active, starts_at, ends_at, matchmaking_enabled')
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
        event_id: eventData.id,
        user_id: userId,
        mode: 'incremental',
        use_ai: true // Enable AI when user joins event
      })
    })

    const matchmakerResult = await matchmakerResponse.json()

    if (!matchmakerResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to auto-match user',
        details: matchmakerResult.error
      }, { status: 500 })
    }

    // Count matches and send email notification if matches were created
    const { count: matchCount } = await supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventData.id)
      .eq('connection_kind', 'system_match')
      .or(`a_id.eq.${userId},b_id.eq.${userId}`)

    if (matchCount && matchCount > 0) {
      try {
        const { data: user } = await supabase.auth.admin.getUserById(userId)
        if (user?.user?.email) {
          const emailService = new EmailService()
          await emailService.sendMatchNotification(
            user.user.email,
            eventData.event_name || 'the event',
            matchCount,
            `https://introevent.site?event=${eventData.id}`
          ).catch((error) => {
            console.error('Failed to send match notification email:', error)
          })
        }
      } catch (error) {
        console.error('Error sending match notification:', error)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'New user auto-matched successfully',
      user_id: userId,
      event_code: eventCode,
      event_id: eventData.id,
      match_count: matchCount || 0,
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
