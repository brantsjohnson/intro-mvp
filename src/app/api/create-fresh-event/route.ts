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

    // Create or update the FRESH event
    const { data, error } = await supabase
      .from('events')
      .upsert({
        code: 'FRESH',
        name: 'FRESH Networking Event',
        is_active: true,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        matchmaking_enabled: true
      }, {
        onConflict: 'code'
      })
      .select()

    if (error) {
      console.error('Error creating FRESH event:', error)
      return NextResponse.json(
        { error: 'Failed to create FRESH event' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      event: data[0]
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
