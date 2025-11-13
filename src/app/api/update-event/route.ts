import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest) {
  try {
    const { eventId, eventName, eventLocation, eventStartsAt, eventEndsAt } = await request.json()
    
    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Build update object - only include fields that are provided
    const updateData: any = {}
    if (eventName !== undefined) updateData.event_name = eventName
    if (eventLocation !== undefined) updateData.event_location = eventLocation || null
    // Store times exactly as provided (datetime-local format: "YYYY-MM-DDTHH:mm")
    // Don't convert timezones - store as-is
    if (eventStartsAt !== undefined) updateData.event_starts_at = eventStartsAt || null
    if (eventEndsAt !== undefined) updateData.event_ends_at = eventEndsAt || null

    const { data, error } = await supabase
      .from('events')
      .update(updateData)
      .eq('event_id', eventId)
      .select()
      .single()

    if (error) {
      console.error('Error updating event:', error)
      return NextResponse.json(
        { error: 'Failed to update event', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      event: data,
      message: `Event updated successfully`
    })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}

