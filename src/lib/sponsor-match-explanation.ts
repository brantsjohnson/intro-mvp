import OpenAI from "openai"
import type { Json } from "@/lib/database.types"
import { ORGANIZER_CONNECTION_INTENT_LABELS } from "@/lib/organizer-metrics"
import type { IdealCustomerJson } from "@/lib/sponsor-intelligence"

function humanizeSnake(s: string): string {
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function joinLabels(keys: string[] | null | undefined): string {
  if (!keys?.length) return "—"
  return keys
    .map((k) => ORGANIZER_CONNECTION_INTENT_LABELS[k] ?? humanizeSnake(k))
    .join(", ")
}

function truncate(s: string | null | undefined, max: number): string {
  const t = (s ?? "").trim()
  if (!t) return "—"
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function joinTags(arr: string[] | null | undefined): string {
  if (!arr?.length) return "—"
  return arr.join(", ")
}

export type SponsorProfileForExplanation = {
  product_offering: string | null
  company_description: string | null
  ideal_customer_json: Json
  event_goals: string | null
}

export type AttendeeBundleForExplanation = {
  career_title: string | null
  company_name: string | null
  career_years_experience: number | null
  industry_tags: string[] | null
  want_tags: string[] | null
  need_tags: string[] | null
  expertise_summary: string | null
  company_summary: string | null
  offer_summary_text: string | null
  offer_tags: string[] | null
  hobbies: string[] | null
  event_need_tags: string[] | null
  event_want_tags: string[] | null
  event_industry_tags: string[] | null
  event_offer_tags: string[] | null
  connection_types_selected: string[] | null
  why_attending_text: string | null
  business_need_text: string | null
  event_profile_summary_text: string | null
}

export function buildSponsorMatchUserPrompt(input: {
  icp: IdealCustomerJson
  profile: SponsorProfileForExplanation
  attendee: AttendeeBundleForExplanation
  /** When set with fitSignals, instructions align the model with the internal scorer. */
  fitScore?: number
  fitSignals?: string[]
}): string {
  const { icp, profile, attendee: a, fitScore, fitSignals } = input
  const industries = icp.industries.length ? icp.industries.join(", ") : "—"
  const roles = icp.roles.length ? icp.roles.join(", ") : "—"
  const stages = icp.company_stages.length ? icp.company_stages.join(", ") : "—"

  return `You help a sponsor at a networking event decide who to approach.

Sponsor:
- Offering: ${truncate(profile.product_offering, 600)}
- Company: ${truncate(profile.company_description, 400)}
- Looking for (industries): ${industries}
- Looking for (roles/titles): ${roles}
- Looking for (company stages): ${stages}
- Goals at this event: ${truncate(profile.event_goals, 400)}

Attendee:
- ${[a.career_title, a.company_name].filter(Boolean).join(" at ") || "Role/company not specified"}
- Profile industries/tags: ${joinTags(
    (() => {
      const merged = [
        ...new Set(
          [...(a.event_industry_tags ?? []), ...(a.industry_tags ?? [])]
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ]
      return merged.length ? merged : null
    })(),
  )}
- Here for: ${joinLabels(a.connection_types_selected)}
- Career years (self-reported): ${a.career_years_experience != null && Number.isFinite(a.career_years_experience) ? String(a.career_years_experience) : "—"}
- Expertise / background: ${truncate(a.expertise_summary, 400)}
- Company summary: ${truncate(a.company_summary, 400)}
- What they offer (profile summary): ${truncate(a.offer_summary_text, 400)}
- Hobbies / interests: ${joinTags(a.hobbies)}
- What they offer at this event (tags): ${joinTags(a.event_offer_tags)}
- What they said they need (tags): ${joinTags(a.event_need_tags)}
- What they want (tags): ${joinTags(a.event_want_tags)}
- Stable profile want tags: ${joinTags(a.want_tags)}
- Stable profile need tags: ${joinTags(a.need_tags)}
- Business need (their words): ${truncate(a.business_need_text, 500)}
- Why they came: ${truncate(a.why_attending_text, 500)}
- Event profile summary: ${truncate(a.event_profile_summary_text, 600)}
${
  fitScore != null && fitSignals != null
    ? `
Internal fit score: ${fitScore}/100 (for alignment only; do not quote the number in your answer).

Ordered fit signals from our scoring (paraphrase at least one when the score supports it):
${fitSignals.length ? fitSignals.map((s) => `- ${s}`).join("\n") : "- (none)"}

Output rules — one sentence only, no bullet points, no markdown:
- If fit score is 55 or higher: do not say "unclear", "unclear from", or "no meaningful match". Give a concrete reason tied to the attendee profile and cite or paraphrase at least one fit signal.
- If fit score is 25–54: describe moderate fit; reference a signal or name what is missing for a stronger pitch.
- If fit score is below 25: describe weak fit (e.g. role, intent, or language mismatch) in plain language; do not use hype.

Be direct and specific. Do not use filler phrases like "great opportunity".`
    : `
In one sentence, explain specifically why this attendee is worth the sponsor reaching out to. Be direct and specific. Do not use filler phrases like "great opportunity". If there is no meaningful match, say exactly: Fit is unclear from available profile data.`
}
`
}

/** If the model contradicts a strong score, replace with a template (no second LLM call). */
export function guardSponsorMatchExplanationText(input: {
  text: string | null
  fitScore: number
  fitSignals: string[]
  attendee: AttendeeBundleForExplanation
}): string | null {
  const { text, fitScore, fitSignals, attendee } = input
  if (!text?.trim()) return null
  if (fitScore < 55) return text.trim()
  const contradicts =
    /\bunclear\b/i.test(text) || /no meaningful match/i.test(text)
  if (!contradicts) return text.trim()
  const who =
    [attendee.career_title, attendee.company_name].filter(Boolean).join(" at ") || "This contact"
  const anchor =
    fitSignals[0]?.trim() || "their profile lines up with your target customer"
  return `${who} is a strong fit: ${anchor}.`
}

export async function generateSponsorMatchExplanation(
  openai: OpenAI,
  userPrompt: string,
): Promise<string | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write concise, factual one-sentence reasons for B2B sponsors. No hype, no bullet points, no markdown.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 120,
    })
    const raw = completion.choices[0]?.message?.content?.trim()
    return raw && raw.length > 0 ? raw : null
  } catch (e) {
    console.error("sponsor-match-explanation OpenAI:", e)
    return null
  }
}
