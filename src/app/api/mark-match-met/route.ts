import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { matchId, userId, eventId } = await request.json()
    
    if (!matchId || !userId || !eventId) {
      return NextResponse.json({ 
        error: 'matchId, userId, and eventId are required' 
      }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Mark the match as met (check both a and b columns for the user)
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .update({ 
        is_met: true,
        met_at: new Date().toISOString()
      })
      .eq('id', matchId)
      .or(`a.eq.${userId},b.eq.${userId}`)
      .select()

    if (matchError) {
      console.error('Error marking match as met:', matchError)
      return NextResponse.json({ 
        error: 'Failed to mark match as met' 
      }, { status: 500 })
    }

    if (!matchData || matchData.length === 0) {
      return NextResponse.json({ 
        error: 'Match not found' 
      }, { status: 404 })
    }

    // Get event code for smart refresh
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('code')
      .eq('id', eventId)
      .single()

    if (eventError || !eventData) {
      console.error('Error fetching event:', eventError)
      return NextResponse.json({ 
        error: 'Failed to fetch event details' 
      }, { status: 500 })
    }

    // Trigger smart refresh for this user to find better matches
    try {
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/smart-refresh-matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          eventCode: eventData.code,
          userId: userId,
          reason: 'user_met_match'
        })
      })

      const refreshResult = await refreshResponse.json()

      return NextResponse.json({
        success: true,
        message: 'Match marked as met and user matches refreshed',
        match_id: matchId,
        user_id: userId,
        event_id: eventId,
        refresh_result: refreshResult
      })
    } catch (refreshError) {
      // Don't fail the whole request if refresh fails
      console.error('Error refreshing matches after marking as met:', refreshError)
      
      return NextResponse.json({
        success: true,
        message: 'Match marked as met (refresh failed)',
        match_id: matchId,
        user_id: userId,
        event_id: eventId,
        refresh_error: refreshError.message
      })
    }

  } catch (error: any) {
    console.error('Mark match met error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
