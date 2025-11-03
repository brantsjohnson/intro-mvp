import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { eventCode, eventName, eventLocation, eventStartsAt, eventEndsAt } = await request.json()
    
    if (!eventCode || !eventName) {
      return NextResponse.json(
        { error: 'eventCode and eventName are required' },
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

    // Validate event code is 6 characters (as per PRD)
    const cleanCode = eventCode.toUpperCase().trim()
    if (cleanCode.length !== 6) {
      return NextResponse.json(
        { error: 'Event code must be exactly 6 characters' },
        { status: 400 }
      )
    }

    // Create event with new schema
    const { data, error } = await supabase
      .from('events')
      .insert({
        event_code: cleanCode,
        event_name: eventName,
        event_location: eventLocation || null,
        event_starts_at: eventStartsAt || null,
        event_ends_at: eventEndsAt || null,
        onboarding_question_schema: {},
        matching_config: {}
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      if (error.code === '23505') { // Unique violation
        return NextResponse.json(
          { error: `Event code ${cleanCode} already exists` },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to create event', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      event: data,
      message: `Event ${cleanCode} created successfully`
    })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}

// GET endpoint to list all events
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: events, error } = await supabase
      .from('events')
      .select('event_id, event_code, event_name, event_location, event_starts_at, event_ends_at')
      .order('event_starts_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch events', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      events: events || []
    })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}

