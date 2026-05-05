import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventCode, userId, reason } = await request.json()

    if (!eventCode) {
      return NextResponse.json(
        {
          error: 'eventCode is required',
        },
        { status: 400 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('event_id, event_code, event_name, event_starts_at, event_ends_at')
      .eq('event_code', eventCode.toUpperCase())
      .single()

    if (eventError || !eventData) {
      return NextResponse.json(
        {
          error: 'Event not found',
        },
        { status: 404 },
      )
    }

    const now = new Date()
    const startsAt = eventData.event_starts_at ? new Date(eventData.event_starts_at) : null
    const endsAt = eventData.event_ends_at ? new Date(eventData.event_ends_at) : null
    const isWithinDateRange = (!startsAt || now >= startsAt) && (!endsAt || now <= endsAt)

    if (!isWithinDateRange) {
      return NextResponse.json({
        success: true,
        message: 'Event is outside active date window, skipping smart refresh',
        event_status: {
          is_within_date_range: isWithinDateRange,
        },
      })
    }

    let usersToRefresh: string[] = []

    if (userId) {
      usersToRefresh = [userId]
      console.log(`Smart refresh: user ${userId} marked match as met`)
    } else {
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

      const { data: staleUsers, error: staleError } = await supabase
        .from('connections')
        .select('a_id, b_id')
        .eq('event_id', eventData.event_id)
        .eq('connection_kind', 'system_match')
        .lt('created_at', tenMinutesAgo)
        .order('created_at', { ascending: true })
        .limit(10)

      if (staleError) {
        console.error('Error finding stale users:', staleError)
        return NextResponse.json(
          {
            error: 'Failed to find users needing refresh',
          },
          { status: 500 },
        )
      }

      const allUserIds =
        staleUsers
          ?.flatMap((match) => [match.a_id, match.b_id])
          .filter((id): id is string => typeof id === 'string' && id.length > 0) || []
      usersToRefresh = [...new Set(allUserIds)].slice(0, 5)
      console.log(`Smart refresh: found ${usersToRefresh.length} users needing refresh`)
    }

    if (usersToRefresh.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users need refresh at this time',
        reason: reason || 'periodic_check',
      })
    }

    const results = []
    for (const userIdToRefresh of usersToRefresh) {
      try {
        const matchmakerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
        const matchmakerResponse = await fetch(matchmakerUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_id: eventData.event_id,
            user_id: userIdToRefresh,
            mode: 'incremental',
            use_ai: false,
            force_recompute: true,
          }),
        })

        const matchmakerResult = await matchmakerResponse.json()

        if (matchmakerResponse.ok) {
          results.push({
            user_id: userIdToRefresh,
            status: 'success',
            message: 'Matches refreshed successfully',
          })
        } else {
          results.push({
            user_id: userIdToRefresh,
            status: 'error',
            error: matchmakerResult.error,
          })
        }
      } catch (error: any) {
        results.push({
          user_id: userIdToRefresh,
          status: 'error',
          error: error?.message ?? 'Unknown error',
        })
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    const errorCount = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      success: true,
      message: `Smart refresh completed: ${successCount} successful, ${errorCount} errors`,
      reason: reason || 'periodic_check',
      event_id: eventData.event_id,
      event_code: eventCode,
      processed_users: usersToRefresh.length,
      results,
    })
  } catch (error: any) {
    console.error('Smart refresh error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error?.message,
      },
      { status: 500 },
    )
  }
}
