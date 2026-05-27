export const MATCH_EXPLANATION_ALGORITHM_VERSION = "v6_ai_explanations_v2"

const LEGACY_EXPLANATION_PATTERNS = [
  /shared\s+\w+\s+domain\s+context/i,
  /domain context for networking/i,
  /worth a quick intro/i,
  /worth a five-minute intro/i,
  /networking fit on shared/i,
  /general networking overlap/i,
  /commercial fit:/i,
  /fallback match/i,
]

/** True when stored copy should be regenerated with the AI matchmaker. */
export function isStaleMatchExplanation(
  text: string | null | undefined,
  algorithmVersion: string | null | undefined,
): boolean {
  const normalized = (text ?? "").trim()
  if (!normalized) return true
  if (algorithmVersion !== MATCH_EXPLANATION_ALGORITHM_VERSION) return true
  if (LEGACY_EXPLANATION_PATTERNS.some((pattern) => pattern.test(normalized))) return true

  // Old template bug: same phrase repeated back-to-back
  const halves = normalized.split(/\.\s+/)
  if (halves.length >= 2 && halves[0] && halves[0] === halves[1]) return true

  return false
}

export function matchNeedsExplanationUpgrade(
  matches: Array<{ summary?: string | null; algorithm_version?: string | null }>,
): boolean {
  return matches.some((match) =>
    isStaleMatchExplanation(match.summary, match.algorithm_version),
  )
}
