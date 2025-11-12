import { ScoredCandidate, ViewerProfile } from "./types.ts"

function buildViewerNeeds(viewer: ViewerProfile): string[] {
  const needs: string[] = []
  if (viewer.businessNeed) needs.push(viewer.businessNeed)
  if (viewer.needTags) needs.push(...viewer.needTags.map((tag) => `Needs: ${tag}`))
  if (viewer.whyAttending) needs.push(viewer.whyAttending)
  return needs.slice(0, 3)
}

function buildCandidateStrengths(scored: ScoredCandidate): string[] {
  const strengths: string[] = []
  const candidate = scored.candidate
  if (candidate.offerSummary) strengths.push(candidate.offerSummary)
  if (candidate.offerTags) strengths.push(...candidate.offerTags.map((tag) => `Offers: ${tag}`))
  if (candidate.industryTags) strengths.push(...candidate.industryTags.map((tag) => `Industry: ${tag}`))
  return strengths.slice(0, 3)
}

function renderNeedPhrase(viewer: ViewerProfile, scored: ScoredCandidate): string {
  const candidate = scored.candidate
  const token = scored.meta.needToken || scored.meta.supplyToken
  if (token) {
    return `${viewer.firstName || "You"} need support with ${token}, and ${candidate.firstName || "they"} focus on that area.`
  }
  if (viewer.businessNeed) {
    return `${viewer.firstName || "You"} mentioned “${viewer.businessNeed}”, and ${candidate.firstName || "they"} have experience that aligns with it.`
  }
  if (candidate.offerSummary) {
    return `${candidate.firstName || "They"} can help with ${candidate.offerSummary}.`
  }
  return `${candidate.firstName || "They"} look like a useful contact for your current goals.`
}

export function buildDeterministicExplanation(
  viewer: ViewerProfile,
  scored: ScoredCandidate
): {
  explanation: string
  panel: {
    summary: string
    why_meet: string
    shared_activities: string[]
    dive_deeper: string
    bases: string[]
    viewer_needs: string[]
    candidate_strengths: string[]
    shared_points: string[]
  }
} {
  const candidate = scored.candidate
  const viewerNeeds = buildViewerNeeds(viewer)
  const candidateStrengths = buildCandidateStrengths(scored)
  const sharedPoints: string[] = []
  if (scored.meta.sharedHobby) {
    sharedPoints.push(`Both mentioned ${scored.meta.sharedHobby}`)
  }
  if (scored.meta.needToken && scored.meta.supplyToken && scored.meta.needToken === scored.meta.supplyToken) {
    sharedPoints.push(`Mutual focus on ${scored.meta.needToken}`)
  }

  const aiReason = scored.meta.aiReason?.trim()
  const whyMeet = aiReason || renderNeedPhrase(viewer, scored)
  const summary = aiReason
    ? `${candidate.firstName || "This attendee"} is a strong fit for your goals.`
    : `${candidate.firstName || "This attendee"} can help you progress faster on what you’re focused on right now.`

  const sharedActivities: string[] = []
  if (scored.meta.sharedHobby) {
    sharedActivities.push(`Break the ice by talking about ${scored.meta.sharedHobby}.`)
  }
  const focusTopic = scored.meta.needToken || scored.meta.supplyToken || viewer.businessNeed || "current priorities"
  sharedActivities.push(`Swap ideas on ${focusTopic}.`)

  const diveDeeper = `Ask ${candidate.firstName || "them"} how they’ve tackled ${focusTopic} recently.`

  const explanation = aiReason
    ? aiReason
    : `${candidate.firstName || "They"} align with what you asked for: ${whyMeet}`

  return {
    explanation,
    panel: {
      summary,
      why_meet: whyMeet,
      shared_activities: sharedActivities,
      dive_deeper: diveDeeper,
      bases: scored.bases,
      viewer_needs: viewerNeeds,
      candidate_strengths: candidateStrengths,
      shared_points: sharedPoints
    }
  }
}

