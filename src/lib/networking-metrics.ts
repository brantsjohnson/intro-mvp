import { createClient } from '@supabase/supabase-js'

export interface NetworkingData {
  eventName: string
  connectionsCount: number
  topCompanies: string[]
  topIndustries: string[]
  commonTitles: string[]
  eventLogoUrl?: string | null
  softwareProvider: string
  sponsor?: string
}

export async function getNetworkingMetrics(
  eventId: string,
  userId: string
): Promise<NetworkingData | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get event data including logo from matching_config
  const { data: event } = await supabase
    .from('events')
    .select('event_name, matching_config')
    .eq('event_id', eventId)
    .single()

  if (!event) return null

  const matchingConfig = (event.matching_config as any) || {}
  const eventLogoUrl = matchingConfig.logo_url || null
  const sponsor = matchingConfig.sponsor || null

  // Get all connections for this user in this event
  const { data: connections } = await supabase
    .from('connections')
    .select('a_id, b_id')
    .eq('event_id', eventId)
    .eq('connection_kind', 'system_match')
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)

  if (!connections || connections.length === 0) {
    return {
      eventName: event.event_name,
      connectionsCount: 0,
      topCompanies: [],
      topIndustries: [],
      commonTitles: [],
      eventLogoUrl,
      softwareProvider: 'introevent',
      sponsor,
    }
  }

  // Get unique connected user IDs
  const connectedUserIds = [
    ...new Set(
      connections.flatMap((c) => 
        c.a_id === userId ? c.b_id : c.a_id
      )
    ),
  ]

  // Get user data for connected users
  const { data: connectedUsers } = await supabase
    .from('users')
    .select('company_name, industry_tags, career_title')
    .in('user_id', connectedUserIds)

  // Get attendance data for industry tags (event-specific)
  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('event_industry_tags')
    .eq('event_id', eventId)
    .in('user_id', connectedUserIds)

  // Aggregate metrics
  const companies = (connectedUsers || [])
    .map((u) => u.company_name)
    .filter((c): c is string => !!c)
  
  const topCompanies = getTopItems(companies, 5)

  // Merge industry tags from users and attendance
  const allIndustryTags = [
    ...(connectedUsers || []).flatMap((u) => u.industry_tags || []),
    ...(attendanceData || []).flatMap((a) => a.event_industry_tags || []),
  ]
  const topIndustries = getTopItems(allIndustryTags, 5)

  const titles = (connectedUsers || [])
    .map((u) => u.career_title)
    .filter((t): t is string => !!t)
  const commonTitles = getTopItems(titles, 6)

  return {
    eventName: event.event_name,
    connectionsCount: connectedUserIds.length,
    topCompanies,
    topIndustries,
    commonTitles,
    eventLogoUrl,
    softwareProvider: 'introevent',
    sponsor,
  }
}

function getTopItems(items: string[], limit: number): string[] {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    counts.set(item, (counts.get(item) || 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item)
}


