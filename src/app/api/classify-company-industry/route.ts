import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

export async function POST(request: NextRequest) {
  try {
    const { companyName, companyDescription } = await request.json()

    if (!companyName) {
      return NextResponse.json(
        { error: 'companyName is required' },
        { status: 400 }
      )
    }

    // Check if we already have an industry for this company
    const { data: existing } = await supabase
      .from('company_industries')
      .select('industry')
      .eq('company_name', companyName)
      .single()

    if (existing) {
      return NextResponse.json({ 
        industry: existing.industry,
        cached: true 
      })
    }

    // Use AI to determine industry
    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

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

    const industry = completion.choices[0]?.message?.content?.trim() || 'Other'

    // Store in database
    await supabase
      .from('company_industries')
      .upsert({
        company_name: companyName,
        industry: industry,
        updated_at: new Date().toISOString()
      })

    return NextResponse.json({ 
      industry,
      cached: false 
    })
  } catch (error) {
    console.error('Error classifying company industry:', error)
    return NextResponse.json(
      { error: 'Failed to classify company industry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

