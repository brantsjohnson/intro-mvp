import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventId, userId } = await request.json()
    
    if (!eventId || !userId) {
      return NextResponse.json({ 
        error: 'eventId and userId are required' 
      }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: 'Missing Supabase configuration' 
      }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the matchmaker Edge Function with incremental flag
    const matchmakerUrl = `${supabaseUrl}/functions/v1/matchmaker`
    const matchmakerResponse = await fetch(matchmakerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_id: eventId,
        user_id: userId,
        mode: 'incremental' // Only match for this specific user
      })
    })

    if (!matchmakerResponse.ok) {
      const errorText = await matchmakerResponse.text()
      console.error('Matchmaker error:', errorText)
      return NextResponse.json({ 
        error: 'Failed to trigger matching',
        details: errorText
      }, { status: 500 })
    }

    const matchmakerResult = await matchmakerResponse.json()

    // Count how many matches were created for this user
    const { count, error: countError } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('is_system', true)
      .or(`a.eq.${userId},b.eq.${userId}`)

    if (countError) {
      console.error('Error counting matches:', countError)
    }

    return NextResponse.json({
      success: true,
      match_count: count || 0,
      matchmaker_result: matchmakerResult
    })

  } catch (error: any) {
    console.error('Error in match-incremental API:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message 
    }, { status: 500 })
  }
}

