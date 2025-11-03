// Edge Function: Question Engine
// Determines next adaptive question based on user's existing answers
// All logic runs server-side - no personality terminology exposed to client

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Load previous Q&A transcript
    const transcript = (attendanceData.adaptive_qna_json as any) || { version: 'v1', asked: [] }
    const questionsAsked = transcript.asked || []

    // If previous_answer provided, we can update trait confidence here
    // For now, this is a basic implementation
    // TODO: Implement full trait inference logic using OpenAI/embeddings

    // Basic logic: return questions until we've asked 10 or have enough confidence
    // This is a placeholder - full implementation would:
    // 1. Track confidence per framework (OCEAN, MBTI, Enneagram, etc.)
    // 2. Pick next question to disambiguate lowest-confidence area
    // 3. Use contextual information from user's answers

    if (questionsAsked.length >= 10) {
      return new Response(
        JSON.stringify({ done: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For now, return placeholder questions
    // In full implementation, these would be dynamically selected based on:
    // - Lowest confidence framework
    // - User's career/event context
    // - Previous answers

    const placeholderQuestions = [
      {
        id: 'q1',
        text: 'When working on a team project, what matters most to you?',
        options: [
          { key: 'A', label: 'Getting the details right' },
          { key: 'B', label: 'Moving quickly and iterating' },
          { key: 'C', label: 'Building relationships with team members' }
        ]
      },
      {
        id: 'q2',
        text: 'How do you prefer to recharge after a busy day?',
        options: [
          { key: 'A', label: 'Spending time with friends or family' },
          { key: 'B', label: 'Having quiet time alone' },
          { key: 'C', label: 'Trying a new activity or hobby' }
        ]
      },
      {
        id: 'q3',
        text: 'What energizes you most about networking events?',
        options: [
          { key: 'A', label: 'Meeting lots of new people' },
          { key: 'B', label: 'Having deep conversations with a few people' },
          { key: 'C', label: 'Learning about new opportunities and ideas' }
        ]
      }
    ]

    const nextQuestion = placeholderQuestions[Math.min(questionsAsked.length, placeholderQuestions.length - 1)]

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

