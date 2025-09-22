import { createClientComponentClient } from "@/lib/supabase"
import { Profile } from "@/lib/types"
import { AIService, ProfileData, MatchCandidate } from "@/lib/ai-service"

export interface MatchingResult {
  matches: Array<{
    a: string
    b: string
    bases: string[]
    summary: string
    panels: Record<string, unknown>
  }>
}

export class MatchingService {
  private supabase = createClientComponentClient()
  private aiService = new AIService()

  async generateMatches(eventId: string): Promise<MatchingResult> {
    // Get all present members for the event
    const { data: members, error: membersError } = await this.supabase
      .from("event_members")
      .select(`
        user_id,
        profiles!inner (
          id,
          first_name,
          last_name,
          job_title,
          company,
          what_do_you_do,
          location,
          mbti,
          enneagram,
          networking_goals
        )
      `)
      .eq("event_id", eventId)
      .eq("is_present", true)

    if (membersError) {
      throw new Error(`Failed to load event members: ${membersError.message}`)
    }

    if (!members || members.length < 2) {
      return { matches: [] }
    }

    // Get hobbies for all members
    const userIds = members.map(m => m.user_id)
    const { data: hobbies } = await this.supabase
      .from("profile_hobbies")
      .select(`
        user_id,
        hobbies!inner (label)
      `)
      .in("user_id", userIds)

    // Get expertise for all members
    const { data: expertise } = await this.supabase
      .from("profile_expertise")
      .select(`
        user_id,
        expertise_tags!inner (label)
      `)
      .in("user_id", userIds)

    // Get networking goals for the event
    const { data: networkingGoals } = await this.supabase
      .from("event_networking_goals")
      .select("user_id, networking_goals")
      .eq("event_id", eventId)
      .in("user_id", userIds)

    // Get existing matches to avoid duplicates
    const { data: existingMatches } = await this.supabase
      .from("matches")
      .select("a, b, bases, summary")
      .eq("event_id", eventId)

    // Create profiles with their data for AI
    const profilesWithData: ProfileData[] = members.map(member => ({
      id: member.profiles.id,
      first_name: member.profiles.first_name,
      last_name: member.profiles.last_name,
      job_title: member.profiles.job_title,
      company: member.profiles.company,
      what_do_you_do: member.profiles.what_do_you_do,
      location: member.profiles.location,
      mbti: member.profiles.mbti,
      enneagram: member.profiles.enneagram,
      networking_goals: networkingGoals?.find(ng => ng.user_id === member.user_id)?.networking_goals || [],
      hobbies: hobbies?.filter(h => h.user_id === member.user_id).map(h => h.hobbies.label) || [],
      expertise: expertise?.filter(e => e.user_id === member.user_id).map(e => e.expertise_tags.label) || []
    }))

    // Use AI to generate matches
    const aiMatches = await this.aiService.generateMatches({
      eventId,
      profiles: profilesWithData,
      existingMatches: existingMatches || []
    })

    // Convert AI matches to our format
    const matches: MatchingResult["matches"] = []
    const usedPairs = new Set<string>()

    for (const aiMatch of aiMatches) {
      // Find the corresponding profile for personA
      const personA = profilesWithData.find(p => 
        profilesWithData.some(other => 
          other.id !== p.id && 
          this.profilesMatch(p, other, aiMatch)
        )
      )

      if (!personA) continue

      const personB = aiMatch.profile
      const pairKey = `${personA.id}-${personB.id}`
      const reversePairKey = `${personB.id}-${personA.id}`

      // Skip if already matched or if this pair is already being processed
      if (usedPairs.has(pairKey) || usedPairs.has(reversePairKey)) {
        continue
      }

      matches.push({
        a: personA.id,
        b: personB.id,
        bases: aiMatch.bases,
        summary: aiMatch.summary,
        panels: aiMatch.panels
      })

      usedPairs.add(pairKey)
      usedPairs.add(reversePairKey)
    }

    return { matches }
  }

  private profilesMatch(profileA: ProfileData, profileB: ProfileData, aiMatch: MatchCandidate): boolean {
    return profileB.id === aiMatch.profile.id
  }

