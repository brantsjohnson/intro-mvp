import OpenAI from "https://esm.sh/openai@4"
import { ViewerProfile, CandidateProfile, DimensionScores, StructuredMatchExplanation } from "./types.ts"

export async function generateStructuredExplanation(
  openai: OpenAI,
  viewer: ViewerProfile,
  candidate: CandidateProfile,
  dimensionScores: DimensionScores
): Promise<StructuredMatchExplanation | null> {
  const systemPrompt = `You are helping explain why two attendees at a business event should meet.

You receive two attendees (A = current user, B = recommended match) plus numeric match scores by dimension.

Your job is not to decide who to match. The backend already chose this pair.

BEFORE SCORING: Infer each person's normalized function and seniority from their job title (e.g., "Account Executive" → sales/IC, "VP of Engineering" → engineering/vp, "Founder" → exec/founder).

Use buyer-persona intelligence:
- Sellers (seeking clients): Match buyer functions (prefer Directors+ when leader_required). If sector is known, prioritize that sector.
- Job seekers: Match recruiters/hiring managers in the same function.
- Mentees: Match mentors in the same function with seniority gap ≥3 years.
- If uncertain about sector, prefer leadership in core buyer functions.
- If proposing a non-standard pairing, justify it explicitly with product/industry context.

Your job is to:
– Name the connection type (mentor, peer collaborator, potential client, friendship / kindred spirit, warm intro, etc.).
– Write a short, specific explanation of why they should talk, grounded only in the provided data.
– Highlight concrete overlap (industries, roles, goals) and complementarity (where one can help the other).
– Include function_fit_reason explaining why the role pairing makes sense for the intent.
– Suggest one simple, non-cringey icebreaker question.
– Output strict JSON matching the schema given.

Rules:
– 1–2 sentences max for reason_summary.
– Each bullet in helpfulness_bullets is 1 short sentence.
– Never just repeat the company boilerplate description. Always tie it directly to user A's goals/needs.
– Never hallucinate details not in the input.
– You must NOT say someone can teach coding unless their title or tags clearly show engineering/development/ML/data skills.
– If you select a non-engineer because no engineer exists, you must state that explicitly ("there isn't a clear engineer available, so...").
– connection_type should be one of: "mentor", "peer collaborator", "potential client", "warm intro", "kindred spirit", "industry peer", "complementary skills"
– shared_tags should be 2-4 tags max
– helpfulness_bullets should be 2-3 bullets max
– suggested_icebreaker should be one question, conversational and natural

Output JSON only, no markdown, no code blocks.`

  // Extract persona data if available from meta
  const viewerPersona = (viewer as any).viewerPersona
  const viewerRole = (viewer as any).viewerRole
  const candidateRole = (candidate as any).candidateRole

  const userPrompt = JSON.stringify({
    user_a: {
      name: `${viewer.firstName || ""} ${viewer.lastName || ""}`.trim(),
      job_title: viewer.jobTitle,
      role_function: viewerRole?.role_function,
      role_seniority: viewerRole?.role_seniority,
      company: viewer.company,
      company_summary: viewer.companySummary,
      career_years: viewer.careerYears,
      industries: viewer.industryTags || [],
      skills: (viewer as any).linkedinSkills || [],
      hobbies: [...(viewer.hobbies || []), ...(viewer.hobbyTags || [])],
      goals_for_event: (viewer as any).eventGoalsTags || [],
      can_help_with: viewer.offerTags || [],
      needs_help_with: viewer.needTags || [],
      business_need: viewer.businessNeed,
      why_attending: viewer.whyAttending,
      connection_types: viewer.connectionTypes || [],
      buyer_persona: viewerPersona ? {
        sector: viewerPersona.sector,
        buyer_functions: viewerPersona.buyer_functions,
        leader_required: viewerPersona.leader_required
      } : null,
    },
    user_b: {
      name: `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim(),
      job_title: candidate.jobTitle,
      role_function: candidateRole?.role_function,
      role_seniority: candidateRole?.role_seniority,
      company: candidate.company,
      company_summary: candidate.companySummary,
      career_years: candidate.careerYears,
      industries: candidate.industryTags || [],
      skills: (candidate as any).linkedinSkills || [],
      hobbies: [...(candidate.hobbies || []), ...(candidate.hobbyTags || [])],
      goals_for_event: (candidate as any).eventGoalsTags || [],
      can_help_with: candidate.offerTags || [],
      needs_help_with: candidate.needTags || [],
      business_need: candidate.businessNeed,
      why_attending: candidate.whyAttending,
      connection_types: candidate.connectionTypes || [],
    },
    dimension_scores: dimensionScores,
  }, null, 2)

  try {
    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    })

    const content = response.choices[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    
    // Validate and normalize the response
    return {
      connection_type: parsed.connection_type || "peer collaborator",
      reason_title: parsed.reason_title || `${candidate.firstName || "They"} - ${parsed.connection_type || "match"}`,
      reason_summary: parsed.reason_summary || "",
      shared_tags: Array.isArray(parsed.shared_tags) ? parsed.shared_tags.slice(0, 4) : [],
      helpfulness_bullets: Array.isArray(parsed.helpfulness_bullets) ? parsed.helpfulness_bullets.slice(0, 3) : [],
      suggested_icebreaker: parsed.suggested_icebreaker || "What brings you to this event?",
    }
  } catch (error) {
    console.error("LLM explanation generation failed:", error)
    return null
  }
}

