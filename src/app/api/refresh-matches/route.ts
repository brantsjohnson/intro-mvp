import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EmailService } from '@/lib/email-service'

export async function POST(request: NextRequest) {
  try {
    const { eventId, newUserId } = await request.json()
    
    if (!eventId) {
      return NextResponse.json({ 
        error: 'eventId is required' 
      }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: 'Missing Supabase configuration' 
      }, { status: 500 })
    }

    // If newUserId is provided, call match-incremental logic
    if (newUserId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // Call the matchmaker Edge Function with incremental flag
      const matchmakerUrl = `${supabaseUrl}/functions/v1/matchmaker`
      const matchmakerResponse = await fetch(matchmakerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: eventId,
          user_id: newUserId,
          mode: 'incremental',
          use_ai: true, // Enable AI on refresh
          force_recompute: true // Force regeneration on refresh
        })
      })

      if (!matchmakerResponse.ok) {
        const errorText = await matchmakerResponse.text()
        console.error('Matchmaker error:', errorText)
        return NextResponse.json({ 
          error: 'Failed to trigger matching',
          details: errorText
        }, { status: 500 })
      }

      const matchmakerResult = await matchmakerResponse.json()

      // Count how many matches were created for this user
      const { count, error: countError } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('connection_kind', 'system_match')
        .or(`a_id.eq.${newUserId},b_id.eq.${newUserId}`)

      const matchCount = count || 0

      // Send email notification if matches were created
      if (matchCount > 0) {
        try {
          const { data: user } = await supabase.auth.admin.getUserById(newUserId)
          const { data: event } = await supabase
            .from('events')
            .select('event_name')
            .eq('event_id', eventId)
            .single()

          if (user?.user?.email && event?.event_name) {
            const emailService = new EmailService()
            await emailService.sendMatchNotification(
              user.user.email,
              event.event_name,
              matchCount,
              `https://introevent.site?event=${eventId}`
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
        match_count: matchCount,
        matchmaker_result: matchmakerResult
      })
    }

    // Otherwise, trigger full event matching (this would be done via matchmaker edge function)
    return NextResponse.json({ 
      success: true,
      message: 'Refresh matches endpoint - use match-incremental for specific users'
    })

  } catch (error: any) {
    console.error('Refresh matches error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
