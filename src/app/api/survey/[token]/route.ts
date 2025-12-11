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

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const params = await context.params
    const tokenValue = params?.token
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

    // Fetch all attendees for this event, with connections marked
    let attendees: Array<{ userId: string; firstName: string; lastName: string; photoUrl: string | null; isConnected: boolean }> = []
    let allConnections: Array<{ a_id: string; b_id: string; connection_kind: string; user_add_method: string | null }> | null = null
    let connectionRows: Array<{ a_id: string; b_id: string; connection_kind: string; user_add_method: string | null }> = []
    let connectedUserIds = new Set<string>()
    
    if (tokenRow.recipient_user_id) {
      // Get all attendees for this event (excluding the current user)
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          user_id,
          users:user_id (
            user_id,
            first_name,
            last_name,
            photo_url
          )
        `)
        .eq('event_id', tokenRow.event_id)
        .neq('user_id', tokenRow.recipient_user_id)

      if (!attendanceError && attendanceRows) {
        // Get connected user IDs - match the home page logic EXACTLY: get ALL connections
        // The home page doesn't filter by connection_kind in the query - it gets everything
        // First, let's check if ANY connections exist for this event
        const { count: totalConnectionsInEvent } = await supabase
          .from('connections')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', tokenRow.event_id)
        
        console.log(`[Survey] Total connections in event ${tokenRow.event_id}: ${totalConnectionsInEvent || 0}`)
        
        const { data: connectionsData, error: allConnectionsError } = await supabase
          .from('connections')
          .select('a_id, b_id, connection_kind, user_add_method, created_by_user_id')
          .eq('event_id', tokenRow.event_id)
          .or(`a_id.eq.${tokenRow.recipient_user_id},b_id.eq.${tokenRow.recipient_user_id}`)
          // Don't filter by connection_kind here - get ALL connections like home page does
          // Also don't filter self-connections here - we'll do that in processing

        allConnections = connectionsData || null
        
        console.log(`[Survey] Found ${allConnections?.length || 0} total connections for user ${tokenRow.recipient_user_id} in event ${tokenRow.event_id}`)
        if (allConnectionsError) {
          console.error('[Survey] Error fetching all connections:', allConnectionsError)
        }
        if (allConnections && allConnections.length > 0) {
          console.log('[Survey] All connections found:', JSON.stringify(allConnections.map(c => ({
            a_id: c.a_id,
            b_id: c.b_id,
            kind: c.connection_kind,
            method: c.user_add_method,
            created_by: c.created_by_user_id
          })), null, 2))
        } else {
          console.warn(`[Survey] No connections found at all for user ${tokenRow.recipient_user_id}. This might mean:`)
          console.warn(`[Survey] 1. Connections don't exist in database`)
          console.warn(`[Survey] 2. User ID mismatch (checking user: ${tokenRow.recipient_user_id})`)
          console.warn(`[Survey] 3. Event ID mismatch (checking event: ${tokenRow.event_id})`)
        }

        // Filter for user-added connections (QR scans, manual adds) - match home page logic
        // Include ALL connections that the user has interacted with
        connectionRows = allConnections?.filter(c => {
          // Skip self-connections
          if (c.a_id === c.b_id) return false
          
          // Include if it's a user-added connection (QR, manual, met, etc.)
          const isUserAdded = c.connection_kind === 'user_added'
          const isManualMethod = c.user_add_method === 'qr' || 
                                 c.user_add_method === 'manual_add' || 
                                 c.user_add_method === 'manual_directory' ||
                                 c.user_add_method === 'met'
          
          // Also include system matches if they have a user_add_method (user interacted with them)
          const isSystemMatchWithInteraction = c.connection_kind === 'system_match' && c.user_add_method !== null
          
          return isUserAdded || isManualMethod || isSystemMatchWithInteraction
        }) || []
        
        console.log(`[Survey] Filtered to ${connectionRows.length} user-interacted connections`)
        if (connectionRows.length === 0 && (allConnections?.length || 0) > 0) {
          console.warn(`[Survey] Found ${allConnections.length} connections but none matched user-interaction criteria`)
          console.warn(`[Survey] Connection kinds found:`, [...new Set(allConnections.map(c => c.connection_kind))])
          console.warn(`[Survey] User add methods found:`, [...new Set(allConnections.map(c => c.user_add_method).filter(Boolean))])
        }

        connectedUserIds = new Set<string>()
        if (connectionRows) {
          connectionRows.forEach(c => {
            // Skip if this is a self-connection
            if (c.a_id === c.b_id) {
              console.warn(`[Survey] Skipping self-connection: ${c.a_id} === ${c.b_id}`)
              return
            }
            
            const otherId = c.a_id === tokenRow.recipient_user_id ? c.b_id : c.a_id
            // Double-check we're not adding the current user
            if (otherId && otherId !== tokenRow.recipient_user_id) {
              connectedUserIds.add(otherId)
              console.log(`[Survey] Added connection: ${otherId} (method: ${c.user_add_method || 'unknown'})`)
            } else {
              console.warn(`[Survey] Skipping invalid connection: otherId=${otherId}, recipient=${tokenRow.recipient_user_id}`)
            }
          })
        }
        
        console.log(`[Survey] Total connected user IDs: ${connectedUserIds.size}`, Array.from(connectedUserIds))

        // Map attendees and mark connections - ensure we never include the current user
        const allAttendees = attendanceRows
          .map((row: any) => {
            const user = row.users
            if (!user || user.user_id === tokenRow.recipient_user_id) return null
            
            return {
              userId: user.user_id,
              firstName: user.first_name || '',
              lastName: user.last_name || '',
              photoUrl: user.photo_url || null,
              isConnected: connectedUserIds.has(user.user_id),
            }
          })
          .filter((a): a is { userId: string; firstName: string; lastName: string; photoUrl: string | null; isConnected: boolean } => a !== null && a.userId !== tokenRow.recipient_user_id)

        // Sort: connected ones first, then alphabetically by name
        attendees = allAttendees.sort((a, b) => {
          // Connected ones come first
          if (a.isConnected && !b.isConnected) return -1
          if (!a.isConnected && b.isConnected) return 1
          
          // Then sort alphabetically by last name, then first name
          const aLast = a.lastName.toLowerCase()
          const bLast = b.lastName.toLowerCase()
          if (aLast !== bLast) return aLast.localeCompare(bLast)
          return a.firstName.toLowerCase().localeCompare(b.firstName.toLowerCase())
        })
        
        console.log(`[Survey] Total attendees: ${attendees.length}, Connected: ${attendees.filter(a => a.isConnected).length}`)
        console.log(`[Survey] Connected attendees:`, attendees.filter(a => a.isConnected).map(a => `${a.firstName} ${a.lastName} (${a.userId})`))
      }
    }

    return NextResponse.json({
      eventId: tokenRow.event_id,
      eventName: event?.event_name ?? 'this event',
      customQuestion,
      fixedQuestions: FIXED_RATING_QUESTIONS,
      openQuestion: OPEN_QUESTION,
      expiresAt: tokenRow.expires_at,
      attendees,
      _debug: tokenRow.recipient_user_id ? {
        recipientUserId: tokenRow.recipient_user_id,
        totalConnectionsFound: allConnections?.length || 0,
        userAddedConnections: connectionRows?.length || 0,
        connectedUserIds: Array.from(connectedUserIds || []),
        connectionDetails: allConnections?.map(c => ({
          a_id: c.a_id,
          b_id: c.b_id,
          kind: c.connection_kind,
          method: c.user_add_method,
          involvesUser: c.a_id === tokenRow.recipient_user_id || c.b_id === tokenRow.recipient_user_id
        })) || []
      } : undefined
    })
  } catch (error) {
    console.error('Survey GET error:', error)
    return NextResponse.json(
      { error: 'Unable to load survey' },
      { status: error instanceof Error && error.message.includes('environment') ? 500 : 500 }
    )
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const params = await context.params
    const tokenValue = params?.token
    if (!tokenValue) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const payload = await request.json()
    const ratingCustom = Number(payload?.ratingCustom)
    const ratingUseful = Number(payload?.ratingUseful)
    const ratingBusiness = Number(payload?.ratingBusiness)
    // Accept either openAnswer (text) or selectedConnections (array of user IDs)
    const openAnswer = typeof payload?.openAnswer === 'string' && payload.openAnswer.trim().length > 0
      ? payload.openAnswer.trim()
      : Array.isArray(payload?.selectedConnections) && payload.selectedConnections.length > 0
      ? JSON.stringify(payload.selectedConnections)
      : null

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

