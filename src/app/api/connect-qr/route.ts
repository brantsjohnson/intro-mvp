import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { refreshPairMatchExplanation } from "@/lib/matching/refresh-explanations"

export async function POST(request: NextRequest) {
  try {
    const { scannerUserId, targetUserId, eventId } = await request.json()

    if (!scannerUserId || !targetUserId || !eventId) {
      return NextResponse.json(
        { error: "scannerUserId, targetUserId, and eventId are required" },
        { status: 400 }
      )
    }

    if (scannerUserId === targetUserId) {
      return NextResponse.json({ error: "Cannot connect user to themselves" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Ensure both users are part of the event
    const [{ data: scannerAttendance }, { data: targetAttendance }] = await Promise.all([
      supabase
        .from("attendance")
        .select("event_id")
        .eq("user_id", scannerUserId)
        .eq("event_id", eventId)
        .maybeSingle(),
      supabase
        .from("attendance")
        .select("event_id")
        .eq("user_id", targetUserId)
        .eq("event_id", eventId)
        .maybeSingle(),
    ])

    if (!scannerAttendance || !targetAttendance) {
      return NextResponse.json(
        { error: "Both users must be registered for the event" },
        { status: 403 }
      )
    }

    const [aId, bId] =
      scannerUserId < targetUserId ? [scannerUserId, targetUserId] : [targetUserId, scannerUserId]

    // Check if connection already exists
    const { data: existingConnection, error: checkError } = await supabase
      .from("connections")
      .select("connection_id, connection_kind")
      .eq("event_id", eventId)
      .eq("a_id", aId)
      .eq("b_id", bId)
      .maybeSingle()

    if (checkError) {
      console.error("Error checking existing connection:", checkError)
      throw checkError
    }

    // If connection already exists, return success with full details
    if (existingConnection) {
      // If it's a pending request, upgrade it to confirmed
      if (existingConnection.connection_kind === "user_request_pending") {
        const { error: updateError } = await supabase
          .from("connections")
          .update({
            connection_kind: "user_added",
            user_add_method: "qr",
            created_by_user_id: scannerUserId,
          })
          .eq("connection_id", existingConnection.connection_id)

        if (updateError) {
          console.error("Error updating pending connection:", updateError)
          throw updateError
        }
      }
      // Return success with full details even if connection already exists
      return NextResponse.json({ 
        success: true, 
        alreadyConnected: true,
        eventId,
        aId,
        bId,
        scannerUserId,
        targetUserId,
      })
    }

    // Create new connection
    console.log(`[connect-qr] Creating connection: scanner=${scannerUserId}, target=${targetUserId}, event=${eventId}, a_id=${aId}, b_id=${bId}`)
    
    const { data: insertedConnection, error: insertError } = await supabase
      .from("connections")
      .insert({
        event_id: eventId,
        a_id: aId,
        b_id: bId,
        connection_kind: "user_added",
        user_add_method: "qr",
        created_by_user_id: scannerUserId,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[connect-qr] Error inserting connection:", insertError)
      throw insertError
    }

    console.log(`[connect-qr] Connection created successfully: ${insertedConnection?.connection_id}`)

    // Refresh match explanation in the background (don't wait for it)
    refreshPairMatchExplanation(supabase, eventId, aId, bId).catch((err) => {
      console.error("[connect-qr] Error refreshing match explanation:", err)
    })

    return NextResponse.json({
      success: true,
      eventId,
      aId,
      bId,
      scannerUserId, // Return scanner ID so target user can navigate to scanner's profile
      targetUserId,  // Return target ID so scanner can navigate to target's profile
      connectionId: insertedConnection?.connection_id,
    })
  } catch (error: any) {
    console.error("connect-qr error:", error)
    return NextResponse.json(
      { error: "Failed to create QR connection", details: error?.message },
      { status: 500 }
    )
  }
}


