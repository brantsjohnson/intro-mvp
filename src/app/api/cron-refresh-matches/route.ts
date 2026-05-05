import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedAuth = process.env.CRON_SECRET || 'your-cron-secret'

    if (authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        { status: 401 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: eventRows, error: eventsError } = await supabase
      .from('events')
      .select('event_id, event_code, event_name, event_starts_at, event_ends_at')

    if (eventsError) {
      console.error('Error fetching events for cron refresh:', eventsError)
      return NextResponse.json(
        {
          error: 'Failed to fetch events',
        },
        { status: 500 },
      )
    }

    const nowTs = Date.now()
    const liveEvents = (eventRows || []).filter((event) => {
      const startsAt = event.event_starts_at ? new Date(event.event_starts_at).getTime() : null
      const endsAt = event.event_ends_at ? new Date(event.event_ends_at).getTime() : null
      const startsOk = startsAt == null || nowTs >= startsAt
      const endsOk = endsAt == null || nowTs <= endsAt
      return startsOk && endsOk
    })

    if (liveEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No live events found',
        processed_events: 0,
      })
    }

    console.log(`Cron refresh: found ${liveEvents.length} live events`)

    const eventResults = []
    for (const event of liveEvents) {
      try {
        const refreshResponse = await fetch(`${request.nextUrl.origin}/api/smart-refresh-matches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventCode: event.event_code,
            reason: 'cron_periodic_refresh',
          }),
        })

        const refreshResult = await refreshResponse.json()
        eventResults.push({
          event_code: event.event_code,
          event_name: event.event_name,
          success: refreshResponse.ok,
          result: refreshResult,
        })

        console.log(`Cron refresh: processed event ${event.event_code}`)
      } catch (error: any) {
        eventResults.push({
          event_code: event.event_code,
          event_name: event.event_name,
          success: false,
          error: error?.message ?? 'Unknown error',
        })
        console.error(`Cron refresh: failed for event ${event.event_code}`, error)
      }
    }

    const successCount = eventResults.filter((r) => r.success).length
    const errorCount = eventResults.filter((r) => !r.success).length

    return NextResponse.json({
      success: true,
      message: `Cron job completed: ${successCount} successful, ${errorCount} errors`,
      timestamp: new Date().toISOString(),
      processed_events: liveEvents.length,
      results: eventResults,
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error?.message,
      },
      { status: 500 },
    )
  }
}
