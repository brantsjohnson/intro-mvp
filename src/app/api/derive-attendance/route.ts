import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

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

    // Load all user data and event answers
    const { data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select(`
        *,
        users:user_id (
          user_id,
          first_name,
          last_name,
          career_title,
          company_name,
          expertise_summary
        ),
        events:event_id (
          event_id,
          event_name,
          event_code
        )
      `)
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .single()

    // Load user hobbies if available
    const { data: userData } = await supabase
      .from('users')
      .select('hobbies')
      .eq('user_id', userId)
      .single()

    if (attendanceError || !attendance) {
      return NextResponse.json({ 
        error: 'Attendance record not found' 
      }, { status: 404 })
    }

    // Initialize OpenAI if available
    const openaiApiKey = process.env.OPENAI_API_KEY
    const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null

    // Generate summary and tags from attendance data
    const user = (attendance as any).users
    const summary = generateBasicSummary(attendance)
    
    // Extract tags from connection types and answers
    const offerTags: string[] = []
    const wantTags: string[] = []
    const goalsTags: string[] = []
    
    // Map connection types to tags
    const connectionTypes = attendance.connection_types_selected || []
    connectionTypes.forEach((type: string) => {
      if (type === 'be_mentor') {
        offerTags.push('mentor')
        goalsTags.push('mentorship')
      }
      if (type === 'find_mentor') {
        wantTags.push('mentor')
        goalsTags.push('learning')
      }
      if (type === 'biz_opps') {
        wantTags.push('business_opportunities')
        goalsTags.push('networking')
      }
      if (type === 'find_job') {
        wantTags.push('job_opportunities')
        goalsTags.push('career_growth')
      }
      if (type === 'recruit') {
        offerTags.push('recruiting')
        goalsTags.push('hiring')
      }
    })
    
    // Extract from expertise summary if available
    if (user?.expertise_summary) {
      const expertiseWords = user.expertise_summary.toLowerCase().split(/[,\s]+/).filter(w => w.length > 2)
      offerTags.push(...expertiseWords.slice(0, 3)) // Add top 3 expertise words as tags
    }

    // Extract hobbies from follow-up responses (when connection type is "other" or "general")
    const followUpResponses = attendance.connection_followups_json as Record<string, string> || {}
    let hobbies: string[] = []
    
    // Check if user has hobbies in follow-up responses for "other" or "general" connection types
    if (followUpResponses['other'] || followUpResponses['general']) {
      const hobbyText = followUpResponses['other'] || followUpResponses['general'] || ''
      // Parse hobbies (comma or newline separated)
      hobbies = hobbyText
        .split(/[,\n]+/)
        .map(h => h.trim())
        .filter(h => h.length > 0)
        .slice(0, 10) // Limit to 10 hobbies
    }
    
    // If no hobbies found yet but user has hobbies in their profile, use those
    if (hobbies.length === 0 && userData?.hobbies && Array.isArray(userData.hobbies) && userData.hobbies.length > 0) {
      hobbies = userData.hobbies
    }

    const followUpValues = Object.values(followUpResponses || {})

    const normalizedOfferTags = normalizeTags([
      ...offerTags,
      ...(user?.career_title ? extractKeywordTags(user.career_title) : []),
      ...(user?.expertise_summary ? extractKeywordTags(user.expertise_summary) : [])
    ])
    const normalizedWantTags = normalizeTags(wantTags)
    const normalizedGoalsTags = normalizeTags(goalsTags)
    const normalizedHobbyTags = normalizeTags(
      (hobbies || []).map((hobby) => hobby.toLowerCase()),
      15
    )
    let normalizedNeedTags = normalizeTags([
      ...normalizedWantTags,
      ...extractKeywordTags(attendance.business_need_text),
      ...extractKeywordTags(attendance.why_attending_text),
      ...followUpValues.flatMap((value) => extractKeywordTags(value))
    ])

    if (normalizedNeedTags.length === 0) {
      const fallbackSeeds = [
        attendance.business_need_text,
        attendance.why_attending_text,
        followUpValues.join(" "),
        connectionTypes.join(" "),
        normalizedOfferTags.slice(0, 2).join(" ")
      ]
      normalizedNeedTags = normalizeTags(fallbackSeeds)
    }

    if (normalizedNeedTags.length === 0) {
      normalizedNeedTags = ["networking"]
    }

    const normalizedIndustryTags = normalizeTags(
      extractIndustryTags([
        user?.career_title || '',
        user?.company_name || '',
        user?.expertise_summary || '',
        (attendance as any).role_title || ''
      ]),
      20
    )

    // Determine availability status and role intent
    let availabilityStatus = 'open'
    let roleIntent = 'general'
    
    if (connectionTypes.includes('find_job')) {
      roleIntent = 'job_seeker'
      availabilityStatus = 'actively_building'
    } else if (connectionTypes.includes('recruit')) {
      roleIntent = 'recruiter'
    } else if (connectionTypes.includes('find_mentor') || connectionTypes.includes('be_mentor')) {
      roleIntent = 'mentor'
    }

    // Generate AI summaries for "offer" (what they provide) and "want" (what they seek)
    let offerSummaryText = ''
    let wantSummaryText = ''
    let offerEmbedding: number[] | null = null
    let wantEmbedding: number[] | null = null
    let needEmbedding: number[] | null = null
    let profileEmbedding: number[] | null = null

    if (openai) {
      try {
        // Generate offer summary (what they can provide/offer to others)
        const offerContext = `Job: ${user?.career_title || ''} at ${user?.company_name || ''}
Expertise: ${user?.expertise_summary || ''}
Hobbies: ${hobbies.join(', ') || 'Not specified'}
Connection goals they selected: ${connectionTypes.filter((t: string) => t === 'be_mentor' || t === 'recruit' || t === 'biz_opps').join(', ') || 'general networking'}
Why attending: ${attendance.why_attending_text || ''}`

        const offerResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Summarize what this person can OFFER to others at a networking event (what they bring, what they can help with, what they're offering). Keep it concise (2-3 sentences max). Focus on their expertise, skills, and what they can provide to others." },
            { role: "user", content: offerContext }
          ],
          temperature: 0.7,
          max_tokens: 150,
        })

        offerSummaryText = offerResponse.choices[0]?.message?.content?.trim() || ''

        // Generate want summary (what they're looking for/seeking)
        const wantContext = `Connection goals: ${connectionTypes.join(', ')}
Business need: ${attendance.business_need_text || ''}
Why attending: ${attendance.why_attending_text || ''}
Job: ${user?.career_title || ''}`

        const wantResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Summarize what this person is LOOKING FOR or SEEKING at a networking event (mentorship, opportunities, connections, etc.). Keep it concise (2-3 sentences max)." },
            { role: "user", content: wantContext }
          ],
          temperature: 0.7,
          max_tokens: 150,
        })

        wantSummaryText = wantResponse.choices[0]?.message?.content?.trim() || ''

        // Generate embeddings for semantic search/matching
        if (offerSummaryText) {
          const offerEmbedResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: offerSummaryText,
          })
          offerEmbedding = offerEmbedResponse.data[0]?.embedding || null
        }

        if (wantSummaryText) {
          const wantEmbedResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: wantSummaryText,
          })
          wantEmbedding = wantEmbedResponse.data[0]?.embedding || null
        }

        const needEmbeddingInput = [
          attendance.business_need_text || '',
          wantSummaryText || '',
          attendance.why_attending_text || '',
          followUpValues.join('\n')
        ]
          .filter(Boolean)
          .join('\n')
          .trim()

        if (needEmbeddingInput) {
          const needEmbedResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: needEmbeddingInput
          })
          needEmbedding = needEmbedResponse.data[0]?.embedding || null
        }

        const profileContext = [
          `Name: ${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
          user?.career_title ? `Role: ${user.career_title}` : '',
          user?.company_name ? `Company: ${user.company_name}` : '',
          `Offer summary: ${offerSummaryText}`,
          `Need summary: ${wantSummaryText}`,
          attendance.business_need_text ? `Business need: ${attendance.business_need_text}` : '',
          attendance.why_attending_text ? `Why attending: ${attendance.why_attending_text}` : '',
          normalizedIndustryTags.length ? `Industries: ${normalizedIndustryTags.join(', ')}` : '',
          normalizedHobbyTags.length ? `Hobbies: ${normalizedHobbyTags.join(', ')}` : ''
        ]
          .filter(Boolean)
          .join('\n')

        if (profileContext.trim()) {
          const profileEmbedResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: profileContext
          })
          profileEmbedding = profileEmbedResponse.data[0]?.embedding || null
        }

      } catch (embeddingError) {
        console.error('Error generating summaries/embeddings:', embeddingError)
        // Continue without embeddings - they're not critical
      }
    }

    // Build career goals tags from connection types and business needs
    const careerGoalsTags: string[] = normalizeTags([
      ...normalizedGoalsTags,
      ...extractKeywordTags(attendance.business_need_text, 5)
    ])

    // Analyze adaptive Q&A transcript to infer personality types
    let personalityData: any = {}
    const adaptiveQnA = attendance.adaptive_qna_json as any
    const questionsAsked = adaptiveQnA?.asked || []
    
    if (questionsAsked.length > 0 && openai) {
      try {
          
          // Build Q&A history for analysis
          const qaHistory = questionsAsked.map((qa: any, index: number) => {
            return `Q${index + 1}: ${qa.questionText || qa.qid}\nA${index + 1}: ${qa.choice || qa.answer}`
          }).join('\n\n')
          
          const userContext = `Name: ${user?.first_name || ''} ${user?.last_name || ''}
Job Title: ${user?.career_title || ''}
Company: ${user?.company_name || ''}
Why Attending: ${attendance.why_attending_text || ''}
Connection Types: ${connectionTypes.join(', ')}
Business Need: ${attendance.business_need_text || ''}`
          
          const personalityPrompt = `You are a personality assessment expert. Analyze the following Q&A responses and infer personality types.

USER CONTEXT:
${userContext}

ADAPTIVE Q&A RESPONSES:
${qaHistory}

YOUR TASK:
Based on the answers, infer:
1. **MBTI Type** (e.g., "INTJ", "ENFP", "ISFJ") - one of the 16 types
2. **Enneagram Type** (1-9, optionally with wing like "5w4")
3. **Big Five Scores** (0-100 for each trait):
   - Openness (creativity, curiosity)
   - Conscientiousness (organization, discipline)
   - Extraversion (social energy, assertiveness)
   - Agreeableness (cooperation, trust)
   - Neuroticism (emotional stability)

Provide confidence scores (0-100) for each assessment.

OUTPUT FORMAT (STRICT JSON - no markdown, no code blocks):
{
  "mbti_type": "INTJ" or null,
  "mbti_confidence": 75,
  "enneagram_type": "5w4" or null,
  "enneagram_confidence": 70,
  "bigfive_scores": {
    "openness": 85,
    "conscientiousness": 60,
    "extraversion": 30,
    "agreeableness": 70,
    "neuroticism": 40
  },
  "bigfive_confidence": 75,
  "personality_json": {
    "summary": "Brief personality summary",
    "key_traits": ["trait1", "trait2"],
    "communication_style": "analytical" or "expressive" or "amiable" or "driver"
  }
}

If confidence is below 50, set the type to null. Only return data you're reasonably confident about.`

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: personalityPrompt }],
            temperature: 0.3, // Lower temperature for more consistent personality assessment
            max_tokens: 500,
          })

          const text = response.choices[0]?.message?.content || ''
          
          // Clean up the response
          let cleanedText = text.trim()
          if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
          } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '')
          }

          try {
            personalityData = JSON.parse(cleanedText)
            
            // Only save if confidence is reasonable
            if (personalityData.mbti_confidence && personalityData.mbti_confidence < 50) {
              personalityData.mbti_type = null
            }
            if (personalityData.enneagram_confidence && personalityData.enneagram_confidence < 50) {
              personalityData.enneagram_type = null
            }
            if (personalityData.bigfive_confidence && personalityData.bigfive_confidence < 50) {
              personalityData.bigfive_scores = null
            }
          } catch (parseError) {
            console.error('Failed to parse personality analysis:', parseError, cleanedText)
          }
      } catch (personalityError) {
        console.error('Error inferring personality:', personalityError)
        // Continue without personality data
      }
    }

    // Update attendance with derived data
    const attendanceUpdate: any = {
      event_profile_summary_text: summary,
      event_offer_tags: normalizedOfferTags.length ? normalizedOfferTags : null,
      event_want_tags: normalizedWantTags.length ? normalizedWantTags : null,
      event_need_tags: normalizedNeedTags.length ? normalizedNeedTags : null,
      event_industry_tags: normalizedIndustryTags.length ? normalizedIndustryTags : null,
      event_hobby_tags: normalizedHobbyTags.length ? normalizedHobbyTags : null,
      event_goals_tags: careerGoalsTags.length ? careerGoalsTags : null,
      event_availability_status: availabilityStatus,
      event_role_intent: roleIntent,
      onboarding_completed: true,
      last_seen_at: new Date().toISOString(),
      last_profile_change_at: new Date().toISOString(),
      attendee_first_name: user?.first_name || null,
      attendee_last_name: user?.last_name || null,
    }

    // Add embeddings if generated (Supabase pgvector expects array directly)
    if (profileEmbedding && profileEmbedding.length > 0) {
      attendanceUpdate.profile_embedding = profileEmbedding
      attendanceUpdate.event_profile_embedding = profileEmbedding
    }

    console.log('Updating attendance:', { eventId, userId, fields: Object.keys(attendanceUpdate) })

    const { error: updateError } = await supabase
      .from('attendance')
      .update(attendanceUpdate)
      .eq('event_id', eventId)
      .eq('user_id', userId)

    if (updateError) {
      console.error('ATTENDANCE UPDATE ERROR:', {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      })
      return NextResponse.json({ 
        error: 'Failed to update attendance',
        details: updateError.message,
        code: updateError.code
      }, { status: 500 })
    }

    console.log('Attendance updated successfully')

    // Update users table with personality data and offer/want summaries
    const userUpdate: any = {
      personality_last_updated: new Date().toISOString()
    }

    // Add offer/want summaries and embeddings
    if (offerSummaryText) {
      userUpdate.offer_summary_text = offerSummaryText
    }
    if (wantSummaryText) {
      userUpdate.want_summary_text = wantSummaryText
    }
    if (offerEmbedding && offerEmbedding.length > 0) {
      // Supabase pgvector expects array directly, not string
      userUpdate.offer_embedding = offerEmbedding
    }
    if (wantEmbedding && wantEmbedding.length > 0) {
      // Supabase pgvector expects array directly, not string
      userUpdate.want_embedding = wantEmbedding
    }
    if (needEmbedding && needEmbedding.length > 0) {
      userUpdate.need_embedding = needEmbedding
    }
    if (normalizedOfferTags.length > 0) {
      userUpdate.offer_tags = normalizedOfferTags
    }
    if (normalizedWantTags.length > 0) {
      userUpdate.want_tags = normalizedWantTags
    }
    if (normalizedNeedTags.length > 0) {
      userUpdate.need_tags = normalizedNeedTags
    }
    if (careerGoalsTags.length > 0) {
      userUpdate.career_goals_tags = careerGoalsTags
    }
    if (normalizedIndustryTags.length > 0) {
      userUpdate.industry_tags = normalizedIndustryTags
    }
    if (normalizedHobbyTags.length > 0) {
      userUpdate.hobby_tags = normalizedHobbyTags
    }
    if (availabilityStatus) {
      userUpdate.engagement_availability_status = availabilityStatus
    }
    if (roleIntent) {
      userUpdate.collaboration_role_intent = roleIntent
    }
    // Save hobbies if we extracted them
    if (hobbies.length > 0) {
      userUpdate.hobbies = hobbies
    }

    // Add personality data
    if (personalityData && Object.keys(personalityData).length > 0) {
      if (personalityData.mbti_type) {
        userUpdate.mbti_type = personalityData.mbti_type
      }
      
      if (personalityData.enneagram_type) {
        userUpdate.enneagram_type = personalityData.enneagram_type
      }
      
      if (personalityData.bigfive_scores) {
        userUpdate.bigfive_scores = personalityData.bigfive_scores
      }
      
      if (personalityData.personality_json) {
        userUpdate.personality_json = personalityData.personality_json
        
        // Extract communication style if available
        if (personalityData.personality_json.communication_style) {
          userUpdate.communication_style = personalityData.personality_json.communication_style
        }
      }

      // Update personality confidence
      const confidence: any = {}
      if (personalityData.mbti_confidence !== undefined) {
        confidence.mbti = personalityData.mbti_confidence
      }
      if (personalityData.enneagram_confidence !== undefined) {
        confidence.enneagram = personalityData.enneagram_confidence
      }
      if (personalityData.bigfive_confidence !== undefined) {
        confidence.bigfive = personalityData.bigfive_confidence
      }
      if (Object.keys(confidence).length > 0) {
        userUpdate.personality_confidence = confidence
      }
    }
    const personalityEmbedding = buildPersonalityEmbedding(personalityData)
    if (personalityEmbedding && personalityEmbedding.length > 0) {
      userUpdate.personality_embedding = personalityEmbedding
    }

    if (Object.keys(userUpdate).length > 1) { // More than just personality_last_updated
      console.log('Updating users table with:', {
        userId,
        userUpdateKeys: Object.keys(userUpdate),
        hasOfferSummary: !!offerSummaryText,
        hasWantSummary: !!wantSummaryText,
        hasOfferEmbedding: !!(offerEmbedding && offerEmbedding.length > 0),
        hasWantEmbedding: !!(wantEmbedding && wantEmbedding.length > 0),
        hasPersonality: !!(personalityData && Object.keys(personalityData).length > 0),
        hobbiesCount: hobbies.length
      })

      const { error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdate)
        .eq('user_id', userId)

      if (userUpdateError) {
        console.error('USERS UPDATE ERROR:', {
          error: userUpdateError,
          message: userUpdateError.message,
          details: userUpdateError.details,
          hint: userUpdateError.hint,
          code: userUpdateError.code,
          userUpdate
        })
        // Don't fail the whole request if user update fails
        return NextResponse.json({ 
          success: false,
          error: 'Failed to update user data',
          attendance_updated: true,
          user_update_error: userUpdateError.message,
          user_update_code: userUpdateError.code
        }, { status: 500 })
      }

      console.log('Users table updated successfully')
    } else {
      console.log('Skipping users update - no data to save')
    }

    // Trigger matching for this user if embeddings were generated/updated
    if (offerEmbedding || wantEmbedding || needEmbedding || profileEmbedding) {
      try {
        const matchResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event_id: eventId,
            user_id: userId,
            mode: 'incremental'
          })
        })
        
        if (matchResponse.ok) {
          console.log('Matching triggered after profile update')
        } else {
          console.warn('Failed to trigger matching after profile update:', await matchResponse.text())
        }
      } catch (matchError) {
        // Don't fail the request if matching fails
        console.warn('Error triggering matching after profile update:', matchError)
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Attendance derived successfully',
      personality_inferred: personalityData && Object.keys(personalityData).length > 0,
      summaries_generated: !!(offerSummaryText || wantSummaryText),
      embeddings_generated: !!(offerEmbedding || wantEmbedding || needEmbedding || profileEmbedding),
      hobbies_extracted: hobbies.length > 0
    })

  } catch (error: any) {
    console.error('Error in derive-attendance API:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message 
    }, { status: 500 })
  }
}

