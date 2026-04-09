import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import type { Database } from "./database.types"
import {
  createRouteHandlerSupabase,
  createServiceRoleClient,
} from "./platform-admin"

export type SponsorRouteResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

export async function requireLoggedInForSponsorRoute(): Promise<SponsorRouteResult> {
  const supabase = await createRouteHandlerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { ok: true, userId: user.id }
}

/**
 * True if this user has attendance for the event with is_sponsor = true.
 */
export async function canUserAccessEventAsSponsor(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("attendance")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("is_sponsor", true)
    .maybeSingle()

  return data != null
}

export type SponsorEventAccessResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

export async function requireSponsorAccessToEvent(
  eventId: string | null,
): Promise<SponsorEventAccessResult> {
  const gate = await requireLoggedInForSponsorRoute()
  if (!gate.ok) return gate

  if (!eventId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "eventId is required" }, { status: 400 }),
    }
  }

  try {
    const supabase = createServiceRoleClient()
    const allowed = await canUserAccessEventAsSponsor(supabase, gate.userId, eventId)
    if (!allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Forbidden — not a sponsor for this event" },
          { status: 403 },
        ),
      }
    }
  } catch (e) {
    console.error("[sponsor] access check:", e)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      ),
    }
  }

  return { ok: true, userId: gate.userId }
}

/** Events where the user is marked sponsor on attendance */
export async function fetchSponsorEventSummariesForUser(userId: string) {
  const supabase = createServiceRoleClient()

  const { data: rows, error } = await supabase
    .from("attendance")
    .select("event_id")
    .eq("user_id", userId)
    .eq("is_sponsor", true)

  if (error) {
    console.error("[sponsor] attendance:", error.message)
    return []
  }

  const ids = [...new Set((rows ?? []).map((r) => r.event_id))]
  if (ids.length === 0) return []

  const { data: events, error: e2 } = await supabase
    .from("events")
    .select(
      "event_id, event_code, event_name, event_location, event_starts_at, event_ends_at",
    )
    .in("event_id", ids)
    .order("event_starts_at", { ascending: false, nullsFirst: false })

  if (e2) {
    console.error("[sponsor] events:", e2.message)
    return []
  }

  return events ?? []
}
