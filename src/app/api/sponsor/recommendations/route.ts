import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import type { Json } from "@/lib/database.types"
import { createServiceRoleClient } from "@/lib/platform-admin"
import {
  buildSponsorMatchUserPrompt,
  generateSponsorMatchExplanation,
  guardSponsorMatchExplanationText,
  type AttendeeBundleForExplanation,
  type SponsorProfileForExplanation,
} from "@/lib/sponsor-match-explanation"
import {
  attendeeListScoreFallback,
  linkedinProfileUrlFromRawJson,
  parseIdealCustomer,
  scoreAttendeeForSponsor,
} from "@/lib/sponsor-intelligence"
import { fetchUserDisplayMap } from "@/lib/organizer-metrics"
import {
  isSponsorTablesMissingError,
  SPONSOR_PHASE_D_MIGRATION_FILE,
  SPONSOR_PHASE_F_MIGRATION_FILE,
} from "@/lib/sponsor-schema-guard"

function matchExplanationColumnMissing(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase()
  return (
    m.includes("match_explanation_text") ||
    (m.includes("column") && m.includes("does not exist") && m.includes("sponsor_leads"))
  )
}
import { requireSponsorAccessToEvent } from "@/lib/sponsor-auth"

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")
  const gate = await requireSponsorAccessToEvent(eventId)
  if (!gate.ok) return gate.response

  try {
    const supabase = createServiceRoleClient()

    const probe = await supabase.from("sponsor_leads").select("id").limit(1)
    if (probe.error && isSponsorTablesMissingError(probe.error)) {
      return NextResponse.json({
        needsProfile: true,
        recommendations: [],
        migrationRequired: true,
        migrationHint: SPONSOR_PHASE_D_MIGRATION_FILE,
      })
    }

    const { data: profile, error: profileErr } = await supabase
      .from("sponsor_profiles")
      .select("*")
      .eq("event_id", eventId!)
      .eq("user_id", gate.userId)
      .maybeSingle()

    if (profileErr && isSponsorTablesMissingError(profileErr)) {
      return NextResponse.json({
        needsProfile: true,
        recommendations: [],
        migrationRequired: true,
        migrationHint: SPONSOR_PHASE_D_MIGRATION_FILE,
      })
    }

    const hasProfile = !!(
      profile &&
      (profile.product_offering?.trim() ||
        profile.company_description?.trim() ||
        parseIdealCustomer(profile.ideal_customer_json).industries.length)
    )

    const { data: attRows, error: attErr } = await supabase
      .from("attendance")
      .select(
        `
        user_id,
        event_need_tags,
        event_want_tags,
        event_industry_tags,
        event_offer_tags,
        connection_types_selected,
        why_attending_text,
        business_need_text,
        event_profile_summary_text,
        users:user_id (
          user_id,
          first_name,
          last_name,
          career_title,
          career_years_experience,
          company_name,
          company_summary,
          industry_tags,
          want_tags,
          need_tags,
          expertise_summary,
          offer_summary_text,
          offer_tags,
          hobbies,
          linkedin_raw_json
        )
      `,
      )
      .eq("event_id", eventId!)
      .not("is_sponsor", "eq", true)

    if (attErr) {
      console.error("sponsor/recommendations attendance:", attErr)
      return NextResponse.json({ error: attErr.message }, { status: 500 })
    }

    const icp = profile ? parseIdealCustomer(profile.ideal_customer_json) : null
    const productOffering = profile?.product_offering?.trim() ?? ""
    const sponsorCompanyDescription = profile?.company_description?.trim() ?? ""
    const sponsorEventGoals = profile?.event_goals?.trim() ?? ""

    type UserRow = {
      user_id: string
      first_name: string | null
      last_name: string | null
      career_title: string | null
      career_years_experience: number | null
      company_name: string | null
      company_summary: string | null
      industry_tags: string[] | null
      want_tags: string[] | null
      need_tags: string[] | null
      expertise_summary: string | null
      offer_summary_text: string | null
      offer_tags: string[] | null
      hobbies: string[] | null
      linkedin_raw_json: unknown | null
    }

    type AttRow = {
      user_id: string
      event_need_tags: string[] | null
      event_want_tags: string[] | null
      event_industry_tags: string[] | null
      event_offer_tags: string[] | null
      connection_types_selected: string[] | null
      why_attending_text: string | null
      business_need_text: string | null
      event_profile_summary_text: string | null
      users: UserRow | UserRow[] | null
    }

    const scored: Array<{
      user_id: string
      score: number
      reason_tags: string[]
      fit_signals: string[]
      attendee: AttRow
      u: UserRow
    }> = []

    for (const row of (attRows ?? []) as AttRow[]) {
      if (row.user_id === gate.userId) continue
      const u = Array.isArray(row.users) ? row.users[0] : row.users
      if (!u) continue

      let score: number
      let reason_tags: string[]
      let fit_signals: string[]
      if (hasProfile && icp) {
        const r = scoreAttendeeForSponsor({
          icp,
          productOffering,
          sponsorCompanyDescription,
          sponsorEventGoals,
          attendee: {
            user_id: row.user_id,
            event_need_tags: row.event_need_tags,
            event_want_tags: row.event_want_tags,
            event_industry_tags: row.event_industry_tags,
            event_offer_tags: row.event_offer_tags,
            connection_types_selected: row.connection_types_selected,
            business_need_text: row.business_need_text,
            why_attending_text: row.why_attending_text,
            event_profile_summary_text: row.event_profile_summary_text,
            user: {
              career_title: u.career_title,
              company_name: u.company_name,
              industry_tags: u.industry_tags,
              want_tags: u.want_tags,
              need_tags: u.need_tags,
              expertise_summary: u.expertise_summary,
              company_summary: u.company_summary,
              offer_summary_text: u.offer_summary_text,
              hobbies: u.hobbies,
              career_years_experience: u.career_years_experience,
            },
          },
        })
        score = r.score
        reason_tags = r.reason_tags
        fit_signals = r.fit_signals
      } else {
        const r = attendeeListScoreFallback({
          attendee: {
            user_id: row.user_id,
            event_need_tags: row.event_need_tags,
            event_want_tags: row.event_want_tags,
            event_industry_tags: row.event_industry_tags,
            event_offer_tags: row.event_offer_tags,
            connection_types_selected: row.connection_types_selected,
            business_need_text: row.business_need_text,
            why_attending_text: row.why_attending_text,
            event_profile_summary_text: row.event_profile_summary_text,
            user: {
              career_title: u.career_title,
              company_name: u.company_name,
              industry_tags: u.industry_tags,
              want_tags: u.want_tags,
              need_tags: u.need_tags,
              expertise_summary: u.expertise_summary,
              company_summary: u.company_summary,
              offer_summary_text: u.offer_summary_text,
              hobbies: u.hobbies,
              career_years_experience: u.career_years_experience,
            },
          },
        })
        score = r.score
        reason_tags = r.reason_tags
        fit_signals = r.fit_signals
      }

      scored.push({ user_id: row.user_id, score, reason_tags, fit_signals, attendee: row, u })
    }

    scored.sort((a, b) => b.score - a.score)

    const { data: leadRows } = await supabase
      .from("sponsor_leads")
      .select("*")
      .eq("event_id", eventId!)
      .eq("sponsor_user_id", gate.userId)

    const leadMap = new Map((leadRows ?? []).map((l) => [l.attendee_user_id, l]))

    const top30 = scored.slice(0, 30)
    const now = new Date().toISOString()

    for (const item of top30) {
      const ex = leadMap.get(item.user_id)
      if (!ex) {
        const { error: insErr } = await supabase.from("sponsor_leads").insert({
          event_id: eventId!,
          sponsor_user_id: gate.userId,
          attendee_user_id: item.user_id,
          status: "recommended",
          recommendation_score: item.score,
          recommendation_reason_tags: item.reason_tags,
          updated_at: now,
        })
        if (insErr && insErr.code !== "23505") {
          console.warn("sponsor_leads insert:", insErr)
        }
      } else if (ex.status === "recommended") {
        await supabase
          .from("sponsor_leads")
          .update({
            recommendation_score: item.score,
            recommendation_reason_tags: item.reason_tags,
            updated_at: now,
          })
          .eq("id", ex.id)
      }
    }

    const displayIds = scored.slice(0, 80).map((s) => s.user_id)
    const labels = await fetchUserDisplayMap(supabase, displayIds)

    let { data: refreshedLeads } = await supabase
      .from("sponsor_leads")
      .select("*")
      .eq("event_id", eventId!)
      .eq("sponsor_user_id", gate.userId)

    let freshMap = new Map((refreshedLeads ?? []).map((l) => [l.attendee_user_id, l]))

    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim())
    const openai = openaiConfigured
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
      : null

    type MatchSummaryInfo = {
      status:
        | "generated"
        | "skipped_no_openai"
        | "skipped_no_profile"
        | "skipped_no_candidates"
        | "migration_required"
        | "openai_or_db_failed"
      openaiConfigured: boolean
      hint?: string
      migrationFile?: string
      candidates?: number
      saved?: number
      skippedCached?: number
    }

    let matchSummaryInfo: MatchSummaryInfo = {
      status: "skipped_no_openai",
      openaiConfigured,
    }

    if (!openaiConfigured) {
      matchSummaryInfo = {
        status: "skipped_no_openai",
        openaiConfigured: false,
        hint: "Set OPENAI_API_KEY in .env.local (project root), restart `next dev`, then reload this page.",
      }
      console.info("[sponsor/recommendations] Match summaries skipped: OPENAI_API_KEY is not set.")
    } else if (!hasProfile || !profile || !icp) {
      matchSummaryInfo = {
        status: "skipped_no_profile",
        openaiConfigured: true,
        hint: "Add your offering or ideal customer in your sponsor profile, save, then reload.",
      }
      console.info("[sponsor/recommendations] Match summaries skipped: sponsor profile not filled enough.")
    } else {
      const { error: colProbeErr } = await supabase
        .from("sponsor_leads")
        .select("match_explanation_text")
        .limit(1)

      if (colProbeErr && matchExplanationColumnMissing(colProbeErr)) {
        matchSummaryInfo = {
          status: "migration_required",
          openaiConfigured: true,
          migrationFile: SPONSOR_PHASE_F_MIGRATION_FILE,
          hint: `Run the SQL migration ${SPONSOR_PHASE_F_MIGRATION_FILE} on your Supabase project (adds match_explanation_text), then reload.`,
        }
        console.warn(
          "[sponsor/recommendations] match_explanation_text column missing — apply Phase F migration:",
          colProbeErr.message,
        )
      } else {
        if (colProbeErr) {
          console.warn("[sponsor/recommendations] match_explanation_text probe warning:", colProbeErr.message)
        }

        const sponsorPayload: SponsorProfileForExplanation = {
          product_offering: profile.product_offering,
          company_description: profile.company_description,
          ideal_customer_json: profile.ideal_customer_json,
          event_goals: profile.event_goals,
        }

        const explainCandidates = top30.filter((item) => item.score > 0)

        if (explainCandidates.length === 0) {
          matchSummaryInfo = {
            status: "skipped_no_candidates",
            openaiConfigured: true,
            candidates: 0,
            hint: "No one in your top 30 has a fit score above zero yet.",
          }
          console.info("[sponsor/recommendations] Match summaries: no top-30 leads with score > 0.")
        } else {
          const savedFlags = await Promise.all(
            explainCandidates.map(async (item) => {
              const lead = freshMap.get(item.user_id)
              if (!lead?.id) return { saved: false, skipped: false }

              const prevScore = lead.recommendation_score
              if (
                lead.match_explanation_text?.trim() &&
                prevScore != null &&
                Math.abs(Number(prevScore) - item.score) <= 5
              ) {
                return { saved: false, skipped: true }
              }

              const row = item.attendee
              const u = item.u
              const attendee: AttendeeBundleForExplanation = {
                career_title: u.career_title,
                company_name: u.company_name,
                career_years_experience: u.career_years_experience,
                industry_tags: u.industry_tags,
                want_tags: u.want_tags,
                need_tags: u.need_tags,
                expertise_summary: u.expertise_summary,
                company_summary: u.company_summary,
                offer_summary_text: u.offer_summary_text,
                offer_tags: u.offer_tags,
                hobbies: u.hobbies,
                event_need_tags: row.event_need_tags,
                event_want_tags: row.event_want_tags,
                event_industry_tags: row.event_industry_tags,
                event_offer_tags: row.event_offer_tags,
                connection_types_selected: row.connection_types_selected,
                why_attending_text: row.why_attending_text,
                business_need_text: row.business_need_text,
                event_profile_summary_text: row.event_profile_summary_text,
              }

              const userPrompt = buildSponsorMatchUserPrompt({
                icp,
                profile: sponsorPayload,
                attendee,
                fitScore: item.score,
                fitSignals: item.fit_signals,
              })

              const rawText = await generateSponsorMatchExplanation(openai!, userPrompt)
              const text = guardSponsorMatchExplanationText({
                text: rawText,
                fitScore: item.score,
                fitSignals: item.fit_signals,
                attendee,
              })
              if (!text) {
                console.warn(
                  "[sponsor/recommendations] OpenAI returned empty summary for attendee",
                  item.user_id,
                )
                return { saved: false, skipped: false }
              }

              const { error: upErr } = await supabase
                .from("sponsor_leads")
                .update({
                  match_explanation_text: text,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", lead.id)

              if (upErr) {
                console.warn("sponsor_leads match_explanation_text update:", upErr.message)
                return { saved: false, skipped: false }
              }
              return { saved: true, skipped: false }
            }),
          )

          const saved = savedFlags.filter((x) => x.saved).length
          const skippedCached = savedFlags.filter((x) => x.skipped).length
          const attemptedLlm = explainCandidates.length - skippedCached

          const { data: afterExplain } = await supabase
            .from("sponsor_leads")
            .select("*")
            .eq("event_id", eventId!)
            .eq("sponsor_user_id", gate.userId)

          freshMap = new Map((afterExplain ?? []).map((l) => [l.attendee_user_id, l]))

          if (saved > 0) {
            matchSummaryInfo = {
              status: "generated",
              openaiConfigured: true,
              candidates: explainCandidates.length,
              saved,
              skippedCached,
            }
            console.info(
              `[sponsor/recommendations] Match summaries: saved ${saved} new/updated; ${skippedCached} reused cache; ${attemptedLlm} LLM attempts.`,
            )
          } else if (skippedCached === explainCandidates.length) {
            matchSummaryInfo = {
              status: "generated",
              openaiConfigured: true,
              candidates: explainCandidates.length,
              saved: 0,
              skippedCached,
              hint: "Using summaries already stored for these leads (scores stable).",
            }
            console.info(
              `[sponsor/recommendations] Match summaries: all ${skippedCached} leads used cached text.`,
            )
          } else {
            matchSummaryInfo = {
              status: "openai_or_db_failed",
              openaiConfigured: true,
              candidates: explainCandidates.length,
              saved: 0,
              skippedCached,
              hint: "Summaries did not save. Check the terminal running Next.js for OpenAI or database errors.",
            }
            console.warn(
              `[sponsor/recommendations] Match summaries: 0 saved of ${explainCandidates.length} candidates (see logs above).`,
            )
          }
        }
      }
    }

    const recommendations = scored.slice(0, 80).map((item) => {
      const lead = freshMap.get(item.user_id)
      const u = item.u
      const name =
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        labels[item.user_id] ||
        item.user_id.slice(0, 8)

      const linkedin_url = linkedinProfileUrlFromRawJson(u.linkedin_raw_json as Json | null)

      return {
        user_id: item.user_id,
        display_name: name,
        career_title: u.career_title,
        company_name: u.company_name,
        score: item.score,
        reason_tags: item.reason_tags,
        fit_signals: item.fit_signals,
        match_explanation_text: lead?.match_explanation_text ?? null,
        current_status: lead?.status ?? "recommended",
        notes: lead?.notes ?? null,
        lead_id: lead?.id ?? null,
        linkedin_url,
      }
    })

    return NextResponse.json({
      needsProfile: !hasProfile,
      recommendations,
      migrationRequired: false,
      matchSummaryInfo,
    })
  } catch (e) {
    console.error("sponsor/recommendations:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
