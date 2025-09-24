// MBTI compatibility map and helpers derived from product guidance

export type MbtiType =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP"

export const MBTI_COMPATIBILITY: Record<MbtiType, MbtiType[]> = {
  // Analysts (NT)
  INTJ: ["ENFP", "ENTP"],
  INTP: ["ENTJ", "ENTP", "ENFP"],
  ENTJ: ["INTP", "ENTP", "ENFP"],
  ENTP: ["INFJ", "ENFP", "ENTP"],

  // Diplomats (NF)
  INFJ: ["ENFP", "ENTP"],
  INFP: ["ENFJ", "ENTJ", "ENFP"],
  ENFJ: ["INFP", "ENFP", "INFJ"],
  ENFP: ["INFJ", "INTJ", "ENFP"],

  // Sentinels (SJ)
  ISTJ: ["ESFP", "ESTP"],
  ISFJ: ["ESFP", "ESTP", "ENFP"],
  ESTJ: ["ISTP", "ISFP", "ESFP"],
  ESFJ: ["ISFP", "INFP", "ESFP"],

  // Explorers (SP)
  ISTP: ["ESTJ", "ENTJ", "ESFP"],
  ISFP: ["ESFJ", "ENFJ", "ESTJ"],
  ESTP: ["ISTJ", "ISFJ", "ESTP"],
  ESFP: ["ISTJ", "ISFJ", "ESFP"],
}

const MBTI_REASONS: Partial<Record<MbtiType, string>> = {
  INTJ: "Planner + dreamer balance: structure/vision meets spontaneity/warmth.",
  INTP: "Partners who add structure and energy reduce analysis paralysis and spark curiosity.",
  ENTJ: "Strong drivers pair well with partners who challenge ideas and add fresh energy.",
  ENTP: "High‑energy debates grounded by INFJ depth or matched by ENxP playfulness.",
  INFJ: "Depth/vision balanced by ENxP flexibility and playfulness.",
  INFP: "Gentle idealism supported by partners who bring drive, structure, and fun.",
  ENFJ: "Givers thrive with grounding depth or matched enthusiasm and heart.",
  ENFP: "Freedom/novelty grounded by INFJ/INTJ; ENFP + ENFP = joyful momentum.",
  ISTJ: "Reliable structure balanced by ESxP lightness, humor, and adventure.",
  ISFJ: "Caring consistency energized by ESFP/ENFP/ESTP vibrancy.",
  ESTJ: "Order and leadership softened by flexible, fun partners.",
  ESFJ: "Harmony seekers flourish with emotionally open, calm creatives.",
  ISTP: "Pragmatic spontaneity balanced by structured leaders or lively ESFPs.",
  ISFP: "Gentle artistry supported by structured, caring personalities.",
  ESTP: "Thrill‑seeking energy grounded by steady SJ types or matched by ESTP.",
  ESFP: "Fun‑forward style complemented by grounding SJs or mirrored by ESFP.",
}

export function normalizeMbti(type: string | null | undefined): MbtiType | null {
  if (!type) return null
  const normalized = type.trim().toUpperCase()
  const valid = [
    "INTJ","INTP","ENTJ","ENTP",
    "INFJ","INFP","ENFJ","ENFP",
    "ISTJ","ISFJ","ESTJ","ESFJ",
    "ISTP","ISFP","ESTP","ESFP",
  ] as const
  return (valid as readonly string[]).includes(normalized) ? (normalized as MbtiType) : null
}

export function areMbtiCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const A = normalizeMbti(a)
  const B = normalizeMbti(b)
  if (!A || !B) return false
  const aList = MBTI_COMPATIBILITY[A] || []
  const bList = MBTI_COMPATIBILITY[B] || []
  return aList.includes(B) || bList.includes(A)
}

export function explainMbtiCompatibility(a: string | null | undefined, b: string | null | undefined): string | null {
  const A = normalizeMbti(a)
  const B = normalizeMbti(b)
  if (!A || !B) return null
  if ((MBTI_COMPATIBILITY[A] || []).includes(B) && MBTI_REASONS[A]) {
    return MBTI_REASONS[A]!
  }
  if ((MBTI_COMPATIBILITY[B] || []).includes(A) && MBTI_REASONS[B]) {
    return MBTI_REASONS[B]!
  }
  return null
}