// Fallback function to generate basic summary if Edge Function fails
function generateBasicSummary(attendance: any): string {
  const user = attendance.users
  const whyAttending = attendance.why_attending_text || ''
  const connectionTypes = attendance.connection_types_selected || []
  const businessNeed = attendance.business_need_text || ''
  
  let summary = `${user?.first_name || 'This person'} is a ${user?.career_title || 'professional'}`
  if (user?.company_name) {
    summary += ` at ${user.company_name}`
  }
  if (user?.expertise_summary) {
    summary += ` with expertise in ${user.expertise_summary}`
  }
  
  if (whyAttending) {
    summary += `. They're attending because ${whyAttending}`
  }
  
  if (connectionTypes.length > 0) {
    summary += `. Looking for: ${connectionTypes.join(', ')}`
  }
  
  if (businessNeed) {
    summary += `. Business need: ${businessNeed}`
  }
  
  return summary
}

const CANONICAL_TOKEN_MAP: Record<string, string> = {
  client: "clients",
  clients: "clients",
  customer: "clients",
  customers: "clients",
  sales: "clients",
  leads: "clients",
  referrals: "clients",
  revenue: "clients",
  partnership: "partnerships",
  partnerships: "partnerships",
  collaborator: "partnerships",
  collaboration: "partnerships",
  integrations: "partnerships",
  mentor: "mentorship",
  mentors: "mentorship",
  mentorship: "mentorship",
  coaching: "mentorship",
  guidance: "mentorship",
  learning: "learning",
  beta: "beta_users",
  adopter: "beta_users",
  adopters: "beta_users",
  feedback: "beta_users",
  product: "product",
  products: "product",
  "product-management": "product",
  product_manager: "product",
  design: "design",
  designer: "design",
  designers: "design",
  ux: "design",
  ui: "design",
  engineering: "coding",
  engineer: "coding",
  engineers: "coding",
  developer: "coding",
  developers: "coding",
  code: "coding",
  coding: "coding",
  technical: "coding",
  software: "coding",
  data: "data",
  analytics: "data",
  analysis: "data",
  "data-science": "data",
  machine: "machine_learning",
  "machine-learning": "machine_learning",
  ml: "machine_learning",
  python: "machine_learning",
  ai: "machine_learning",
  hiring: "hiring",
  recruit: "hiring",
  recruiting: "hiring",
  recruitment: "hiring",
  recruiter: "hiring",
  talent: "hiring",
  singing: "music",
  music: "music",
  musician: "music",
  general: "networking",
  networking: "networking"
}

