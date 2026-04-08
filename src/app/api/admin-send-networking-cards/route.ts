import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceRoleClient,
  requirePlatformAdminForRoute,
} from '@/lib/platform-admin'

export async function POST(request: NextRequest) {
  try {
    const gate = await requirePlatformAdminForRoute()
    if (!gate.ok) return gate.response

    const { eventId } = await request.json()

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // Get all users who attended the event
    const { data: attendees, error: attendeesError } = await supabase
      .from('attendance')
      .select('user_id')
      .eq('event_id', eventId)

    if (attendeesError) {
      console.error('Error fetching attendees:', attendeesError)
      return NextResponse.json(
        { error: 'Failed to fetch attendees' },
        { status: 500 }
      )
    }

    if (!attendees || attendees.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No attendees found for this event',
        sent: 0,
      })
    }

    // Send networking cards to all attendees
    // Use environment variable or construct from request
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || 'localhost:1000'
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`
    
    console.log(`Sending networking cards to ${attendees.length} attendees for event ${eventId}`)
    console.log(`Using baseUrl: ${baseUrl}`)
    
    const results = []
    for (const attendee of attendees) {
      try {
        const response = await fetch(`${baseUrl}/api/send-networking-card`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventId,
            userId: attendee.user_id,
          }),
        })

        const result = await response.json()
        if (!response.ok) {
          const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Unknown error')
          console.error(`Failed to send card to user ${attendee.user_id}:`, errorMsg)
          console.error('Full error response:', JSON.stringify(result, null, 2))
        }
        results.push({
          userId: attendee.user_id,
          success: response.ok,
          error: result.details ? `${result.error}: ${result.details}` : (result.error || result.details || (response.ok ? undefined : 'Unknown error')),
        })
      } catch (error) {
        console.error(`Error sending card to user ${attendee.user_id}:`, error)
        results.push({
          userId: attendee.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failureCount = results.length - successCount

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failureCount,
      total: results.length,
      results,
    })
  } catch (error) {
    console.error('Error in admin-send-networking-cards:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

