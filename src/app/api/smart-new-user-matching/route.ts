import { NextRequest, NextResponse } from 'next/server'
import { MatchmakingService } from '@/lib/matchmaking-service'

export async function POST(request: NextRequest) {
  try {
    const { eventCode, userId, weights } = await request.json()
    if (!eventCode || !userId) {
      return NextResponse.json({ error: 'eventCode and userId are required' }, { status: 400 })
    }

    const service = new MatchmakingService()
    const eventId = await service.getEventIdFromCode(eventCode)
    if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const ranked = await service.computeTopMatchesForUser(eventId, userId, weights)
    await service.upsertUserMatches(eventId, userId, ranked)

    return NextResponse.json({ success: true, count: ranked.length, matches: ranked })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}


