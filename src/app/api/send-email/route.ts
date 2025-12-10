import { NextRequest, NextResponse } from 'next/server'
import { EmailService } from '@/lib/email-service'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { to, subject, html, text, recipientUserId, senderName, messagePreview } = await request.json()

    // Validate required fields
    if (!to && !recipientUserId) {
      return NextResponse.json(
        { error: 'Missing required fields: to or recipientUserId' },
        { status: 400 }
      )
    }

    if (!subject && !senderName) {
      return NextResponse.json(
        { error: 'Missing required fields: subject or senderName' },
        { status: 400 }
      )
    }

    const supabase = await createServerComponentClient()
    
    // If recipientUserId is provided, fetch email address and check if notifications are enabled
    let emailAddress = to
    if (recipientUserId) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, email_notifications_enabled')
        .eq('user_id', recipientUserId)
        .single()

      if (userError) {
        console.error('Error fetching user:', userError)
        return NextResponse.json(
          { error: 'Failed to fetch user' },
          { status: 500 }
        )
      }

      if (!user.email) {
        return NextResponse.json(
          { error: 'User has no email address' },
          { status: 400 }
        )
      }

      // Check if email notifications are disabled (if the field exists)
      // If the field doesn't exist, default to enabled
      if (user.email_notifications_enabled === false) {
        return NextResponse.json(
          { error: 'Email notifications disabled for this user' },
          { status: 400 }
        )
      }

      emailAddress = user.email
    }

    const emailService = new EmailService()
    
    // If senderName is provided, use the message notification method
    if (senderName) {
      const result = await emailService.sendMessageNotification(
        emailAddress,
        senderName,
        messagePreview
      )

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to send email' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        messageId: result.messageId
      })
    }

    // Otherwise, send a custom email
    if (!subject) {
      return NextResponse.json(
        { error: 'Subject is required when senderName is not provided' },
        { status: 400 }
      )
    }

    const result = await emailService.sendEmail({
      to: emailAddress,
      subject,
      html,
      text
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId
    })
  } catch (error) {
    console.error('Error in send-email API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

