import { ViewerProfile, CandidateProfile, DimensionScores } from "./types.ts"

const ROLE_FUNCTION_MAP: Record<string, string[]> = {
  product: ["product", "pm", "product manager", "product management"],
  engineering: ["engineer", "developer", "dev", "software", "tech", "technical", "engineering"],
  design: ["design", "designer", "ux", "ui", "creative"],
  sales: ["sales", "account", "business development", "bd", "revenue"],
  marketing: ["marketing", "growth", "demand gen", "content"],
  founder: ["founder", "cofounder", "ceo", "startup", "entrepreneur"],
  data: ["data", "analyst", "analytics", "science", "scientist"],
  operations: ["operations", "ops", "operations manager"],
}

const ADJACENT_FUNCTIONS: Record<string, string[]> = {
  product: ["design", "engineering", "founder"],
  engineering: ["product", "design", "founder"],
  design: ["product", "engineering", "founder"],
  sales: ["marketing", "founder"],
  marketing: ["sales", "founder"],
  founder: ["product", "engineering", "design", "sales", "marketing"],
  data: ["product", "engineering"],
  operations: ["founder", "product"],
}

function normalizeTitle(title: string | null): string {
  if (!title) return ""
  return title.toLowerCase().trim()
}

function extractRoleFunction(title: string | null): string | null {
  const normalized = normalizeTitle(title)
  for (const [role, keywords] of Object.entries(ROLE_FUNCTION_MAP)) {
    if (keywords.some(kw => normalized.includes(kw))) {
      return role
    }
  }
  return null
}

function areAdjacentRoles(titleA: string | null, titleB: string | null): boolean {
  const roleA = extractRoleFunction(titleA)
  const roleB = extractRoleFunction(titleB)
  if (!roleA || !roleB) return false
  if (roleA === roleB) return true
  return ADJACENT_FUNCTIONS[roleA]?.includes(roleB) || ADJACENT_FUNCTIONS[roleB]?.includes(roleA) || false
}

function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0
  const setALower = new Set(setA.map(s => s.toLowerCase()))
  const setBLower = new Set(setB.map(s => s.toLowerCase()))
  const intersection = new Set([...setALower].filter(x => setBLower.has(x)))
  const union = new Set([...setALower, ...setBLower])
  return union.size === 0 ? 0 : intersection.size / union.size
}

