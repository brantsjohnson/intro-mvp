import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export interface MatchThresholds {
  need: number
  interests: number
  personality: number
}

export interface MatchWeights {
  need: number
  supply: number
  vibe: number
  common: number
  career: number
  personality: number
}

export interface MatchLimits {
  candidateRecall: number
  suggestionsPerUser: number
}

export interface MatchExplanationConfig {
  maxWords: number
  buyerRoleWeight: boolean
  allowSharedHobby: boolean
}

export interface MatchConfig {
  thresholds: MatchThresholds
  weights: MatchWeights
  limits: MatchLimits
  explanation: MatchExplanationConfig
}

const clampNumber = (value: unknown, fallback: number, min = 0, max = 1) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

const coercePositive = (value: unknown, fallback: number, min = 0) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.max(value, min)
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  thresholds: {
    need: 0.52,
    interests: 0.32,
    personality: 0.38
  },
  weights: {
    need: 0.42,
    supply: 0.18,
    vibe: 0.15,
    common: 0.12,
    career: 0.1,
    personality: 0.03
  },
  limits: {
    candidateRecall: 200,
    suggestionsPerUser: 6
  },
  explanation: {
    maxWords: 35,
    buyerRoleWeight: true,
    allowSharedHobby: true
  }
}

const mergeThresholds = (raw: any): MatchThresholds => ({
  need: clampNumber(raw?.need, DEFAULT_MATCH_CONFIG.thresholds.need),
  interests: clampNumber(raw?.interests, DEFAULT_MATCH_CONFIG.thresholds.interests),
  personality: clampNumber(raw?.personality, DEFAULT_MATCH_CONFIG.thresholds.personality)
})

const mergeWeights = (raw: any): MatchWeights => {
  const defaults = DEFAULT_MATCH_CONFIG.weights
  return {
    need: clampNumber(raw?.need, defaults.need),
    supply: clampNumber(raw?.supply, defaults.supply),
    vibe: clampNumber(raw?.vibe, defaults.vibe),
    common: clampNumber(raw?.common, defaults.common),
    career: clampNumber(raw?.career, defaults.career),
    personality: clampNumber(raw?.personality, defaults.personality)
  }
}

const mergeLimits = (raw: any): MatchLimits => {
  const defaults = DEFAULT_MATCH_CONFIG.limits
  return {
    candidateRecall: coercePositive(raw?.candidateRecall, defaults.candidateRecall, 10),
    suggestionsPerUser: coercePositive(raw?.suggestionsPerUser, defaults.suggestionsPerUser, 1)
  }
}

const mergeExplanation = (raw: any): MatchExplanationConfig => {
  const defaults = DEFAULT_MATCH_CONFIG.explanation
  return {
    maxWords: coercePositive(raw?.maxWords, defaults.maxWords, 10),
    buyerRoleWeight: typeof raw?.buyerRoleWeight === "boolean" ? raw.buyerRoleWeight : defaults.buyerRoleWeight,
    allowSharedHobby: typeof raw?.allowSharedHobby === "boolean" ? raw.allowSharedHobby : defaults.allowSharedHobby
  }
}

export const mergeMatchConfig = (raw: unknown): MatchConfig => {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_MATCH_CONFIG
  }

  const config = raw as Record<string, unknown>

  return {
    thresholds: mergeThresholds(config.thresholds),
    weights: mergeWeights(config.weights),
    limits: mergeLimits(config.limits),
    explanation: mergeExplanation(config.explanation)
  }
}

export const loadMatchConfig = async (client: SupabaseClient, eventId: string): Promise<MatchConfig> => {
  try {
    const { data, error } = await client
      .from("events")
      .select("match_config")
      .eq("event_id", eventId)
      .maybeSingle()

    if (error) {
      console.warn(`Failed to load match_config for event ${eventId}:`, error)
      return DEFAULT_MATCH_CONFIG
    }

    return mergeMatchConfig(data?.match_config ?? null)
  } catch (err) {
    console.warn(`Unexpected error loading match_config for event ${eventId}:`, err)
    return DEFAULT_MATCH_CONFIG
  }
}

