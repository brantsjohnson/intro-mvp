import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

/**
 * Aggregates for the platform admin Event health panel.
 * Category filters align with docs/supabase-categories-reference.md §1–3.
 */
export type EventHealthMetrics = {
  event_id: string
  attendance_count: number
  /** §2 — algorithm-produced matches only */
  system_match_count: number
  /** §2 — counts per connection_kind (raw, for debugging / transparency) */
  connections_by_kind: Record<string, number>
  /**
   * §3 — for rows where user_add_method is non-null (typically user-driven edges).
   * Excludes null bucket; system_match rows often have null user_add_method.
   */
  connections_by_user_add_method: Record<string, number>
  /** §1 — flattened counts from attendance.connection_types_selected (snake_case DB values) */
  connection_types_selected_counts: Record<string, number>
}

function countKeys(rows: { connection_kind: string }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = r.connection_kind || "unknown"
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function countUserAddMethod(
  rows: { user_add_method: string | null }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (r.user_add_method == null || r.user_add_method === "") continue
    const k = r.user_add_method
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function aggregateConnectionTypes(
  rows: { connection_types_selected: string[] | null }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const arr = r.connection_types_selected
    if (!arr?.length) continue
    for (const t of arr) {
      out[t] = (out[t] ?? 0) + 1
    }
  }
  return out
}

export async function fetchEventHealthMetrics(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<EventHealthMetrics | null> {
  const { data: eventRow, error: eventErr } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle()

  if (eventErr || !eventRow) return null

  const { count: attendanceCount } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)

  const { count: systemMatchCount } = await supabase
    .from("connections")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("connection_kind", "system_match")

  const { data: connRows } = await supabase
    .from("connections")
    .select("connection_kind, user_add_method")
    .eq("event_id", eventId)

  const { data: attRows } = await supabase
    .from("attendance")
    .select("connection_types_selected")
    .eq("event_id", eventId)

  const connections = connRows ?? []
  const attendance = attRows ?? []

  return {
    event_id: eventId,
    attendance_count: attendanceCount ?? 0,
    system_match_count: systemMatchCount ?? 0,
    connections_by_kind: countKeys(connections),
    connections_by_user_add_method: countUserAddMethod(connections),
    connection_types_selected_counts: aggregateConnectionTypes(attendance),
  }
}
