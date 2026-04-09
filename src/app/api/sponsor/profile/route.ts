import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/platform-admin"
import {
  isSponsorTablesMissingError,
  SPONSOR_PHASE_D_MIGRATION_FILE,
} from "@/lib/sponsor-schema-guard"
import { requireSponsorAccessToEvent } from "@/lib/sponsor-auth"
import type { Json } from "@/lib/database.types"

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from("sponsor_profiles")
      .select(
        "event_id, user_id, company_description, product_offering, ideal_customer_json, event_goals, created_at, updated_at",
      )
      .eq("event_id", eventId!)
      .eq("user_id", gate.userId)
      .maybeSingle()

    if (error) {
      if (isSponsorTablesMissingError(error)) {
        return NextResponse.json({
          profile: null,
          migrationRequired: true,
          migrationHint: SPONSOR_PHASE_D_MIGRATION_FILE,
        })
      }
      console.error("sponsor/profile GET:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: data ?? null, migrationRequired: false })
  } catch (e) {
    console.error("sponsor/profile GET:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

type IdealCustomer = {
  industries?: string[]
  roles?: string[]
  company_stages?: string[]
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : null
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  const company_description =
    typeof body.company_description === "string" ? body.company_description : null
  const product_offering =
    typeof body.product_offering === "string" ? body.product_offering : null
  const event_goals = typeof body.event_goals === "string" ? body.event_goals : null

  let sponsorship_cost: number | null | undefined = undefined
  if (Object.prototype.hasOwnProperty.call(body, "sponsorship_cost")) {
    const raw = body.sponsorship_cost
    if (raw == null || raw === "") {
      sponsorship_cost = null
    } else {
      const n =
        typeof raw === "number" ? raw : parseFloat(String(raw))
      sponsorship_cost = Number.isFinite(n) && n >= 0 ? n : null
    }
  }

  let ideal_customer_json: Json = {}
  if (body.ideal_customer_json && typeof body.ideal_customer_json === "object") {
    const ic = body.ideal_customer_json as IdealCustomer
    ideal_customer_json = {
      industries: Array.isArray(ic.industries) ? ic.industries.map(String) : [],
      roles: Array.isArray(ic.roles) ? ic.roles.map(String) : [],
      company_stages: Array.isArray(ic.company_stages)
        ? ic.company_stages.map(String)
        : [],
    }
  }

  try {
    const supabase = createServiceRoleClient()
    const upsertRow: Record<string, unknown> = {
      event_id: eventId!,
      user_id: gate.userId,
      company_description,
      product_offering,
      ideal_customer_json,
      event_goals,
      updated_at: new Date().toISOString(),
    }
    if (sponsorship_cost !== undefined) {
      upsertRow.sponsorship_cost = sponsorship_cost
    }

    const { data, error } = await supabase
      .from("sponsor_profiles")
      .upsert(upsertRow as never, { onConflict: "event_id,user_id" })
      .select(
        "event_id, user_id, company_description, product_offering, ideal_customer_json, event_goals, created_at, updated_at",
      )
      .single()

    if (error) {
      if (isSponsorTablesMissingError(error)) {
        return NextResponse.json(
          {
            error: `Sponsor tables not found. Apply ${SPONSOR_PHASE_D_MIGRATION_FILE} to your Supabase project.`,
            migrationRequired: true,
          },
          { status: 503 },
        )
      }
      console.error("sponsor/profile POST:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: data })
  } catch (e) {
    console.error("sponsor/profile POST:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
