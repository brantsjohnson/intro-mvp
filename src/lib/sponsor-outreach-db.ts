import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { mergeLeadStatus } from "@/lib/sponsor-intelligence"
import { isSponsorTablesMissingError } from "@/lib/sponsor-schema-guard"

type Supabase = SupabaseClient<Database>

export async function upsertLeadStatusDb(
  supabase: Supabase,
  eventId: string,
  sponsorId: string,
  attendeeId: string,
  nextStatus: string,
) {
  const { data: lead } = await supabase
    .from("sponsor_leads")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("sponsor_user_id", sponsorId)
    .eq("attendee_user_id", attendeeId)
    .maybeSingle()

  const merged = mergeLeadStatus(lead?.status, nextStatus)
  const now = new Date().toISOString()

  if (!lead) {
    await supabase.from("sponsor_leads").insert({
      event_id: eventId,
      sponsor_user_id: sponsorId,
      attendee_user_id: attendeeId,
      status: merged,
      recommendation_score: null,
      recommendation_reason_tags: [],
      updated_at: now,
    })
    return
  }

  await supabase
    .from("sponsor_leads")
    .update({ status: merged, updated_at: now })
    .eq("id", lead.id)
}

export async function syncReplyInteractionEvents(
  supabase: Supabase,
  eventId: string,
  sponsorId: string,
) {
  const probe = await supabase.from("sponsor_interaction_events").select("id").limit(1)
  if (probe.error) {
    if (isSponsorTablesMissingError(probe.error)) return
    console.warn("[sponsor] sponsor_interaction_events probe:", probe.error.message)
    return
  }

  const { data: convs, error: cErr } = await supabase
    .from("conversations")
    .select("conversation_id, participant_user_ids")
    .eq("event_id", eventId)
    .contains("participant_user_ids", [sponsorId])

  if (cErr || !convs?.length) return

  for (const c of convs) {
    const parts = c.participant_user_ids ?? []
    if (parts.length < 2) continue
    const otherId = parts.find((id) => id !== sponsorId)
    if (!otherId) continue

    const { data: msgs } = await supabase
      .from("messages")
      .select("sender_user_id")
      .eq("conversation_id", c.conversation_id)
      .order("created_at", { ascending: true })

    if (!msgs?.length) continue

    const sponsorMessaged = msgs.some((m) => m.sender_user_id === sponsorId)
    const attendeeReplied = msgs.some((m) => m.sender_user_id === otherId)
    if (!sponsorMessaged || !attendeeReplied) continue

    const { data: existing } = await supabase
      .from("sponsor_interaction_events")
      .select("id")
      .eq("event_id", eventId)
      .eq("sponsor_user_id", sponsorId)
      .eq("attendee_user_id", otherId)
      .eq("event_type", "reply_received")
      .maybeSingle()

    if (existing) continue

    await supabase.from("sponsor_interaction_events").insert({
      event_id: eventId,
      sponsor_user_id: sponsorId,
      attendee_user_id: otherId,
      event_type: "reply_received",
    })

    await upsertLeadStatusDb(supabase, eventId, sponsorId, otherId, "replied")
  }
}
