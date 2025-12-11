import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

async function classifyCompanyIndustry(companyName: string, companyDescription: string | null): Promise<string | null> {
  if (!openai) return null

  try {
    const prompt = `Based on the following company information, determine the primary industry this company operates in. 

Company Name: ${companyName}
${companyDescription ? `Company Description: ${companyDescription}` : ''}

Return ONLY a single industry name. Use standard, professional industry categories such as:
- Technology
- Healthcare
- Finance
- Retail
- Manufacturing
- Education
- Real Estate
- Consulting
- Marketing & Advertising
- Food & Beverage
- Transportation & Logistics
- Energy
- Media & Entertainment
- Legal Services
- Hospitality & Tourism
- Construction
- Agriculture
- Telecommunications
- Pharmaceuticals
- Aerospace & Defense

Be specific but concise. Return only the industry name, nothing else.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at classifying companies into industries. Return only the industry name, nothing else.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    })

    const industry = completion.choices[0]?.message?.content?.trim() || null

    if (industry) {
      // Store in database
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      await supabase
        .from('company_industries')
        .upsert({
          company_name: companyName,
          industry: industry,
          updated_at: new Date().toISOString()
        })
    }

    return industry
  } catch (error) {
    console.error(`Error classifying company ${companyName}:`, error)
    return null
  }
}

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

  // Get event data
  const { data: event } = await supabase
    .from('events')
    .select('event_name, matching_config')
    .eq('event_id', eventId)
    .single()

  if (!event) return null

  const matchingConfig = (event.matching_config as any) || {}
  const sponsor = matchingConfig.sponsor || null

  // Fetch logo from event-assets bucket
  let eventLogoUrl: string | null = null
  try {
    const { data: files, error: listError } = await supabase.storage
      .from('event-assets')
      .list(eventId, {
        sortBy: { column: 'created_at', order: 'desc' },
        limit: 10
      })

    if (!listError && files && files.length > 0) {
      // Find the most recent logo file
      const latestLogo = files.find(f => f.name.startsWith('logo-')) || files[0]
      if (latestLogo) {
        const logoPath = `${eventId}/${latestLogo.name}`
        const { data: urlData } = supabase.storage
          .from('event-assets')
          .getPublicUrl(logoPath)
        
        eventLogoUrl = urlData.publicUrl
      }
    }
  } catch (error) {
    console.error('Error fetching logo from bucket:', error)
    // Continue without logo if bucket fetch fails
  }

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

  // Get user data for connected users (including company_summary if available)
  const { data: connectedUsers } = await supabase
    .from('users')
    .select('company_name, industry_tags, career_title, company_summary')
    .in('user_id', connectedUserIds)

  // Aggregate metrics
  const companies = (connectedUsers || [])
    .map((u) => u.company_name)
    .filter((c): c is string => !!c)
  
  const topCompanies = getTopItems(companies, 5)

  // Get industries from company_industries table (AI-determined)
  const companyNames = [...new Set(companies)]
  let topIndustries: string[] = []
  
  if (companyNames.length > 0) {
    // First, try to get industries from company_industries table
    const { data: companyIndustries } = await supabase
      .from('company_industries')
      .select('company_name, industry')
      .in('company_name', companyNames)

    // Map company names to industries
    const industryMap = new Map<string, string>()
    if (companyIndustries && companyIndustries.length > 0) {
      companyIndustries.forEach(ci => {
        if (ci.industry) {
          industryMap.set(ci.company_name, ci.industry)
        }
      })
    }

    // For companies without industries, classify them using AI synchronously
    const companiesToClassify = companyNames.filter(name => !industryMap.has(name))
    if (companiesToClassify.length > 0 && process.env.OPENAI_API_KEY) {
      // Classify companies that don't have industries yet
      for (const companyName of companiesToClassify) {
        try {
          // Get company description if available
          const userWithCompany = connectedUsers?.find(u => u.company_name === companyName)
          const companyDescription = (userWithCompany as any)?.company_summary || null

          // Call classification API directly (internal call)
          const classificationResult = await classifyCompanyIndustry(companyName, companyDescription)
          if (classificationResult) {
            industryMap.set(companyName, classificationResult)
          }
        } catch (err) {
          console.error(`Failed to classify company ${companyName}:`, err)
        }
      }
    }

    // Count industries based on how many companies are in each industry
    const industryCounts = new Map<string, number>()
    companies.forEach(companyName => {
      const industry = industryMap.get(companyName)
      if (industry) {
        industryCounts.set(industry, (industryCounts.get(industry) || 0) + 1)
      }
    })

    // Get top industries
    topIndustries = Array.from(industryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([industry]) => industry)
  }

  // Fallback to industry_tags if no AI-determined industries found
  if (topIndustries.length === 0) {
    // Get attendance data for industry tags (event-specific)
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('event_industry_tags')
      .eq('event_id', eventId)
      .in('user_id', connectedUserIds)

    // Merge industry tags from users and attendance
    const allIndustryTags = [
      ...(connectedUsers || []).flatMap((u) => u.industry_tags || []),
      ...(attendanceData || []).flatMap((a) => a.event_industry_tags || []),
    ]
    topIndustries = getTopItems(allIndustryTags, 5)
  }

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


