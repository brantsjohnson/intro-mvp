import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { eventId, userId, selectedOption } = await request.json()
    
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

    // If selectedOption is provided, update the adaptive_qna_json transcript
    if (selectedOption?.qid && selectedOption?.choice) {
      const { data: attendance } = await supabase
        .from('attendance')
        .select('adaptive_qna_json')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .single()

      const currentTranscript = (attendance?.adaptive_qna_json as any) || { version: 'v1', asked: [] }
      const updatedTranscript = {
        ...currentTranscript,
        asked: [
          ...(currentTranscript.asked || []),
          { 
            qid: selectedOption.qid, 
            choice: selectedOption.choice,
            questionText: selectedOption.questionText || null // Store question text for AI context
          }
        ]
      }

      await supabase
        .from('attendance')
        .update({ adaptive_qna_json: updatedTranscript })
        .eq('event_id', eventId)
        .eq('user_id', userId)
    }

    // Call the Edge Function to get the next question
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/question-engine`
    const edgeFunctionResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_id: eventId,
        user_id: userId,
        previous_answer: selectedOption
      })
    })

    if (!edgeFunctionResponse.ok) {
      const errorText = await edgeFunctionResponse.text()
      console.error('Edge Function error:', errorText)
      return NextResponse.json({ 
        error: 'Failed to get next question',
        details: errorText
      }, { status: 500 })
    }

    const result = await edgeFunctionResponse.json()

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Error in questions/next API:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message 
    }, { status: 500 })
  }
}

