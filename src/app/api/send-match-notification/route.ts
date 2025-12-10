import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EmailService } from '@/lib/email-service'

export async function POST(request: NextRequest) {
  try {
    const { eventId, userId } = await request.json()

    if (!eventId || !userId) {
      return NextResponse.json(
        { error: 'eventId and userId are required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get user email
    const { data: user } = await supabase.auth.admin.getUserById(userId)
    if (!user?.user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    // Get event name
    const { data: event } = await supabase
      .from('events')
      .select('event_name')
      .eq('event_id', eventId)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Count matches for this user
    const { count: matchCount, error: countError } = await supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('connection_kind', 'system_match')
      .or(`a_id.eq.${userId},b_id.eq.${userId}`)

    if (countError) {
      console.error('Error counting matches:', countError)
      return NextResponse.json(
        { error: 'Failed to count matches' },
        { status: 500 }
      )
    }

    if (!matchCount || matchCount === 0) {
      return NextResponse.json(
        { error: 'No matches found for this user' },
        { status: 400 }
      )
    }

    // Send email notification
    const emailService = new EmailService()
    const result = await emailService.sendMatchNotification(
      user.user.email,
      event.event_name,
      matchCount,
      `https://introevent.site?event=${eventId}`
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      matchCount,
      result 
    })
  } catch (error) {
    console.error('Error sending match notification:', error)
    return NextResponse.json(
      { 
        error: 'Failed to send match notification', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

