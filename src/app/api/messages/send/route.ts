// TODO: Rebuild when Supabase is restored
// This API route handles message sending
// The actual database was wiped and needs to be rebuilt

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.warn('⚠️  Messages API not available - database was wiped and needs to be rebuilt')
  
  try {
    const { eventId, recipientId, body } = await request.json()

    if (!eventId || !recipientId || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // PLACEHOLDER: Return mock response
    return NextResponse.json({ 
      success: false, 
      error: 'Database not configured - messages cannot be sent',
      message: null
    })

  } catch (error) {
    console.error('Error in send message API:', error)
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 500 }
    )
  }
}
