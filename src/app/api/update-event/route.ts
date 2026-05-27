import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceRoleClient,
  requirePlatformAdminForRoute,
} from '@/lib/platform-admin'

export async function PUT(request: NextRequest) {
  try {
    const gate = await requirePlatformAdminForRoute()
    if (!gate.ok) return gate.response

    const {
      eventId,
      eventName,
      eventLocation,
      eventDescription,
      eventStartsAt,
      eventEndsAt,
    } = await request.json()
    
    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      )
    }

    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    // Build update object - only include fields that are provided
    const updateData: any = {}
    if (eventName !== undefined) updateData.event_name = eventName
    if (eventLocation !== undefined) updateData.event_location = eventLocation || null
    if (eventDescription !== undefined) {
      // Allow explicit clearing by sending empty string / null
      updateData.event_description =
        typeof eventDescription === "string" && eventDescription.trim().length > 0
          ? eventDescription
          : null
    }
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

