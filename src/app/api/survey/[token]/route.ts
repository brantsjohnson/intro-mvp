import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const FIXED_RATING_QUESTIONS = [
  'How useful is this app in helping you build your network?',
  'How likely are you to do business with the interactions it suggested?',
]

const OPEN_QUESTION = 'Who was your most beneficial connection you made at the event?'

type TokenRecord = {
  id: string
  event_id: string
  recipient_user_id: string | null
  recipient_email: string
  expires_at: string
  used_at: string | null
}

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() < Date.now()
}

async function fetchToken(supabase: SupabaseClient, token: string): Promise<TokenRecord | null> {
  const { data, error } = await supabase
    .from('event_survey_tokens')
    .select('id, event_id, recipient_user_id, recipient_email, expires_at, used_at')
    .eq('token', token)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows
      return null
    }
    console.error('Error fetching survey token:', error)
    throw error
  }

  return data as TokenRecord
}

export async function GET(_request: NextRequest, context: { params: { token: string } }) {
  try {
    const tokenValue = context.params?.token
    if (!tokenValue) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const supabase = getSupabase()
    const tokenRow = await fetchToken(supabase, tokenValue)

    if (!tokenRow) {
      return NextResponse.json({ error: 'Survey link not found' }, { status: 404 })
    }

    if (tokenRow.used_at) {
      return NextResponse.json({ error: 'This survey link was already used' }, { status: 410 })
    }

    if (isExpired(tokenRow.expires_at)) {
      return NextResponse.json({ error: 'This survey link has expired' }, { status: 410 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('event_name, matching_config')
      .eq('event_id', tokenRow.event_id)
      .single()

    if (eventError) {
      console.error('Error fetching event for survey:', eventError)
      return NextResponse.json({ error: 'Failed to load survey' }, { status: 500 })
    }

    const matchingConfig = (event?.matching_config as Record<string, unknown>) || {}
    const customQuestion =
      typeof matchingConfig.survey_question === 'string' && matchingConfig.survey_question.trim().length > 0
        ? matchingConfig.survey_question.trim()
        : 'How would you rate this event overall?'

    return NextResponse.json({
      eventId: tokenRow.event_id,
      eventName: event?.event_name ?? 'this event',
      customQuestion,
      fixedQuestions: FIXED_RATING_QUESTIONS,
      openQuestion: OPEN_QUESTION,
      expiresAt: tokenRow.expires_at,
    })
  } catch (error) {
    console.error('Survey GET error:', error)
    return NextResponse.json(
      { error: 'Unable to load survey' },
      { status: error instanceof Error && error.message.includes('environment') ? 500 : 500 }
    )
  }
}

export async function POST(request: NextRequest, context: { params: { token: string } }) {
  try {
    const tokenValue = context.params?.token
    if (!tokenValue) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const payload = await request.json()
    const ratingCustom = Number(payload?.ratingCustom)
    const ratingUseful = Number(payload?.ratingUseful)
    const ratingBusiness = Number(payload?.ratingBusiness)
    const openAnswer = typeof payload?.openAnswer === 'string' ? payload.openAnswer.trim() : null

    const ratings = [ratingCustom, ratingUseful, ratingBusiness]
    const invalidRating = ratings.some((value) => Number.isNaN(value) || value < 1 || value > 5)

    if (invalidRating) {
      return NextResponse.json({ error: 'All ratings must be between 1 and 5' }, { status: 400 })
    }

    const supabase = getSupabase()
    const tokenRow = await fetchToken(supabase, tokenValue)

    if (!tokenRow) {
      return NextResponse.json({ error: 'Survey link not found' }, { status: 404 })
    }

    if (tokenRow.used_at) {
      return NextResponse.json({ error: 'This survey link was already used' }, { status: 410 })
    }

    if (isExpired(tokenRow.expires_at)) {
      return NextResponse.json({ error: 'This survey link has expired' }, { status: 410 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('event_name, matching_config')
      .eq('event_id', tokenRow.event_id)
      .single()

    if (eventError) {
      console.error('Error fetching event during survey submission:', eventError)
      return NextResponse.json({ error: 'Failed to submit survey' }, { status: 500 })
    }

    const matchingConfig = (event?.matching_config as Record<string, unknown>) || {}
    const customQuestion =
      typeof matchingConfig.survey_question === 'string' && matchingConfig.survey_question.trim().length > 0
        ? matchingConfig.survey_question.trim()
        : 'How would you rate this event overall?'

    // Guard against duplicate submissions for this token
    const { data: existingResponse, error: existingError } = await supabase
      .from('event_survey_responses')
      .select('id')
      .eq('token_id', tokenRow.id)
      .maybeSingle()

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Error checking existing survey response:', existingError)
      return NextResponse.json({ error: 'Failed to submit survey' }, { status: 500 })
    }

    if (existingResponse) {
      return NextResponse.json({ error: 'Survey already submitted' }, { status: 409 })
    }

    const { error: insertError } = await supabase.from('event_survey_responses').insert({
      event_id: tokenRow.event_id,
      token_id: tokenRow.id,
      recipient_user_id: tokenRow.recipient_user_id,
      recipient_email: tokenRow.recipient_email,
      rating_custom: ratingCustom,
      rating_useful: ratingUseful,
      rating_business: ratingBusiness,
      open_answer: openAnswer,
      custom_question: customQuestion,
    })

    if (insertError) {
      console.error('Error saving survey response:', insertError)
      return NextResponse.json({ error: 'Failed to save survey response' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('event_survey_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    if (updateError) {
      console.error('Error marking survey token used:', updateError)
      // Do not fail the submission if marking used fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Survey POST error:', error)
    return NextResponse.json(
      { error: 'Unable to submit survey' },
      { status: error instanceof Error && error.message.includes('environment') ? 500 : 500 }
    )
  }
}

