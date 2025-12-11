import { NextRequest, NextResponse } from 'next/server'
import { getNetworkingMetrics } from '@/lib/networking-metrics'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const eventId = searchParams.get('eventId')
    const userId = searchParams.get('userId')

    if (!eventId || !userId) {
      return NextResponse.json(
        { error: 'eventId and userId are required' },
        { status: 400 }
      )
    }

    const metrics = await getNetworkingMetrics(eventId, userId)
    
    if (!metrics) {
      return NextResponse.json(
        { error: 'Failed to get metrics' },
        { status: 400 }
      )
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error fetching networking metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
