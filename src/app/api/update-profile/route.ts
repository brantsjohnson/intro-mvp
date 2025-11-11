import { NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_id, user_id, users_update, attendance_update } = body

    if (!event_id || !user_id) {
      return NextResponse.json(
        { error: "event_id and user_id are required" },
        { status: 400 }
      )
    }

    const supabase = await createServerComponentClient()

    // Verify user has permission to update this profile
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || user.id !== user_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Update users table if provided
    if (users_update && Object.keys(users_update).length > 0) {
      const { error: usersError } = await supabase
        .from("users")
        .update(users_update)
        .eq("user_id", user_id)

      if (usersError) {
        console.error("Error updating users table:", usersError)
        return NextResponse.json(
          { error: "Failed to update user profile" },
          { status: 500 }
        )
      }
    }

    // Update attendance table if provided
    if (attendance_update && Object.keys(attendance_update).length > 0) {
      // Add the embedding reset fields
      const attendanceWithReset = {
        ...attendance_update,
        last_profile_change_at: new Date().toISOString(),
        event_need_embedding: null,
        event_need_embedding_synced_at: null,
        event_offer_embedding: null,
        event_offer_embedding_synced_at: null
      }

      const { error: attendanceError } = await supabase
        .from("attendance")
        .update(attendanceWithReset)
        .eq("event_id", event_id)
        .eq("user_id", user_id)

      if (attendanceError) {
        console.error("Error updating attendance table:", attendanceError)
        return NextResponse.json(
          { error: "Failed to update event profile" },
          { status: 500 }
        )
      }
    }

    // Get event code for auto-match endpoint
    let eventCode = null
    try {
      const { data: eventData } = await supabase
        .from("events")
        .select("event_code")
        .eq("event_id", event_id)
        .single()
      
      if (eventData) {
        eventCode = eventData.event_code
      }
    } catch (err) {
      console.error("Failed to get event code:", err)
    }

    // Trigger match rerun in the background
    try {
      // First, try to call the auto-match endpoint if we have event code
      if (eventCode) {
        const autoMatchResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || ''}/api/auto-match-new-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('Authorization') || ''
          },
          body: JSON.stringify({ userId: user_id, eventCode })
        })

        if (!autoMatchResponse.ok) {
          console.error("Failed to trigger auto-match, trying edge function directly")
        }
      }
      
      // Always try edge function as fallback
      const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/matchmaker`
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      
      if (edgeFunctionUrl && serviceKey) {
        const edgeResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ event_id, user_id })
        })
        
        if (!edgeResponse.ok) {
          console.error("Failed to trigger edge function:", await edgeResponse.text())
        }
      }
    } catch (matchError) {
      // Log error but don't fail the request
      console.error("Error triggering match rerun:", matchError)
    }

    return NextResponse.json({ 
      ok: true,
      message: "Profile updated successfully" 
    })
    
  } catch (error) {
    console.error("Update profile error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
