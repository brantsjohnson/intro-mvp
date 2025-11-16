export interface ViewerProfile {
  id: string
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  company: string | null
  companySummary: string | null
  companyUrl?: string | null
  careerYears: number | null
  offerEmbedding: number[] | null
  needEmbedding: number[] | null
  profileEmbedding: number[] | null
  eventNeedEmbedding?: number[] | null
  eventOfferEmbedding?: number[] | null
  offerTags: string[] | null
  wantTags: string[] | null
  needTags: string[] | null
  industryTags: string[] | null
  /**
   * 0..1 — how niche the company’s target industry appears to be,
   * derived from company_summary. Broad horizontal products ~0.15–0.3,
   * niche vertical products ~0.6–0.9. May be null if unknown.
   */
  industrySpecificity?: number | null
  hobbyTags: string[] | null
  hobbies: string[] | null
  businessNeed: string | null
  whyAttending: string | null
  roleIntent: string | null
  availabilityStatus: string | null
  personalityEmbedding: number[] | null
  connectionTypes: string[] | null
  followUps: Record<string, string> | null
}

export interface CandidateProfile extends ViewerProfile {
  eventId: string
  offerSummary: string | null
  wantSummary: string | null
}

export interface AnnMatch {
  user_id: string
  similarity: number | null
}

export interface ScoreBreakdown {
  s_need: number
  s_supply: number
  s_vibe: number
  s_common: number
  s_career: number
  s_personality: number
}

export interface DimensionScores {
  role_similarity: number
  industry_overlap: number
  goal_alignment: number
  experience_complement: number
  topic_overlap: number
  personality_fit: number
}

export interface StructuredMatchExplanation {
  connection_type: string
  reason_title: string
  reason_summary: string
  shared_tags: string[]
  helpfulness_bullets: string[]
  suggested_icebreaker: string
}

export interface ScoredCandidate {
  candidate: CandidateProfile
  score: number
  breakdown: ScoreBreakdown
  bases: string[]
  dimensionScores?: DimensionScores
  structuredExplanation?: StructuredMatchExplanation
  meta: {
    needToken?: string
    supplyToken?: string
    sharedHobby?: string
    aiReason?: string
    intentFocus?: string
    intentToken?: string
    connectionBoost?: number
    viewerRole?: { role_function: string; role_seniority: string; confidence: number } | null
    candidateRole?: { role_function: string; role_seniority: string; confidence: number } | null
    viewerPersona?: { sector: string; buyer_functions: string[]; leader_required: boolean } | null
    industryFit?: {
      overlap: number
      viewerSpecificity: number
      viewerTags: string[]
      candidateTags: string[]
      matchedTags?: string[]
    }
  }
}

export interface MatchPanel {
  summary: string
  whyMeet: string
  sharedActivities: string[]
  diveDeeper: string
  bases: string[]
  viewerNeeds: string[]
  candidateStrengths: string[]
  sharedPoints: string[]
}

export interface ExistingMatch {
  match_user_id: string
  match_score: number | null
}

