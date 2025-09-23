import { NextRequest, NextResponse } from 'next/server'
import { createClientComponentClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { eventId, recipientId, body } = await request.json()

    if (!eventId || !recipientId || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createClientComponentClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Generate thread ID
    const threadId = [user.id, recipientId].sort().join('-')

    // Insert message
    const { data, error } = await supabase
      .from('messages')
      .insert({
        event_id: eventId,
        thread_id: threadId,
        sender: user.id,
        recipient: recipientId,
        body
      })
      .select()
      .single()

    if (error) {
      console.error('Error sending message:', error)
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      )
    }

    // TODO: Send email notification to recipient if they haven't been active recently
    // This would integrate with your email service (SendGrid, Resend, etc.)

    return NextResponse.json({ success: true, message: data })
  } catch (error) {
    console.error('Error in send message API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
