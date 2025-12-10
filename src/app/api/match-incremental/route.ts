import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EmailService } from '@/lib/email-service'

export async function POST(request: NextRequest) {
  try {
    const { eventId, userId } = await request.json()
    
    if (!eventId || !userId) {
      return NextResponse.json({ 
        error: 'eventId and userId are required' 
      }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: 'Missing Supabase configuration' 
      }, { status: 500 })
    }

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
        user_id: userId,
        mode: 'incremental', // Only match for this specific user
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
      .or(`a_id.eq.${userId},b_id.eq.${userId}`)

    if (countError) {
      console.error('Error counting matches:', countError)
    }

    const matchCount = count || 0

    // Send email notification if matches were created
    if (matchCount > 0) {
      try {
        // Get user email and event name
        const { data: user } = await supabase.auth.admin.getUserById(userId)
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
            // Don't fail the request if email fails
            console.error('Failed to send match notification email:', error)
          })
        }
      } catch (error) {
        // Don't fail the request if email fails
        console.error('Error sending match notification:', error)
      }
    }

    return NextResponse.json({
      success: true,
      match_count: matchCount,
      matchmaker_result: matchmakerResult
    })

  } catch (error: any) {
    console.error('Error in match-incremental API:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message 
    }, { status: 500 })
  }
}

