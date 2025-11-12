import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import {
  AttendeeSnapshot,
  MatchExplanationOptions,
  buildMatchExplanation,
  parseMatchExplanationConfig,
  shouldRewriteMatchExplanation,
} from "./explain"

export type RefreshOptions = {
  userIds?: string[]
  override?: MatchExplanationOptions
}

type Supabase = SupabaseClient<Database>

const DEFAULT_ALLOWED_KINDS = new Set([
  "system_match",
  "user_added",
  "user_request_pending",
  "manual_add",
  "manual_directory",
  "qr",
])

export const refreshEventMatchExplanations = async (
  supabase: Supabase,
  eventId: string,
  options: RefreshOptions = {}
) => {
  const start = Date.now()
  const focusSet = options.userIds ? new Set(options.userIds) : null

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("matching_config")
    .eq("event_id", eventId)
    .maybeSingle()

  if (eventError) {
    throw new Error(`Failed to load event ${eventId}: ${eventError.message}`)
  }

  const configOptions = parseMatchExplanationConfig(eventRow?.matching_config ?? null)
  const mergedOptions: MatchExplanationOptions = {
    ...configOptions,
    ...options.override,
  }

  const { data: connections, error: connectionError } = await supabase
    .from("connections")
    .select("event_id,a_id,b_id,connection_kind,match_explanation_text")
    .eq("event_id", eventId)

  if (connectionError) {
    throw new Error(`Failed to load connections for event ${eventId}: ${connectionError.message}`)
  }

  if (!connections || connections.length === 0) {
    return { updated: 0, skipped: 0, durationMs: Date.now() - start }
  }

  const relevantConnections = connections.filter((connection) => {
    if (!DEFAULT_ALLOWED_KINDS.has(connection.connection_kind || "")) {
      return false
    }
    if (!focusSet) return true
    return focusSet.has(connection.a_id) || focusSet.has(connection.b_id)
  })

  if (relevantConnections.length === 0) {
    return { updated: 0, skipped: connections.length, durationMs: Date.now() - start }
  }

  const attendeeCache = new Map<string, AttendeeSnapshot | null>()

  const getAttendee = async (userId: string): Promise<AttendeeSnapshot | null> => {
    if (attendeeCache.has(userId)) {
      return attendeeCache.get(userId) ?? null
    }

    const [{ data: attendance }, { data: user }] = await Promise.all([
      supabase
        .from("attendance")
        .select(
          "business_need_text,event_offer_tags,event_want_tags,connection_followups_json,attendee_first_name,attendee_last_name"
        )
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("users")
        .select("first_name,last_name,hobbies,career_title,company_name,offer_tags,want_tags")
        .eq("user_id", userId)
        .maybeSingle(),
    ])

    if (!attendance && !user) {
      attendeeCache.set(userId, null)
      return null
    }

    const snapshot: AttendeeSnapshot = {
      user_id: userId,
      first_name: attendance?.attendee_first_name ?? user?.first_name ?? undefined,
      last_name: attendance?.attendee_last_name ?? user?.last_name ?? undefined,
      business_need_text: attendance?.business_need_text ?? undefined,
      event_offer_tags:
        attendance?.event_offer_tags ??
        (user?.offer_tags && Array.isArray(user.offer_tags) ? user.offer_tags : null),
      event_want_tags:
        attendance?.event_want_tags ??
        (user?.want_tags && Array.isArray(user.want_tags) ? user.want_tags : null),
      connection_followups_json: attendance?.connection_followups_json ?? null,
      hobbies:
        (user?.hobbies && Array.isArray(user.hobbies) ? user.hobbies : null) ??
        undefined,
      career_title: user?.career_title ?? undefined,
      company_name: user?.company_name ?? undefined,
    }

    attendeeCache.set(userId, snapshot)
    return snapshot
  }

  const updates: Array<{
    event_id: string
    a_id: string
    b_id: string
    connection_kind: string
    match_explanation_text: string
  }> = []

  for (const connection of relevantConnections) {
    const left = await getAttendee(connection.a_id)
    const right = await getAttendee(connection.b_id)
    if (!left || !right) {
      continue
    }

    const generated = buildMatchExplanation(left, right, mergedOptions).trim()
    if (
      !generated ||
      (!shouldRewriteMatchExplanation(connection.match_explanation_text, mergedOptions) &&
        connection.match_explanation_text === generated)
    ) {
      continue
    }

    updates.push({
      event_id: eventId,
      a_id: connection.a_id,
      b_id: connection.b_id,
      connection_kind: connection.connection_kind ?? "system_match",
      match_explanation_text: generated,
    })
  }

  if (updates.length > 0) {
    let updatedCount = 0

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("connections")
        .update({ match_explanation_text: update.match_explanation_text })
        .eq("event_id", update.event_id)
        .eq("a_id", update.a_id)
        .eq("b_id", update.b_id)
        .eq("connection_kind", update.connection_kind)

      if (updateError) {
        throw new Error(
          `Failed to persist match explanations for ${update.a_id}/${update.b_id}: ${updateError.message}`
        )
      }

      updatedCount += 1
    }

    return {
      updated: updatedCount,
      skipped: relevantConnections.length - updatedCount,
      durationMs: Date.now() - start,
    }
  }

  return {
    updated: 0,
    skipped: relevantConnections.length,
    durationMs: Date.now() - start,
  }
}

export const refreshPairMatchExplanation = async (
  supabase: Supabase,
  eventId: string,
  aId: string,
  bId: string,
  options?: RefreshOptions
) => {
  return refreshEventMatchExplanations(supabase, eventId, {
    ...options,
    userIds: [aId, bId],
  })
}