function cosineSimilarity(vecA: number[] | null, vecB: number[] | null): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function computeDimensionScores(
  viewer: ViewerProfile,
  candidate: CandidateProfile
): DimensionScores {
  // 1. Role similarity (0-1)
  const viewerTitle = viewer.jobTitle
  const candidateTitle = candidate.jobTitle
  let roleSimilarity = 0
  if (viewerTitle && candidateTitle) {
    const normalizedViewer = normalizeTitle(viewerTitle)
    const normalizedCandidate = normalizeTitle(candidateTitle)
    if (normalizedViewer === normalizedCandidate) {
      roleSimilarity = 1.0
    } else if (areAdjacentRoles(viewerTitle, candidateTitle)) {
      roleSimilarity = 0.7
    } else {
      // Check for partial matches
      const viewerWords = normalizedViewer.split(/\s+/)
      const candidateWords = normalizedCandidate.split(/\s+/)
      const commonWords = viewerWords.filter(w => candidateWords.includes(w) && w.length > 3)
      roleSimilarity = Math.min(0.5, commonWords.length * 0.15)
    }
  }

  // 2. Industry overlap (0-1)
  const viewerIndustries = viewer.industryTags || []
  const candidateIndustries = candidate.industryTags || []
  const industryOverlap = jaccardSimilarity(viewerIndustries, candidateIndustries)

  // 3. Goal alignment (0-1) - "I need X" with "I can help with X"
  const viewerNeeds = viewer.needTags || []
  const candidateOffers = candidate.offerTags || []
  const viewerWants = (viewer as any).wantTags || []
  const candidateNeeds = candidate.needTags || []
  
  // Direct need-offer match
  const needOfferMatch = jaccardSimilarity(viewerNeeds, candidateOffers)
  // Want-need match (candidate needs what viewer wants to offer)
  const wantNeedMatch = jaccardSimilarity(viewerWants, candidateNeeds)
  // Business need text matching
  let businessNeedMatch = 0
  if (viewer.businessNeed && candidate.offerSummary) {
    const needLower = viewer.businessNeed.toLowerCase()
    const offerLower = candidate.offerSummary.toLowerCase()
    const needWords = needLower.split(/\W+/).filter(w => w.length > 3)
    const offerWords = offerLower.split(/\W+/).filter(w => w.length > 3)
    const matchingWords = needWords.filter(w => offerWords.includes(w))
    businessNeedMatch = needWords.length > 0 ? matchingWords.length / needWords.length : 0
  }
  
  const goalAlignment = Math.max(needOfferMatch, wantNeedMatch, businessNeedMatch * 0.8)

  // 4. Experience complement (0-1) - mentor/peer pairing
  const viewerYears = viewer.careerYears ?? 0
  const candidateYears = candidate.careerYears ?? 0
  const yearDiff = Math.abs(viewerYears - candidateYears)
  
  let experienceComplement = 0
  if (yearDiff === 0 && viewerYears > 0) {
    // Peer pairing
    experienceComplement = 0.6
  } else if (yearDiff >= 3 && yearDiff <= 10) {
    // Good mentor/mentee gap (3-10 years)
    experienceComplement = 0.8
  } else if (yearDiff > 10) {
    // Very large gap (senior mentor)
    experienceComplement = 0.9
  } else if (yearDiff > 0 && yearDiff < 3) {
    // Small gap (near peers)
    experienceComplement = 0.5
  }

  // 5. Topic overlap (0-1) - hobbies, interests, skills
  const viewerHobbies = [...(viewer.hobbies || []), ...(viewer.hobbyTags || [])]
  const candidateHobbies = [...(candidate.hobbies || []), ...(candidate.hobbyTags || [])]
  const hobbyOverlap = jaccardSimilarity(viewerHobbies, candidateHobbies)
  
  // Skills overlap (if available)
  const viewerSkills = (viewer as any).linkedinSkills || []
  const candidateSkills = (candidate as any).linkedinSkills || []
  const skillsOverlap = jaccardSimilarity(viewerSkills, candidateSkills)
  
  const topicOverlap = Math.max(hobbyOverlap, skillsOverlap * 0.7)

  // 6. Personality fit (0-1) - use embeddings if available
  let personalityFit = 0
  if (viewer.personalityEmbedding && candidate.personalityEmbedding) {
    personalityFit = cosineSimilarity(viewer.personalityEmbedding as number[], candidate.personalityEmbedding as number[])
    // Normalize to 0-1 range (cosine similarity is typically -1 to 1, but embeddings are usually 0-1)
    personalityFit = Math.max(0, personalityFit)
  } else {
    // Fallback: check MBTI/Enneagram if available
    const viewerMBTI = (viewer as any).mbtiType
    const candidateMBTI = (candidate as any).mbtiType
    if (viewerMBTI && candidateMBTI && viewerMBTI === candidateMBTI) {
      personalityFit = 0.6
    }
  }

  return {
    role_similarity: Math.min(1, Math.max(0, roleSimilarity)),
    industry_overlap: Math.min(1, Math.max(0, industryOverlap)),
    goal_alignment: Math.min(1, Math.max(0, goalAlignment)),
    experience_complement: Math.min(1, Math.max(0, experienceComplement)),
    topic_overlap: Math.min(1, Math.max(0, topicOverlap)),
    personality_fit: Math.min(1, Math.max(0, personalityFit)),
  }
}

export function computeWeightedScore(dimensionScores: DimensionScores): number {
  // Weighted combination: 0.3*goal_alignment + 0.25*role_similarity + 0.2*industry_overlap + 0.15*experience_complement + 0.1*topics/personality
  return (
    dimensionScores.goal_alignment * 0.3 +
    dimensionScores.role_similarity * 0.25 +
    dimensionScores.industry_overlap * 0.2 +
    dimensionScores.experience_complement * 0.15 +
    (dimensionScores.topic_overlap + dimensionScores.personality_fit) / 2 * 0.1
  )
}

