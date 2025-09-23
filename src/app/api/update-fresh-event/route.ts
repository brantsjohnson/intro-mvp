import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get Supabase client with service role key for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Update the FRESH event with new dates
    // Set start time to today and end time to Thursday at midnight
    const now = new Date()
    const thursday = new Date(now)
    
    // Find next Thursday
    const daysUntilThursday = (4 - now.getDay() + 7) % 7 // Thursday is day 4
    thursday.setDate(now.getDate() + daysUntilThursday)
    thursday.setHours(23, 59, 59, 999) // Set to 11:59:59 PM on Thursday
    
    const { data, error } = await supabase
      .from('events')
      .update({
        starts_at: now.toISOString(),
        ends_at: thursday.toISOString(),
        is_active: true
      })
      .eq('code', 'FRESH')
      .select()

    if (error) {
      console.error('Error updating FRESH event:', error)
      return NextResponse.json(
        { error: 'Failed to update FRESH event' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      event: data[0],
      message: `FRESH event updated: starts ${now.toLocaleString()}, ends ${thursday.toLocaleString()}`
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
