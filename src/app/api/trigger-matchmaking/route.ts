import { NextRequest, NextResponse } from 'next/server'
import { MatchmakingService } from '@/lib/matchmaking-service'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventCode, userId, weights, useQueue = true } = await request.json()
    const usingOpenAI = !!process.env.OPENAI_API_KEY
    
    if (!eventCode) {
      return NextResponse.json({ error: 'eventCode is required' }, { status: 400 })
    }

    const service = new MatchmakingService()
    const eventId = await service.getEventIdFromCode(eventCode)
    if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Ensure matchmaking is enabled for the event
    const { data: eventData } = await supabase.from('events').select('matchmaking_enabled').eq('id', eventId).maybeSingle()
    if (!eventData?.matchmaking_enabled) {
      return NextResponse.json({ error: 'Matchmaking is disabled for this event' }, { status: 400 })
    }

    // Use new queue-based system by default
    if (useQueue) {
      if (userId) {
        // Enqueue specific user
        await supabase.rpc('enqueue_user_matchmaking', {
          p_user_id: userId,
          p_event_id: eventId,
          p_priority: 2
        })
        
        // Trigger matchmaker immediately
        const matchmakerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
        await fetch(matchmakerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ event_id: eventId })
        })
        
        return NextResponse.json({ 
          success: true, 
          message: 'User queued for matchmaking',
          useQueue: true,
          userId,
          eventId
        })
      } else {
        // Enqueue all users in event
        const { data: enqueuedCount, error: enqueueError } = await supabase
          .rpc('enqueue_event_matchmaking', { 
            p_event_id: eventId, 
            p_priority: 0 
          })

        if (enqueueError) {
          throw new Error(`Failed to enqueue users: ${enqueueError.message}`)
        }

        // Trigger matchmaker immediately
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

        return NextResponse.json({ 
          success: true, 
          message: 'Users queued for matchmaking',
          useQueue: true,
          enqueued: enqueuedCount,
          matchmaker_triggered: matchmakerResponse.ok,
          matchmaker_result: matchmakerResult
        })
      }
    }

    // Fallback to legacy system (for backward compatibility)
    if (userId) {
      const ranked = await service.computeTopMatchesForUser(eventId, userId, weights)
      await service.upsertUserMatches(eventId, userId, ranked)
      return NextResponse.json({ success: true, count: ranked.length, matches: ranked, usingOpenAI, useQueue: false })
    }

    // Otherwise, compute for all users in the event (legacy)
    const { data: members, error } = await supabase
      .from('all_events_members')
      .select('user_id')
      .eq('event_id', eventId)

    if (error || !members) {
      return NextResponse.json({ error: 'Failed to load members' }, { status: 500 })
    }

    // Batch to avoid function timeouts - process one user at a time
    let total = 0
    for (const member of members) {
      try {
        const ranked = await service.computeTopMatchesForUser(eventId, member.user_id, weights)
        await service.upsertUserMatches(eventId, member.user_id, ranked)
        total += ranked.length
        console.log(`Processed user ${member.user_id}, total matches: ${total}`)
      } catch (error) {
        console.error(`Error processing user ${member.user_id}:`, error)
        // Continue with next user instead of failing completely
      }
    }

    return NextResponse.json({ success: true, total_records_upserted: total, user_count: members.length, usingOpenAI, useQueue: false })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}


