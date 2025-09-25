import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventCode, userId, reason } = await request.json()
    
    if (!eventCode) {
      return NextResponse.json({ 
        error: 'eventCode is required' 
      }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get event details
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
        success: true,
        message: 'Event is not live, skipping smart refresh',
        event_status: {
          is_active: eventData.is_active,
          matchmaking_enabled: eventData.matchmaking_enabled,
          is_within_date_range: now >= startsAt && now <= endsAt
        }
      })
    }

    let usersToRefresh = []

    if (userId) {
      // Specific user refresh (when they mark a match as met)
      usersToRefresh = [userId]
      console.log(`🔄 Smart refresh: User ${userId} marked match as met`)
    } else {
      // Periodic refresh - find users who might need better matches
      // Get users who haven't had matches updated in the last 10 minutes
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
      
      const { data: staleUsers, error: staleError } = await supabase
        .from('matches')
        .select('a, b')
        .eq('event_id', eventData.id)
        .lt('created_at', tenMinutesAgo)
        .order('created_at', { ascending: true })
        .limit(10) // Get 10 matches to find unique users

      if (staleError) {
        console.error('Error finding stale users:', staleError)
        return NextResponse.json({ 
          error: 'Failed to find users needing refresh' 
        }, { status: 500 })
      }

      // Extract unique user IDs from both a and b columns
      const allUserIds = staleUsers?.flatMap(match => [match.a, match.b]) || []
      usersToRefresh = [...new Set(allUserIds)].slice(0, 5) // Only refresh 5 users at a time
      console.log(`🔄 Smart refresh: Found ${usersToRefresh.length} users needing refresh`)
    }

    if (usersToRefresh.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users need refresh at this time',
        reason: reason || 'periodic_check'
      })
    }

    // Process each user that needs refresh
    const results = []
    for (const userIdToRefresh of usersToRefresh) {
      try {
        // Call the Edge Function to refresh this specific user
        const matchmakerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
        const matchmakerResponse = await fetch(matchmakerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            event_id: eventData.id,
            user_id: userIdToRefresh,
            auto_match_new_user: true
          })
        })

        const matchmakerResult = await matchmakerResponse.json()

        if (matchmakerResponse.ok) {
          results.push({
            user_id: userIdToRefresh,
            status: 'success',
            message: 'Matches refreshed successfully'
          })
        } else {
          results.push({
            user_id: userIdToRefresh,
            status: 'error',
            error: matchmakerResult.error
          })
        }
      } catch (error) {
        results.push({
          user_id: userIdToRefresh,
          status: 'error',
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const errorCount = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      success: true,
      message: `Smart refresh completed: ${successCount} successful, ${errorCount} errors`,
      reason: reason || 'periodic_check',
      event_id: eventData.id,
      event_code: eventCode,
      processed_users: usersToRefresh.length,
      results: results
    })

  } catch (error: any) {
    console.error('Smart refresh error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
