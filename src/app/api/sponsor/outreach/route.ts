import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/platform-admin"
import { upsertLeadStatusDb } from "@/lib/sponsor-outreach-db"
import {
  isSponsorTablesMissingError,
  SPONSOR_PHASE_D_MIGRATION_FILE,
} from "@/lib/sponsor-schema-guard"
import { requireSponsorAccessToEvent } from "@/lib/sponsor-auth"

async function assertSponsorTablesOr503(supabase: ReturnType<typeof createServiceRoleClient>) {
  const probe = await supabase.from("sponsor_interaction_events").select("id").limit(1)
  if (probe.error && isSponsorTablesMissingError(probe.error)) {
    return NextResponse.json(
      {
        error: `Database missing sponsor tables. Run ${SPONSOR_PHASE_D_MIGRATION_FILE} on Supabase.`,
        migrationRequired: true,
      },
      { status: 503 },
    )
  }
  return null
}

type Action = "message" | "linkedin" | "met"

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : null
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  const attendeeUserId =
    typeof body.attendeeUserId === "string" ? body.attendeeUserId : null
  const action = typeof body.action === "string" ? (body.action as Action) : null

  if (!attendeeUserId || !action) {
    return NextResponse.json(
      { error: "attendeeUserId and action are required" },
      { status: 400 },
    )
  }

  if (attendeeUserId === gate.userId) {
    return NextResponse.json({ error: "Invalid recipient" }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const probeRes = await assertSponsorTablesOr503(supabase)
  if (probeRes) return probeRes

  if (action === "message") {
    const messageBody =
      typeof body.messageBody === "string" ? body.messageBody.trim() : ""
    if (!messageBody) {
      return NextResponse.json({ error: "messageBody is required" }, { status: 400 })
    }

    const conversation = await ensureConversation(
      supabase,
      eventId!,
      gate.userId,
      attendeeUserId,
    )

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.conversation_id,
        sender_user_id: gate.userId,
        message_body: messageBody,
      })
      .select("message_id")
      .single()

    if (msgErr) {
      console.error("sponsor outreach message:", msgErr)
      return NextResponse.json({ error: msgErr.message }, { status: 500 })
    }

    await ensureSponsorOutreachConnection(
      supabase,
      eventId!,
      gate.userId,
      attendeeUserId,
    )

    await supabase.from("sponsor_interaction_events").insert({
      event_id: eventId!,
      sponsor_user_id: gate.userId,
      attendee_user_id: attendeeUserId,
      event_type: "message_sent",
      metadata_json: { message_id: msg.message_id },
    })

    await upsertLeadStatusDb(supabase, eventId!, gate.userId, attendeeUserId, "messaged")

    return NextResponse.json({
      success: true,
      conversationId: conversation.conversation_id,
      messageId: msg.message_id,
    })
  }

  if (action === "linkedin") {
    await supabase.from("sponsor_interaction_events").insert({
      event_id: eventId!,
      sponsor_user_id: gate.userId,
      attendee_user_id: attendeeUserId,
      event_type: "linkedin_logged",
    })
    await upsertLeadStatusDb(supabase, eventId!, gate.userId, attendeeUserId, "linkedin")
    return NextResponse.json({ success: true })
  }

  if (action === "met") {
    await supabase.from("sponsor_interaction_events").insert({
      event_id: eventId!,
      sponsor_user_id: gate.userId,
      attendee_user_id: attendeeUserId,
      event_type: "met_marked",
    })
    await upsertLeadStatusDb(supabase, eventId!, gate.userId, attendeeUserId, "met")
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : null
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  const attendeeUserId =
    typeof body.attendeeUserId === "string" ? body.attendeeUserId : null
  const notes = typeof body.notes === "string" ? body.notes : null

  if (!attendeeUserId) {
    return NextResponse.json({ error: "attendeeUserId is required" }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const probeRes = await assertSponsorTablesOr503(supabase)
  if (probeRes) return probeRes

  const { data: lead } = await supabase
    .from("sponsor_leads")
    .select("id")
    .eq("event_id", eventId!)
    .eq("sponsor_user_id", gate.userId)
    .eq("attendee_user_id", attendeeUserId)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("sponsor_leads")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", lead.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

async function ensureConversation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  eventId: string,
  userA: string,
  userB: string,
) {
  const participants = [userA, userB].sort()

  const { data: existing, error: findErr } = await supabase
    .from("conversations")
    .select("conversation_id, event_id, participant_user_ids")
    .eq("event_id", eventId)
    .contains("participant_user_ids", participants)
    .maybeSingle()

  if (findErr && findErr.code !== "PGRST116") {
    throw findErr
  }

  if (existing) return existing

  const { data, error: insErr } = await supabase
    .from("conversations")
    .insert({
      event_id: eventId,
      participant_user_ids: participants,
      created_by_user_id: userA,
    })
    .select("conversation_id, event_id, participant_user_ids")
    .single()

  if (insErr) throw insErr
  return data
}

async function ensureSponsorOutreachConnection(
  supabase: ReturnType<typeof createServiceRoleClient>,
  eventId: string,
  sponsorId: string,
  attendeeId: string,
) {
  const { data: existing } = await supabase
    .from("connections")
    .select("connection_id")
    .eq("event_id", eventId)
    .eq("connection_kind", "sponsor_outreach")
    .eq("a_id", sponsorId)
    .eq("b_id", attendeeId)
    .maybeSingle()

  if (existing) return

  const { error } = await supabase.from("connections").insert({
    event_id: eventId,
    a_id: sponsorId,
    b_id: attendeeId,
    connection_kind: "sponsor_outreach",
    created_by_user_id: sponsorId,
  })

  if (error && error.code !== "23505") {
    console.warn("sponsor_outreach connection:", error)
  }
}
