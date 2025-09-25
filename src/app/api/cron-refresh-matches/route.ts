import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request (you can add auth here)
    const authHeader = request.headers.get('authorization')
    const expectedAuth = process.env.CRON_SECRET || 'your-cron-secret'
    
    if (authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get all active events that are currently live
    const now = new Date().toISOString()
    
    const { data: liveEvents, error: eventsError } = await supabase
      .from('events')
      .select('id, code, name')
      .eq('is_active', true)
      .eq('matchmaking_enabled', true)
      .lte('starts_at', now)
      .gte('ends_at', now)

    if (eventsError) {
      console.error('Error fetching live events:', eventsError)
      return NextResponse.json({ 
        error: 'Failed to fetch live events' 
      }, { status: 500 })
    }

    if (!liveEvents || liveEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No live events found',
        processed_events: 0
      })
    }

    console.log(`🕐 Cron job: Found ${liveEvents.length} live events`)

    // Process each live event
    const eventResults = []
    for (const event of liveEvents) {
      try {
        // Call the smart refresh endpoint for this event
        const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/smart-refresh-matches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            eventCode: event.code,
            reason: 'cron_periodic_refresh'
          })
        })

        const refreshResult = await refreshResponse.json()

        eventResults.push({
          event_code: event.code,
          event_name: event.name,
          success: refreshResponse.ok,
          result: refreshResult
        })

        console.log(`✅ Processed event ${event.code}: ${refreshResult.message}`)
      } catch (error) {
        eventResults.push({
          event_code: event.code,
          event_name: event.name,
          success: false,
          error: error.message
        })
        console.error(`❌ Error processing event ${event.code}:`, error)
      }
    }

    const successCount = eventResults.filter(r => r.success).length
    const errorCount = eventResults.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      message: `Cron job completed: ${successCount} events processed successfully, ${errorCount} errors`,
      timestamp: new Date().toISOString(),
      processed_events: liveEvents.length,
      results: eventResults
    })

  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
