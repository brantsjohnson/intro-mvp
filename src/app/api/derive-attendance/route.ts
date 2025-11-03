import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    if (attendanceError || !attendance) {
      return NextResponse.json({ 
        error: 'Attendance record not found' 
      }, { status: 404 })
    }

    // Generate summary and tags from attendance data
    // TODO: In future, use Edge Function with OpenAI to generate embeddings
    // For now, generate basic summary and extract tags from answers
    
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
      const expertiseWords = user.expertise_summary.toLowerCase().split(/[,\s]+/)
      offerTags.push(...expertiseWords.slice(0, 3)) // Add top 3 expertise words as tags
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

    // Update attendance with derived data
    const { error: updateError } = await supabase
      .from('attendance')
      .update({
        event_profile_summary_text: summary,
        event_offer_tags: offerTags,
        event_want_tags: wantTags,
        event_goals_tags: goalsTags,
        event_availability_status: availabilityStatus,
        event_role_intent: roleIntent,
        onboarding_completed: true
      })
      .eq('event_id', eventId)
      .eq('user_id', userId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update attendance',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Attendance derived successfully'
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

