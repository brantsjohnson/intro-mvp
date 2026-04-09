/**
 * When migration `20260409_phase_d_sponsor_intelligence.sql` is not applied,
 * PostgREST returns errors like PGRST205 / "schema cache" / "does not exist".
 */
export function isSponsorTablesMissingError(err: {
  code?: string
  message?: string
} | null): boolean {
  if (!err) return false
  const msg = (err.message ?? "").toLowerCase()
  if (err.code === "PGRST205") return true
  if (msg.includes("schema cache") && msg.includes("sponsor")) return true
  if (
    msg.includes("does not exist") &&
    (msg.includes("sponsor_profiles") ||
      msg.includes("sponsor_leads") ||
      msg.includes("sponsor_interaction_events"))
  ) {
    return true
  }
  return false
}

export const SPONSOR_PHASE_D_MIGRATION_FILE =
  "supabase/migrations/20260409_phase_d_sponsor_intelligence.sql"

/** Adds `sponsor_leads.match_explanation_text` for sponsor lead summaries. */
export const SPONSOR_PHASE_F_MIGRATION_FILE =
  "supabase/migrations/20260409_phase_f_sponsor_lead_explanation.sql"

export function emptySponsorRoiResponse(migrationRequired: boolean) {
  return {
    messages_sent: 0,
    replies_received: 0,
    linkedin_logged: 0,
    met_marked: 0,
    engaged_leads_total: 0,
    outreach_by_day: [] as { date: string; count: number }[],
    funnel: [
      { id: "recommended", label: "Recommended", count: 0 },
      { id: "reached_out", label: "Reached out", count: 0 },
      { id: "connected", label: "Connected", count: 0 },
      { id: "following_up", label: "Following up", count: 0 },
      { id: "closed_deal", label: "Closed", count: 0 },
    ],
    qualified_leads: 0,
    strong_fits: 0,
    potential_deals_low: 0,
    potential_deals_high: 0,
    top_reason_tags: [] as string[],
    top_industries: [] as string[],
    lead_statuses: {} as Record<string, number>,
    top_topics: [] as { tag: string; count: number }[],
    active_recently: false,
    outreach_table: [] as Array<{
      lead_id: string
      attendee_user_id: string
      display_name: string
      status: string
      notes: string | null
      updated_at: string | null
    }>,
    migrationRequired,
    ...(migrationRequired ? { migrationHint: SPONSOR_PHASE_D_MIGRATION_FILE } : {}),
  }
}
