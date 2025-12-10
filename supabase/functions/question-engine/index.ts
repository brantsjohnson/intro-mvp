// Edge Function: Question Engine
// Determines next adaptive question based on user's existing answers
// Uses AI to analyze previous responses and generate intelligent follow-up questions
// Focus: Discover personality types (MBTI, Enneagram, Big Five) through adaptive Q&A

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from "https://esm.sh/openai@4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map database connection types to human-readable descriptions
function getConnectionTypeContext(connectionTypes: string[]): string {
  const contexts: string[] = []
  
  connectionTypes.forEach(type => {
    switch(type) {
      case 'be_mentor':
        contexts.push('wants to BE a mentor (help others)')
        break
      case 'find_mentor':
        contexts.push('wants to FIND a mentor (seek guidance)')
        break
      case 'biz_opps':
        contexts.push('looking for business opportunities')
        break
      case 'find_job':
        contexts.push('looking for job opportunities')
        break
      case 'recruit':
        contexts.push('recruiting talent')
        break
      case 'general':
        contexts.push('general networking')
        break
    }
  })
  
  return contexts.join(', ') || 'general networking'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { event_id, user_id, previous_answer } = await req.json()

    if (!event_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'event_id and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Load user profile data
    const { data: userData } = await supabaseClient
      .from('users')
      .select('*')
      .eq('user_id', user_id)
      .single()

    // Load attendance/event answers
    const { data: attendanceData } = await supabaseClient
      .from('attendance')
      .select('*')
      .eq('event_id', event_id)
      .eq('user_id', user_id)
      .single()

    if (!attendanceData) {
      return new Response(
        JSON.stringify({ error: 'Attendance record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Load event data for context
    const { data: eventData } = await supabaseClient
      .from('events')
      .select('event_name, event_location, onboarding_question_schema')
      .eq('event_id', event_id)
      .single()

    // Load previous Q&A transcript
    const transcript = (attendanceData.adaptive_qna_json as any) || { version: 'v1', asked: [] }
    const questionsAsked = transcript.asked || []

    // Check if we should stop (after 4 questions - we analyze free text first, then ask only what's missing)
    if (questionsAsked.length >= 4) {
      return new Response(
        JSON.stringify({ done: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prepare context for AI
    const connectionTypesContext = getConnectionTypeContext(attendanceData.connection_types_selected || [])
    
    const userContext = {
      name: `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim(),
      jobTitle: userData?.career_title || '',
      company: userData?.company_name || '',
      expertise: userData?.expertise_summary || '',
      whyAttending: attendanceData.why_attending_text || '',
      connectionTypes: connectionTypesContext,
      businessNeed: attendanceData.business_need_text || '',
      followups: attendanceData.connection_followups_json || {},
      existingPersonality: {
        mbti: userData?.mbti_type || null,
        enneagram: userData?.enneagram_type || null,
        bigFive: userData?.bigfive_scores || null
      }
    }

    const eventContext = {
      eventName: eventData?.event_name || '',
      location: eventData?.event_location || '',
    }

    // Build comprehensive history of previous questions and answers
    const qaHistory = questionsAsked.map((qa: any, index: number) => {
      const questionText = qa.questionText || qa.qid || 'Unknown question'
      const answer = qa.choice || qa.answer || 'No answer'
      return `Q${index + 1}: "${questionText}" → ${answer}`
    }).join('\n')

    // Build a list of topics already covered to help AI avoid repetition
    const topicsCovered = questionsAsked.map((qa: any) => {
      const q = (qa.questionText || qa.qid || '').toLowerCase()
      // Extract topic keywords
      if (q.includes('inspir') || q.includes('excit') || q.includes('energiz')) return 'what_inspires'
      if (q.includes('work') || q.includes('role') || q.includes('job')) return 'work_preferences'
      if (q.includes('approach') || q.includes('handle') || q.includes('deal')) return 'work_approach'
      if (q.includes('decision') || q.includes('choose')) return 'decision_making'
      if (q.includes('collaborat') || q.includes('team') || q.includes('together')) return 'collaboration'
      if (q.includes('problem') || q.includes('solve') || q.includes('roadblock')) return 'problem_solving'
      if (q.includes('communicat') || q.includes('present') || q.includes('share')) return 'communication'
      if (q.includes('learn') || q.includes('learn')) return 'learning_style'
      if (q.includes('deadline') || q.includes('pressure') || q.includes('stress')) return 'stress_handling'
      if (q.includes('change') || q.includes('adapt')) return 'adaptability'
      return 'other'
    }).filter(t => t)

    // Check if we have enough free text to analyze personality first
    const hasFreeText = !!(userContext.whyAttending || userContext.businessNeed || userContext.expertise)
    
    // Initialize OpenAI if API key is available
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    let nextQuestion

    if (openaiApiKey) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey })

        // First, analyze free text to infer personality (only on first question if we have text)
        let personalityFromText = ''
        if (questionsAsked.length === 0 && hasFreeText) {
          try {
            const analysisPrompt = `Analyze this person's personality from their free text responses. Infer MBTI, Big Five, and communication style.

CRITICAL: Always use gender-neutral language. Never assume someone's gender. Use "they/them/their" pronouns, or refer to people by their name, title, or role. Never use "he/him/his" or "she/her" pronouns.

Their responses:
- Why attending: "${userContext.whyAttending || 'Not provided'}"
- Business need: "${userContext.businessNeed || 'Not provided'}"
- Expertise: "${userContext.expertise || 'Not provided'}"
- Job: ${userContext.jobTitle} at ${userContext.company}
- Goals: ${userContext.connectionTypes}

What personality traits can you infer? Be specific (e.g., "Extraverted, high Openness, analytical thinker" or "Introverted, detail-oriented, values collaboration"). Keep it brief (2-3 sentences max).`

            const analysisResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: analysisPrompt }],
              temperature: 0.7,
              max_tokens: 150,
            })
            
            personalityFromText = analysisResponse.choices[0]?.message?.content || ''
          } catch (e) {
            console.error('Error analyzing free text:', e)
            // Continue without analysis
          }
        }

        // Generate adaptive question using AI focused on personality discovery
        const prompt = `You're asking MAX 3-4 strategic personality questions at a networking event. Goal: Fill in gaps not covered by their free text responses.

CRITICAL: Always use gender-neutral language in all questions and descriptions. Never assume someone's gender. Use "they/them/their" pronouns, or refer to people by their name, title, or role. Never use "he/him/his" or "she/her" pronouns.

USER CONTEXT:
Job: ${userContext.jobTitle} at ${userContext.company}
Goals: ${userContext.connectionTypes}
Why attending: "${userContext.whyAttending || 'Not provided'}"
Business need: "${userContext.businessNeed || 'Not provided'}"
Expertise: "${userContext.expertise || 'Not provided'}"

${personalityFromText ? `PERSONALITY INFERRED FROM THEIR TEXT:\n${personalityFromText}\n\n` : ''}ALREADY ASKED (${questionsAsked.length} questions):
${qaHistory || 'None yet'}

TOPICS ALREADY COVERED: ${topicsCovered.length > 0 ? topicsCovered.join(', ') : 'None'}

YOUR TASK:
Ask ONE question that:
1. **Captures MULTIPLE personality dimensions at once** (e.g., work style + communication + decision-making)
2. Explores NEW topics not covered by their free text or previous questions
3. Is ultra-short (max 8 words) and natural
4. Each option reveals different personality traits

MULTI-DIMENSIONAL QUESTION STRATEGY:
Combine multiple dimensions in one question when possible:
- "How do you approach [X]?" → reveals work style + problem-solving + decision-making
- "When [situation], you prefer?" → reveals communication + collaboration + stress handling
- "What matters most when [context]?" → reveals values + work approach + personality type

TOPICS TO EXPLORE (only if not covered):
1. Decision-making style + work approach
2. Collaboration + communication preferences  
3. Problem-solving + adaptability
4. Values + what energizes them

CRITICAL:
- If ${personalityFromText ? 'their free text + ' : ''}previous questions already reveal a dimension, skip it
- Each question should capture 2-3 personality dimensions, not just one
- Keep it SHORT (max 8 words question, 3-4 words per option)
- NO repetition - check history above
- DO NOT reveal personality labels in questions/answers

OUTPUT (JSON only):
{
  "id": "q${questionsAsked.length + 1}",
  "text": "Ultra-short multi-dimensional question (max 8 words)",
  "options": [
    { "key": "A", "label": "Option (3-4 words)" },
    { "key": "B", "label": "Option (3-4 words)" },
    { "key": "C", "label": "Option (3-4 words)" }
  ]
}`

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini", // Using mini for cost efficiency
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 350,
        })

        const text = response.choices[0]?.message?.content || ''
        
        // Clean up the response - remove markdown code blocks if present
        let cleanedText = text.trim()
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
        } else if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '')
        }

        try {
          nextQuestion = JSON.parse(cleanedText)
        } catch (parseError) {
          console.error('Failed to parse AI response:', cleanedText)
          // Fall back to default question
          nextQuestion = getDefaultQuestion(questionsAsked.length, connectionTypesContext)
        }
      } catch (aiError) {
        console.error('OpenAI API error:', aiError)
        // Fall back to default questions if AI fails
        nextQuestion = getDefaultQuestion(questionsAsked.length, connectionTypesContext)
      }
    } else {
      // No OpenAI API key - use default questions
      console.log('No OPENAI_API_KEY found, using default questions')
      nextQuestion = getDefaultQuestion(questionsAsked.length, connectionTypesContext)
    }

    return new Response(
      JSON.stringify({
        done: false,
        question: nextQuestion
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Question engine error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Default questions as fallback (when AI is not available or fails)
// These are ultra-short, multi-dimensional questions
function getDefaultQuestion(index: number, connectionContext: string): any {
  const defaultQuestions = [
    {
      id: 'q1',
      text: 'How do you approach challenges?',
      options: [
        { key: 'A', label: 'Plan carefully' },
        { key: 'B', label: 'Jump in quickly' },
        { key: 'C', label: 'Get team input' }
      ]
    },
    {
      id: 'q2',
      text: 'When working, you prefer:',
      options: [
        { key: 'A', label: 'Solo deep focus' },
        { key: 'B', label: 'Collaborative teams' },
        { key: 'C', label: 'Mix of both' }
      ]
    },
    {
      id: 'q3',
      text: 'What energizes you most?',
      options: [
        { key: 'A', label: 'Solving problems' },
        { key: 'B', label: 'Working with people' },
        { key: 'C', label: 'Creating new things' }
      ]
    },
    {
      id: 'q4',
      text: 'When stuck, you:',
      options: [
        { key: 'A', label: 'Step back and think' },
        { key: 'B', label: 'Ask for help' },
        { key: 'C', label: 'Try new approaches' }
      ]
    }
  ]

  return defaultQuestions[Math.min(index, defaultQuestions.length - 1)]
}

