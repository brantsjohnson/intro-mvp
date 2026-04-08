import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import type { Database } from "./database.types"
import {
  createRouteHandlerSupabase,
  createServiceRoleClient,
} from "./platform-admin"

export type OrganizerRouteResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

/**
 * Require a logged-in user (any role). Used for /organizer shell.
 */
export async function requireLoggedInForOrganizerRoute(): Promise<OrganizerRouteResult> {
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
 * Event IDs the user may view as an organizer:
 * - explicit rows in `event_organizers`
 * - any event whose `organization_id` matches an `organizer_memberships` row
 */
export async function listAccessibleEventIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const ids = new Set<string>()

  const { data: direct, error: e1 } = await supabase
    .from("event_organizers")
    .select("event_id")
    .eq("user_id", userId)

  if (e1) {
    console.warn("[organizer] event_organizers:", e1.message)
  } else {
    for (const row of direct ?? []) ids.add(row.event_id)
  }

  const { data: memberships, error: e2 } = await supabase
    .from("organizer_memberships")
    .select("organization_id")
    .eq("user_id", userId)

  if (e2) {
    console.warn("[organizer] organizer_memberships:", e2.message)
  } else {
    const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))]
    if (orgIds.length > 0) {
      const { data: evts, error: e3 } = await supabase
        .from("events")
        .select("event_id")
        .in("organization_id", orgIds)

      if (e3) {
        console.warn("[organizer] events by org:", e3.message)
      } else {
        for (const row of evts ?? []) ids.add(row.event_id)
      }
    }
  }

  return [...ids]
}

export async function canUserAccessEventAsOrganizer(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data: direct } = await supabase
    .from("event_organizers")
    .select("event_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle()
  if (direct) return true

  const { data: evt } = await supabase
    .from("events")
    .select("organization_id")
    .eq("event_id", eventId)
    .maybeSingle()

  if (!evt?.organization_id) return false

  const { data: mem } = await supabase
    .from("organizer_memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("organization_id", evt.organization_id)
    .maybeSingle()

  return !!mem
}

export type OrganizerEventAccessResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

/**
 * For API routes scoped to one event.
 */
export async function requireOrganizerAccessToEvent(
  eventId: string | null,
): Promise<OrganizerEventAccessResult> {
  const gate = await requireLoggedInForOrganizerRoute()
  if (!gate.ok) return gate

  if (!eventId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "eventId is required" }, { status: 400 }),
    }
  }

  try {
    const supabase = createServiceRoleClient()
    const allowed = await canUserAccessEventAsOrganizer(
      supabase,
      gate.userId,
      eventId,
    )
    if (!allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Forbidden — not an organizer for this event" },
          { status: 403 },
        ),
      }
    }
  } catch (e) {
    console.error("[organizer] access check:", e)
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

/** Server-side: events the organizer can view (for RSC / layouts). */
export async function fetchOrganizerEventSummariesForUser(userId: string) {
  const supabase = createServiceRoleClient()
  const ids = await listAccessibleEventIds(supabase, userId)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("events")
    .select(
      "event_id, event_code, event_name, event_location, event_starts_at, event_ends_at",
    )
    .in("event_id", ids)
    .order("event_starts_at", { ascending: false, nullsFirst: false })

  if (error) {
    console.error("[organizer] fetch events:", error.message)
    return []
  }
  return data ?? []
}