function canonicalizeToken(token: string): string | null {
  if (!token) return null
  const lower = token.toLowerCase().trim()
  if (!lower) return null
  const mapped = CANONICAL_TOKEN_MAP[lower] ?? lower
  return mapped.replace(/[^a-z0-9_]+/g, '_')
}

function normalizeTags(
  tags: (string | null | undefined)[],
  limit: number = 20
): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const tag of tags) {
    if (!tag) continue
    const cleaned = tag
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9\s&/+.-]/g, ' ')
      .trim()
    if (!cleaned) continue

    const rawParts = cleaned.split(/[\s/&,+-]+/).filter((part) => part.length > 1)
    if (rawParts.length === 0) continue

    for (const raw of rawParts) {
      const canonical = canonicalizeToken(raw)
      if (!canonical) continue
      if (!seen.has(canonical)) {
        seen.add(canonical)
        normalized.push(canonical)
        if (normalized.length >= limit) return normalized
      }
    }
  }

  return normalized
}

function extractKeywordTags(text: string | null | undefined, limit: number = 10): string[] {
  if (!text) return []
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/g)
    .filter((token) => token.length > 1)
  return normalizeTags(tokens, limit)
}

function extractIndustryTags(sources: string[], limit: number = 15): string[] {
  const combined = sources.filter(Boolean).join(' ')
  if (!combined) return []
  return extractKeywordTags(combined, limit)
}

function buildPersonalityEmbedding(personalityData: any): number[] | null {
  if (!personalityData || !personalityData.bigfive_scores) return null
  const traits = personalityData.bigfive_scores
  const values: number[] = []
  const traitOrder = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']

  for (const trait of traitOrder) {
    const value = traits?.[trait]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      values.push(Math.max(0, Math.min(1, value / 100)))
    } else {
      values.push(0.5) // neutral fallback if missing
    }
  }

  return values.length ? values : null
}

