import { NextRequest, NextResponse } from 'next/server'
import { SMSService } from '@/lib/sms-service'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { to, message, recipientUserId, senderName } = await request.json()

    // Validate required fields
    if (!to && !recipientUserId) {
      return NextResponse.json(
        { error: 'Missing required fields: to or recipientUserId' },
        { status: 400 }
      )
    }

    if (!message && !senderName) {
      return NextResponse.json(
        { error: 'Missing required fields: message or senderName' },
        { status: 400 }
      )
    }

    const supabase = await createServerComponentClient()
    
    // If recipientUserId is provided, fetch phone number and check if notifications are enabled
    let phoneNumber = to
    if (recipientUserId) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('phone_number, sms_notifications_enabled')
        .eq('user_id', recipientUserId)
        .single()

      if (userError) {
        console.error('Error fetching user:', userError)
        return NextResponse.json(
          { error: 'Failed to fetch user' },
          { status: 500 }
        )
      }

      if (!user.phone_number) {
        return NextResponse.json(
          { error: 'User has no phone number' },
          { status: 400 }
        )
      }

      if (user.sms_notifications_enabled === false) {
        return NextResponse.json(
          { error: 'SMS notifications disabled for this user' },
          { status: 400 }
        )
      }

      phoneNumber = user.phone_number
    }

    // Use message if provided, otherwise construct notification message
    const smsMessage = message || 
      `You have a new message from ${senderName || 'someone'} on Intro. View: introevent.site`

    const smsService = new SMSService()
    const result = await smsService.sendSMS({
      to: phoneNumber,
      message: smsMessage
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send SMS' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId
    })
  } catch (error) {
    console.error('Error in send-sms API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

