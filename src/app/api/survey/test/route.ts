import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const FIXED_RATING_QUESTIONS = [
  'How useful is this app in helping you build your network?',
  'How likely are you to do business with the interactions it suggested?',
]

const OPEN_QUESTION = 'Who was your most beneficial connection you made at the event?'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function GET(_request: NextRequest) {
  try {
    // Get the current logged-in user from the session
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ 
        error: 'Missing Supabase configuration' 
      }, { status: 500 })
    }

    const serverSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op for GET requests
        },
      },
    })

    const { data: { user: authUser }, error: authError } = await serverSupabase.auth.getUser()
    
    if (authError || !authUser) {
      return NextResponse.json({ 
        error: 'You must be logged in to view the test survey',
        details: authError?.message 
      }, { status: 401 })
    }

    const supabase = getSupabase()
    
    // Find event with code "test12"
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('event_id, event_name, matching_config')
      .eq('event_code', 'TEST12')
      .single()

    if (eventError || !event) {
      return NextResponse.json({ 
        error: 'Event TEST12 not found. Please create an event with code TEST12 first.',
        details: eventError?.message 
      }, { status: 404 })
    }

    const matchingConfig = (event?.matching_config as Record<string, unknown>) || {}
    const customQuestion =
      typeof matchingConfig.survey_question === 'string' && matchingConfig.survey_question.trim().length > 0
        ? matchingConfig.survey_question.trim()
        : 'How would you rate this event overall?'

    // Get the current user's attendance for this event
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('user_id')
      .eq('event_id', event.event_id)
      .eq('user_id', authUser.id)
      .single()
    
    // If the user hasn't attended this event, return an error
    if (!attendanceData) {
      return NextResponse.json({ 
        error: 'You have not attended event TEST12. Please ensure you are registered for this event.',
      }, { status: 404 })
    }

    let attendees: Array<{ userId: string; firstName: string; lastName: string; photoUrl: string | null; isConnected: boolean }> = []
    let allConnections: Array<{ a_id: string; b_id: string; connection_kind: string; user_add_method: string | null }> | null = null
    let connectionRows: Array<{ a_id: string; b_id: string; connection_kind: string; user_add_method: string | null }> = []
    let connectedUserIds = new Set<string>()
    const testUserId = authUser.id // Use the logged-in user's ID
    
    // Get all attendees for this event (excluding the test user)
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
        .eq('event_id', event.event_id)
        .neq('user_id', testUserId)

      if (!attendanceError && attendanceRows) {
        // Get connected user IDs - match the home page logic EXACTLY: get ALL connections
        // The home page doesn't filter by connection_kind in the query - it gets everything
        // First, let's check if ANY connections exist for this event
        const { count: totalConnectionsInEvent } = await supabase
          .from('connections')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.event_id)
        
        console.log(`[Survey Test] Total connections in event ${event.event_id}: ${totalConnectionsInEvent || 0}`)
        
        const { data: connectionsData, error: allConnectionsError } = await supabase
          .from('connections')
          .select('a_id, b_id, connection_kind, user_add_method, created_by_user_id')
          .eq('event_id', event.event_id)
          .or(`a_id.eq.${testUserId},b_id.eq.${testUserId}`)
          // Don't filter by connection_kind here - get ALL connections like home page does
          // Also don't filter self-connections here - we'll do that in processing

        allConnections = connectionsData || null
        
        console.log(`[Survey Test] Found ${allConnections?.length || 0} total connections for user ${testUserId} in event ${event.event_id}`)
        if (allConnectionsError) {
          console.error('[Survey Test] Error fetching all connections:', allConnectionsError)
        }
        if (allConnections && allConnections.length > 0) {
          console.log('[Survey Test] All connections found:', JSON.stringify(allConnections.map(c => ({
            a_id: c.a_id,
            b_id: c.b_id,
            kind: c.connection_kind,
            method: c.user_add_method,
            created_by: c.created_by_user_id
          })), null, 2))
        } else {
          console.warn(`[Survey Test] No connections found at all for user ${testUserId}. This might mean:`)
          console.warn(`[Survey Test] 1. Connections don't exist in database`)
          console.warn(`[Survey Test] 2. User ID mismatch (checking user: ${testUserId})`)
          console.warn(`[Survey Test] 3. Event ID mismatch (checking event: ${event.event_id})`)
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
        
        console.log(`[Survey Test] Filtered to ${connectionRows.length} user-interacted connections`)
        if (connectionRows.length === 0 && (allConnections?.length || 0) > 0) {
          console.warn(`[Survey Test] Found ${allConnections.length} connections but none matched user-interaction criteria`)
          console.warn(`[Survey Test] Connection kinds found:`, [...new Set(allConnections.map(c => c.connection_kind))])
          console.warn(`[Survey Test] User add methods found:`, [...new Set(allConnections.map(c => c.user_add_method).filter(Boolean))])
        }

        connectedUserIds = new Set<string>()
        if (connectionRows) {
          connectionRows.forEach(c => {
            // Skip if this is a self-connection
            if (c.a_id === c.b_id) {
              console.warn(`[Survey Test] Skipping self-connection: ${c.a_id} === ${c.b_id}`)
              return
            }
            
            const otherId = c.a_id === testUserId ? c.b_id : c.a_id
            // Double-check we're not adding the current user
            if (otherId && otherId !== testUserId) {
              connectedUserIds.add(otherId)
              console.log(`[Survey Test] Added connection: ${otherId} (method: ${c.user_add_method || 'unknown'})`)
            } else {
              console.warn(`[Survey Test] Skipping invalid connection: otherId=${otherId}, testUserId=${testUserId}`)
            }
          })
        }
        
        console.log(`[Survey Test] Total connected user IDs: ${connectedUserIds.size}`, Array.from(connectedUserIds))

        // Map attendees and mark connections - ensure we never include the current user
        const allAttendees = attendanceRows
          .map((row: any) => {
            const user = row.users
            if (!user || user.user_id === testUserId) return null
            
            return {
              userId: user.user_id,
              firstName: user.first_name || '',
              lastName: user.last_name || '',
              photoUrl: user.photo_url || null,
              isConnected: connectedUserIds.has(user.user_id),
            }
          })
          .filter((a): a is { userId: string; firstName: string; lastName: string; photoUrl: string | null; isConnected: boolean } => a !== null && a.userId !== testUserId)

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
        
        console.log(`[Survey Test] Total attendees: ${attendees.length}, Connected: ${attendees.filter(a => a.isConnected).length}`)
        console.log(`[Survey Test] Connected attendees:`, attendees.filter(a => a.isConnected).map(a => `${a.firstName} ${a.lastName} (${a.userId})`))
      }

    return NextResponse.json({
      eventId: event.event_id,
      eventName: event?.event_name ?? 'Test Event',
      customQuestion,
      fixedQuestions: FIXED_RATING_QUESTIONS,
      openQuestion: OPEN_QUESTION,
      attendees,
      _debug: {
        testUserId: testUserId,
        totalConnectionsFound: allConnections?.length || 0,
        userAddedConnections: connectionRows.length,
        connectedUserIds: Array.from(connectedUserIds),
        connectionDetails: allConnections?.map(c => ({
          a_id: c.a_id,
          b_id: c.b_id,
          kind: c.connection_kind,
          method: c.user_add_method,
          involvesUser: testUserId ? (c.a_id === testUserId || c.b_id === testUserId) : false
        })) || []
      }
    })
  } catch (error) {
    console.error('Survey test GET error:', error)
    return NextResponse.json(
      { error: 'Unable to load test survey', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
