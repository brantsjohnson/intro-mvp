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
    let eventProfileEmbedding: number[] | null = null

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

        // Generate event profile embedding (combination of offer + want + event context)
        const eventProfileText = `Offer: ${offerSummaryText}\nWant: ${wantSummaryText}\nEvent: ${(attendance as any).events?.event_name || ''}`
        const eventProfileEmbedResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: eventProfileText,
        })
        eventProfileEmbedding = eventProfileEmbedResponse.data[0]?.embedding || null

      } catch (embeddingError) {
        console.error('Error generating summaries/embeddings:', embeddingError)
        // Continue without embeddings - they're not critical
      }
    }

    // Build career goals tags from connection types and business needs
    const careerGoalsTags: string[] = [...goalsTags]
    if (attendance.business_need_text) {
      const needWords = attendance.business_need_text.toLowerCase().split(/[,\s]+/).filter(w => w.length > 3)
      careerGoalsTags.push(...needWords.slice(0, 2))
    }

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
      event_offer_tags: offerTags,
      event_want_tags: wantTags,
      event_goals_tags: goalsTags,
      event_availability_status: availabilityStatus,
      event_role_intent: roleIntent,
      onboarding_completed: true,
      last_seen_at: new Date().toISOString(),
      attendee_first_name: user?.first_name || null,
      attendee_last_name: user?.last_name || null,
    }

    // Add embeddings if generated (Supabase pgvector expects array directly)
    if (eventProfileEmbedding && eventProfileEmbedding.length > 0) {
      attendanceUpdate.event_profile_embedding = eventProfileEmbedding
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
    if (offerTags.length > 0) {
      userUpdate.offer_tags = offerTags
    }
    if (wantTags.length > 0) {
      userUpdate.want_tags = wantTags
    }
    if (careerGoalsTags.length > 0) {
      userUpdate.career_goals_tags = careerGoalsTags
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

    return NextResponse.json({ 
      success: true,
      message: 'Attendance derived successfully',
      personality_inferred: personalityData && Object.keys(personalityData).length > 0,
      summaries_generated: !!(offerSummaryText || wantSummaryText),
      embeddings_generated: !!(offerEmbedding || wantEmbedding || eventProfileEmbedding),
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

