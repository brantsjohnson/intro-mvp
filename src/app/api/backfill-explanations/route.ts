import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { refreshEventMatchExplanations } from "@/lib/matching/refresh-explanations"

export async function POST(request: NextRequest) {
  try {
    const { eventId, userIds, force } = await request.json()

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { updated, skipped, durationMs } = await refreshEventMatchExplanations(
      supabase,
      eventId,
      {
        userIds: Array.isArray(userIds) ? userIds.filter((id): id is string => typeof id === "string") : undefined,
        force: Boolean(force),
      }
    )

    return NextResponse.json({
      success: true,
      eventId,
      updated,
      skipped,
      durationMs,
      forceApplied: Boolean(force),
    })
  } catch (error: any) {
    console.error("Backfill explanations error:", error)
    return NextResponse.json(
      { error: "Failed to backfill match explanations", details: error?.message },
      { status: 500 }
    )
  }
}