  async saveMatches(eventId: string, matches: MatchingResult["matches"]): Promise<void> {
    if (matches.length === 0) return

    const matchInserts = matches.map(match => ({
      event_id: eventId,
      a: match.a,
      b: match.b,
      bases: match.bases,
      summary: match.summary,
      panels: match.panels,
      is_system: true
    }))

    const { error } = await this.supabase
      .from("matches")
      .insert(matchInserts)

    if (error) {
      throw new Error(`Failed to save matches: ${error.message}`)
    }
  }

  async refreshMatchesForNewUser(eventId: string, newUserId: string): Promise<void> {
    // Check if matchmaking is enabled for this event
    const { data: event } = await this.supabase
      .from("events")
      .select("matchmaking_enabled")
      .eq("id", eventId)
      .single()

    if (!event?.matchmaking_enabled) {
      return // Don't generate matches if matchmaking is disabled
    }

    // Get all present members including the new user
    const { data: members } = await this.supabase
      .from("event_members")
      .select(`
        user_id,
        profiles!inner (
          id,
          first_name,
          last_name,
          job_title,
          company,
          what_do_you_do,
          location,
          mbti,
          enneagram,
          networking_goals
        )
      `)
      .eq("event_id", eventId)
      .eq("is_present", true)

    if (!members || members.length < 2) {
      return
    }

    // Get existing matches to avoid duplicates
    const { data: existingMatches } = await this.supabase
      .from("matches")
      .select("a, b, bases, summary")
      .eq("event_id", eventId)

    // Get all the data needed for AI matching
    const userIds = members.map(m => m.user_id)
    const [hobbies, expertise, networkingGoals] = await Promise.all([
      this.supabase
        .from("profile_hobbies")
        .select(`
          user_id,
          hobbies!inner (label)
        `)
        .in("user_id", userIds),
      this.supabase
        .from("profile_expertise")
        .select(`
          user_id,
          expertise_tags!inner (label)
        `)
        .in("user_id", userIds),
      this.supabase
        .from("event_networking_goals")
        .select("user_id, networking_goals")
        .eq("event_id", eventId)
        .in("user_id", userIds)
    ])

    // Create profiles with their data for AI
    const profilesWithData: ProfileData[] = members.map(member => ({
      id: member.profiles.id,
      first_name: member.profiles.first_name,
      last_name: member.profiles.last_name,
      job_title: member.profiles.job_title,
      company: member.profiles.company,
      what_do_you_do: member.profiles.what_do_you_do,
      location: member.profiles.location,
      mbti: member.profiles.mbti,
      enneagram: member.profiles.enneagram,
      networking_goals: networkingGoals.data?.find(ng => ng.user_id === member.user_id)?.networking_goals || [],
      hobbies: hobbies.data?.filter(h => h.user_id === member.user_id).map(h => h.hobbies.label) || [],
      expertise: expertise.data?.filter(e => e.user_id === member.user_id).map(e => e.expertise_tags.label) || []
    }))

    // Use AI to generate matches, focusing on the new user
    const aiMatches = await this.aiService.generateMatches({
      eventId,
      profiles: profilesWithData,
      existingMatches: existingMatches || []
    })

    // Filter matches to only include the new user
    const newUserMatches = aiMatches.filter(match => 
      match.profile.id === newUserId || 
      profilesWithData.find(p => p.id === newUserId) === match.profile
    )

    if (newUserMatches.length === 0) {
      return
    }

    // Convert AI matches to our format and save
    const matches: MatchingResult["matches"] = []
    const usedPairs = new Set<string>()

    for (const aiMatch of newUserMatches) {
      const personA = profilesWithData.find(p => p.id === newUserId)
      if (!personA) continue

      const personB = aiMatch.profile
      const pairKey = `${personA.id}-${personB.id}`
      const reversePairKey = `${personB.id}-${personA.id}`

      // Skip if already matched or if this pair is already being processed
      if (usedPairs.has(pairKey) || usedPairs.has(reversePairKey)) {
        continue
      }

      matches.push({
        a: personA.id,
        b: personB.id,
        bases: aiMatch.bases,
        summary: aiMatch.summary,
        panels: aiMatch.panels
      })

      usedPairs.add(pairKey)
      usedPairs.add(reversePairKey)
    }

    if (matches.length > 0) {
      await this.saveMatches(eventId, matches)
    }
  }
}
