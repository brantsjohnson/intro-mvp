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

    const { eventId, newUserId } = await request.json()
    
    if (!eventId || !newUserId) {
      return NextResponse.json({ error: 'Event ID and new user ID are required' }, { status: 400 })
    }

    // Check if the new user is actually a member of the event
    const { data: membership, error: membershipError } = await supabase
      .from("event_members")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("user_id", newUserId)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'User is not a member of this event' }, { status: 404 })
    }

    // Refresh matches for the new user
    const matchingService = new MatchingService()
    await matchingService.refreshMatchesForNewUser(eventId, newUserId)

    return NextResponse.json({ 
      message: 'Matches refreshed successfully for new user'
    })

  } catch (error) {
    console.error('Refresh matches API error:', error)
    return NextResponse.json({ 
      error: 'Failed to refresh matches',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
