import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, smsNotificationsEnabled } = await request.json()

    const supabase = await createServerComponentClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Validate phone number format (basic validation)
    if (phoneNumber && phoneNumber.trim()) {
      // Remove all non-digit characters except +
      const cleaned = phoneNumber.replace(/[^\d+]/g, '')
      if (cleaned.length < 10) {
        return NextResponse.json(
          { error: 'Invalid phone number format' },
          { status: 400 }
        )
      }
    }

    // Update user's phone number and notification preference
    const updateData: {
      phone_number?: string | null
      sms_notifications_enabled?: boolean
    } = {}

    if (phoneNumber !== undefined) {
      updateData.phone_number = phoneNumber?.trim() || null
    }

    if (smsNotificationsEnabled !== undefined) {
      updateData.sms_notifications_enabled = smsNotificationsEnabled
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating phone number:', updateError)
      return NextResponse.json(
        { error: 'Failed to update phone number' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      phoneNumber: updateData.phone_number,
      smsNotificationsEnabled: updateData.sms_notifications_enabled
    })
  } catch (error) {
    console.error('Error in save-phone-number API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

