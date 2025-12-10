import OpenAI from "https://esm.sh/openai@4"
import { ScoredCandidate, ViewerProfile } from "./types.ts"

interface RerankEntry {
  match_user_id: string
  reason?: string
}

function buildViewerSummary(viewer: ViewerProfile): string {
  const lines: string[] = []
  lines.push(`Viewer: ${viewer.firstName || "Attendee"} ${viewer.lastName || ""}`.trim())
  if (viewer.jobTitle) {
    lines.push(`Role: ${viewer.jobTitle}${viewer.company ? ` @ ${viewer.company}` : ""}`)
  }
  if (viewer.businessNeed) lines.push(`Business need: ${viewer.businessNeed}`)
  if (viewer.needTags?.length) lines.push(`Need tags: ${viewer.needTags.join(", ")}`)
  if (viewer.offerTags?.length) lines.push(`Offer tags: ${viewer.offerTags.join(", ")}`)
  if (viewer.hobbyTags?.length) lines.push(`Hobbies: ${viewer.hobbyTags.join(", ")}`)
  return lines.join("\n")
}

function buildCandidateSummary(scored: ScoredCandidate, index: number): string {
  const candidate = scored.candidate
  const lines: string[] = [
    `${index + 1}. ${candidate.firstName || "Candidate"} ${candidate.lastName || ""}`.trim()
  ]
  if (candidate.jobTitle) {
    lines.push(`Role: ${candidate.jobTitle}${candidate.company ? ` @ ${candidate.company}` : ""}`)
  }
  if (candidate.offerSummary) lines.push(`Offer summary: ${candidate.offerSummary}`)
  if (candidate.offerTags?.length) lines.push(`Offer tags: ${candidate.offerTags.join(", ")}`)
  if (candidate.needTags?.length) lines.push(`Need tags: ${candidate.needTags.join(", ")}`)
  if (candidate.businessNeed) lines.push(`Business need: ${candidate.businessNeed}`)
  lines.push(
    `Scores -> need:${scored.breakdown.s_need.toFixed(2)}, supply:${scored.breakdown.s_supply.toFixed(
      2
    )}, vibe:${scored.breakdown.s_vibe.toFixed(2)}, common:${scored.breakdown.s_common.toFixed(
      2
    )}, career:${scored.breakdown.s_career.toFixed(2)}, personality:${scored.breakdown.s_personality.toFixed(
      2
    )}`
  )
  if (scored.meta.needToken) {
    lines.push(`Need overlap token: ${scored.meta.needToken}`)
  }
  if (scored.meta.supplyToken) {
    lines.push(`Supply overlap token: ${scored.meta.supplyToken}`)
  }
  if (scored.meta.sharedHobby) {
    lines.push(`Shared hobby: ${scored.meta.sharedHobby}`)
  }
  return lines.join("\n")
}

function applyRerank(scored: ScoredCandidate[], ranked: RerankEntry[]): ScoredCandidate[] {
  const order = new Map<string, { index: number; reason?: string }>()
  ranked.forEach((entry, idx) => {
    if (entry?.match_user_id) {
      order.set(entry.match_user_id, { index: idx, reason: entry.reason })
    }
  })

  if (order.size === 0) return scored

  const withRank = scored.map((candidate, idx) => {
    const entry = order.get(candidate.candidate.id)
    if (entry?.reason) {
      candidate.meta.aiReason = entry.reason.trim()
    }
    return {
      candidate,
      rank: entry ? entry.index : order.size + idx
    }
  })

  withRank.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return b.candidate.score - a.candidate.score
  })

  return withRank.map((item) => item.candidate)
}

export async function rerankWithAI(
  openai: OpenAI | null,
  viewer: ViewerProfile,
  scored: ScoredCandidate[],
  limit: number = 6
): Promise<ScoredCandidate[]> {
  if (!openai || scored.length <= 1) return scored

  const top = scored.slice(0, limit)
  const viewerSummary = buildViewerSummary(viewer)
  const candidateSummaries = top.map((candidate, idx) => buildCandidateSummary(candidate, idx)).join("\n\n")

  const prompt = `You are a networking matchmaker. Reorder the provided candidates to maximize the viewer's success.
You MUST return all candidates provided - you cannot drop any. Only reorder them.

CRITICAL: Always use gender-neutral language in all explanations and descriptions. Never assume someone's gender. Use "they/them/their" pronouns, or refer to people by their name, title, or role. Never use "he/him/his" or "she/her" pronouns.

BEFORE SCORING: Infer each person's normalized function and seniority from their job title (e.g., "Account Executive" → sales/IC, "VP of Engineering" → engineering/vp, "Founder" → exec/founder).

Use buyer-persona intelligence:
- Sellers (seeking clients): Match buyer functions (prefer Directors+ when leader_required). If sector is known, prioritize that sector.
- Job seekers: Match recruiters/hiring managers in the same function.
- Mentees: Match mentors in the same function with seniority gap ≥3 years.
- If uncertain about sector, prefer leadership in core buyer functions.
- If proposing a non-standard pairing, justify it explicitly with product/industry context.

Return strict JSON array with objects { "match_user_id": "<id>", "reason": "<short reason>" }.
Include ALL candidate IDs in your response. Explain why each candidate helps the viewer (focus on supply aligning with need). Be concise.

IMPORTANT RULES:
- You must NOT say someone can teach coding unless their title or tags clearly show engineering/development/ML/data skills.
- If you select a non-engineer because no engineer exists, you must state that explicitly in the reason ("there isn't a clear engineer available, so...").
- Never drop candidates - only reorder them.
- For each candidate, include function_fit_reason explaining why the role pairing makes sense for the intent.

${viewerSummary}

Candidates:
${candidateSummaries}`

  try {
    const response = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Re-order candidates to maximize the viewer's success. Respond with JSON only, no prose. Always use gender-neutral language - never assume gender. Use \"they/them/their\" pronouns or refer to people by name/title."
        },
        { role: "user", content: prompt }
      ]
    })

    const raw = response.choices[0]?.message?.content?.trim()
    if (!raw) return scored

    const extractArray = (input: string): RerankEntry[] | null => {
      const cleaned = input.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "").trim()
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (!arrayMatch) return null
      try {
        const parsed = JSON.parse(arrayMatch[0])
        return Array.isArray(parsed) ? (parsed as RerankEntry[]) : null
      } catch {
        return null
      }
    }

    const parsed = extractArray(raw)
    if (!parsed) {
      console.warn("ai_rerank_failed", "Unexpected response shape", raw.slice(0, 120))
      return scored
    }

    // Ensure we return all candidates (AI can only reorder, not filter)
    const allCandidateIds = new Set(scored.map(c => c.candidate.id))
    const parsedIds = new Set(parsed.map(p => p.match_user_id))
    
    // Add any missing candidates to the end
    for (const candidate of scored) {
      if (!parsedIds.has(candidate.candidate.id)) {
        parsed.push({ match_user_id: candidate.candidate.id, reason: "Additional match" })
      }
    }
    
    return applyRerank(scored, parsed)
  } catch (error) {
    console.warn("GPT rerank failed:", error)
    return scored
  }
}

