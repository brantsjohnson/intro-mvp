import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { CandidateProfile, ViewerProfile } from "./types.ts"

const PROFILE_COLUMNS = `
  event_id,
  user_id,
  why_attending_text,
  business_need_text,
  event_role_intent,
  event_availability_status,
  event_offer_tags,
  event_want_tags,
  event_need_tags,
  event_industry_tags,
  event_hobby_tags,
  profile_embedding,
  connection_types_selected,
  connection_followups_json,
  users:user_id (
    user_id,
    first_name,
    last_name,
    career_title,
    company_name,
    career_years_experience,
    offer_summary_text,
    want_summary_text,
    offer_embedding,
    need_embedding,
    profile_embedding,
    offer_tags,
    want_tags,
    need_tags,
    industry_tags,
    hobby_tags,
    hobbies,
    collaboration_role_intent,
    engagement_availability_status,
    personality_embedding
  )
`

function mergeUnique(...lists: (string[] | null | undefined)[]): string[] | null {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    if (!list) continue
    for (const item of list) {
      if (!item) continue
      const value = item.toLowerCase()
      if (!seen.has(value)) {
        seen.add(value)
        merged.push(item)
      }
    }
  }
  return merged.length ? merged : null
}

function mapAttendanceRow(row: any): CandidateProfile {
  const user = row.users || {}
  return {
    eventId: row.event_id,
    id: user.user_id,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    jobTitle: user.career_title ?? null,
    company: user.company_name ?? null,
    careerYears: user.career_years_experience ?? null,
    offerSummary: user.offer_summary_text ?? null,
    wantSummary: user.want_summary_text ?? null,
    offerEmbedding: user.offer_embedding ?? null,
    needEmbedding: user.need_embedding ?? null,
    profileEmbedding: user.profile_embedding ?? row.profile_embedding ?? null,
    offerTags: mergeUnique(user.offer_tags, row.event_offer_tags),
    wantTags: mergeUnique(user.want_tags, row.event_want_tags),
    needTags: mergeUnique(user.need_tags, row.event_need_tags),
    industryTags: mergeUnique(user.industry_tags, row.event_industry_tags),
    hobbyTags: mergeUnique(user.hobby_tags, row.event_hobby_tags),
    hobbies: mergeUnique(user.hobbies, row.event_hobby_tags),
    businessNeed: row.business_need_text ?? null,
    whyAttending: row.why_attending_text ?? null,
    roleIntent: row.event_role_intent ?? user.collaboration_role_intent ?? null,
    availabilityStatus: row.event_availability_status ?? user.engagement_availability_status ?? null,
    connectionTypes: row.connection_types_selected ?? null,
    followUps: row.connection_followups_json ?? null,
    personalityEmbedding: user.personality_embedding ?? null
  }
}

export async function loadViewerProfile(
  client: SupabaseClient,
  eventId: string,
  userId: string
): Promise<ViewerProfile | null> {
  const { data, error } = await client
    .from("attendance")
    .select(PROFILE_COLUMNS)
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    console.error("Failed to load viewer profile:", error)
    return null
  }

  const candidateProfile = mapAttendanceRow(data)
  return {
    id: candidateProfile.id,
    firstName: candidateProfile.firstName,
    lastName: candidateProfile.lastName,
    jobTitle: candidateProfile.jobTitle,
    company: candidateProfile.company,
    careerYears: candidateProfile.careerYears,
    offerEmbedding: candidateProfile.offerEmbedding ?? null,
    needEmbedding: candidateProfile.needEmbedding ?? null,
    profileEmbedding: candidateProfile.profileEmbedding ?? null,
    offerTags: candidateProfile.offerTags ?? null,
    wantTags: candidateProfile.wantTags ?? null,
    needTags: candidateProfile.needTags ?? null,
    industryTags: candidateProfile.industryTags ?? null,
    hobbyTags: candidateProfile.hobbyTags ?? null,
    hobbies: candidateProfile.hobbies ?? null,
    businessNeed: candidateProfile.businessNeed ?? null,
    whyAttending: candidateProfile.whyAttending ?? null,
    roleIntent: candidateProfile.roleIntent ?? null,
    availabilityStatus: candidateProfile.availabilityStatus ?? null,
    personalityEmbedding: candidateProfile.personalityEmbedding ?? null,
    connectionTypes: candidateProfile.connectionTypes ?? null,
    followUps: candidateProfile.followUps ?? null
  }
}

export async function loadCandidateProfiles(
  client: SupabaseClient,
  eventId: string,
  userIds: string[]
): Promise<CandidateProfile[]> {
  if (userIds.length === 0) return []

  const { data, error } = await client
    .from("attendance")
    .select(PROFILE_COLUMNS)
    .eq("event_id", eventId)
    .in("user_id", userIds)

  if (error) {
    console.error("Failed to load candidate profiles:", error)
    return []
  }

  return (data ?? []).map(mapAttendanceRow)
}

