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

    const { error: upsertError } = await supabase
      .from("connections")
      .upsert(
        [
          {
            event_id: eventId,
            a_id: aId,
            b_id: bId,
            connection_kind: "user_added",
            user_add_method: "qr",
            created_by_user_id: scannerUserId,
          },
        ],
        { onConflict: "event_id,a_id,b_id", ignoreDuplicates: false }
      )

    if (upsertError) {
      if (upsertError.code === "23505") {
        return NextResponse.json({ success: true, alreadyConnected: true })
      }
      throw upsertError
    }

    await refreshPairMatchExplanation(supabase, eventId, aId, bId)

    return NextResponse.json({
      success: true,
      eventId,
      aId,
      bId,
    })
  } catch (error: any) {
    console.error("connect-qr error:", error)
    return NextResponse.json(
      { error: "Failed to create QR connection", details: error?.message },
      { status: 500 }
    )
  }
}


