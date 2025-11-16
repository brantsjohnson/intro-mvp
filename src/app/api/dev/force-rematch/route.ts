import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { refreshEventMatchExplanations } from "@/lib/matching/refresh-explanations"

type MatchmakerPayload = {
  event_id: string
  user_id?: string
}

const ensureEnv = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase configuration missing. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.")
  }

  return { supabaseUrl, serviceKey }
}

export async function POST(request: NextRequest) {
  try {
    const { eventId, userId, forceBackfill = true, deleteExisting = true } = await request.json()

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 })
    }

    const { supabaseUrl, serviceKey } = ensureEnv()
    const supabase = createClient(supabaseUrl, serviceKey)

    const payload: MatchmakerPayload = { event_id: eventId }

    if (userId) {
      if (typeof userId !== "string") {
        return NextResponse.json({ error: "userId must be a string" }, { status: 400 })
      }

      if (deleteExisting) {
        await supabase
          .from("connections")
          .delete()
          .eq("event_id", eventId)
          .eq("connection_kind", "system_match")
          .or(`a_id.eq.${userId},b_id.eq.${userId}`)
      }

      payload.user_id = userId
    } else if (deleteExisting) {
      await supabase
        .from("connections")
        .delete()
        .eq("event_id", eventId)
        .eq("connection_kind", "system_match")
    }

    const matchmakerResponse = await fetch(`${supabaseUrl}/functions/v1/matchmaker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const matchmakerJson = await matchmakerResponse.json().catch(() => null)

    if (!matchmakerResponse.ok) {
      const reason = matchmakerJson?.error || matchmakerJson || "Matchmaker returned non-200 response"
      return NextResponse.json(
        { error: "Failed to run matchmaker", details: reason },
        { status: matchmakerResponse.status }
      )
    }

    const refreshResult = await refreshEventMatchExplanations(supabase, eventId, {
      userIds: userId ? [userId] : undefined,
      force: Boolean(forceBackfill),
    })

    return NextResponse.json({
      success: true,
      eventId,
      userId: payload.user_id ?? null,
      matchmaker: matchmakerJson,
      explanationsRefresh: refreshResult,
    })
  } catch (error: any) {
    console.error("[force-rematch] error", error)
    return NextResponse.json(
      {
        error: "Failed to force rematch",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    )
  }
}


