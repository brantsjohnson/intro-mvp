export interface ViewerProfile {
  id: string
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  company: string | null
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

export interface ScoredCandidate {
  candidate: CandidateProfile
  score: number
  breakdown: ScoreBreakdown
  bases: string[]
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

