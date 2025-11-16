"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClientComponentClient } from "@/lib/supabase"
import { Profile } from "@/lib/types"
import { toast } from "sonner"
import { ArrowLeft, MessageSquare } from "lucide-react"

interface UserProfileProps {
  userId: string
}

interface MatchBreakdown {
  summary: string
  why_meet: string
  shared_activities: string[]
  dive_deeper: string
  bases?: string[]
  viewer_needs?: string[]
  candidate_strengths?: string[]
  shared_points?: string[]
  pillars?: { name: string; score: number; hit: boolean; evidence: string }[]
  tier?: number
  score?: number
}

interface ProfileDetails extends Profile {
  offer_summary?: string | null
  want_summary?: string | null
  offer_tags?: string[] | null
  want_tags?: string[] | null
  business_need?: string | null
  why_attending?: string | null
  connection_types?: string[] | null
  event_profile_summary?: string | null
  event_offer_tags?: string[] | null
  event_want_tags?: string[] | null
  event_goals_tags?: string[] | null
  event_role_intent?: string | null
  event_availability_status?: string | null
  communication_style?: string | null
  personality_summary?: string | null
  personality_traits?: string[] | null
  bigfive_scores?: Record<string, number> | null
  career_years_experience?: number | null
  linkedin_titles?: string[] | null
  linkedin_companies?: string[] | null
}

const candidateKeys = ["text", "value", "title", "label", "name", "description"] as const

const tryExtractString = (record: Record<string, unknown>): string | null => {
  for (const key of candidateKeys) {
    const candidate = record[key]
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  // Fall back to any string-ish primitive value
  const firstString = Object.values(record).find(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  )

  return firstString ? firstString.trim() : null
}

const normalizeToStringArray = (value: unknown): string[] => {
  if (value == null) return []

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" && item.trim().length > 0) {
          return item.trim()
        }
        if (typeof item === "number") {
          return String(item)
        }
        if (item && typeof item === "object") {
          return tryExtractString(item as Record<string, unknown>)
        }
        return null
      })
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []

    // Try to parse JSON arrays first
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed) || typeof parsed === "object") {
          return normalizeToStringArray(parsed)
        }
      } catch (_) {
        // Ignore parse error and fall through to splitting text
      }
    }

    // Split simple delimited strings (new lines or bullets)
    const candidates = trimmed
      .split(/\r?\n|•|\u2022|\-/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    if (candidates.length > 1) {
      return candidates
    }

    return [trimmed]
  }

  if (typeof value === "number") {
    return [String(value)]
  }

  if (value && typeof value === "object") {
    const extracted = tryExtractString(value as Record<string, unknown>)
    return extracted ? [extracted] : []
  }

  return []
}

const parseMatchBreakdown = (input: unknown): MatchBreakdown | null => {
  if (!input) return null

  let candidate = input

  if (typeof candidate === "string") {
    const trimmed = candidate.trim()
    if (!trimmed) return null
    try {
      candidate = JSON.parse(trimmed)
    } catch (error) {
      console.warn("Failed to parse match breakdown string", error)
      return null
    }
  }

  if (!candidate || typeof candidate !== "object") {
    return null
  }

  const record = candidate as Record<string, unknown>
  const panelRecord =
    record.panel && typeof record.panel === "object"
      ? (record.panel as Record<string, unknown>)
      : record

  const summary = typeof panelRecord.summary === "string" ? panelRecord.summary.trim() : ""
  const whyMeet = typeof panelRecord.why_meet === "string" ? panelRecord.why_meet.trim() : ""
  const diveDeeper = typeof panelRecord.dive_deeper === "string" ? panelRecord.dive_deeper.trim() : ""

  const sharedActivities = normalizeToStringArray(
    panelRecord.shared_activities ?? panelRecord.activities
  )
  const bases = normalizeToStringArray(panelRecord.bases ?? record.bases)
  const viewerNeeds = normalizeToStringArray(panelRecord.viewer_needs)
  const candidateStrengths = normalizeToStringArray(panelRecord.candidate_strengths)
  const sharedPoints = normalizeToStringArray(panelRecord.shared_points)

  const pillarsRaw = Array.isArray(panelRecord.pillars)
    ? panelRecord.pillars
    : Array.isArray(record.pillars)
      ? record.pillars
      : []
  const pillars = pillarsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const pillar = item as Record<string, unknown>
      const name = typeof pillar.name === "string" ? pillar.name : ""
      if (!name) return null
      const scoreValue = pillar.score
      const score = typeof scoreValue === "number" ? scoreValue : Number(scoreValue ?? 0)
      const hitValue = pillar.hit
      const hit = typeof hitValue === "boolean" ? hitValue : score >= 0.5
      const evidence = typeof pillar.evidence === "string" ? pillar.evidence : ""
      return { name, score, hit, evidence }
    })
    .filter((item): item is { name: string; score: number; hit: boolean; evidence: string } => Boolean(item))

  const tier = typeof record.tier === "number" ? record.tier : undefined
  const score = typeof record.score === "number" ? record.score : undefined

  return {
    summary,
    why_meet: whyMeet,
    shared_activities: sharedActivities,
    dive_deeper: diveDeeper,
    bases: bases.length > 0 ? bases : undefined,
    viewer_needs: viewerNeeds.length > 0 ? viewerNeeds : undefined,
    candidate_strengths: candidateStrengths.length > 0 ? candidateStrengths : undefined,
    shared_points: sharedPoints.length > 0 ? sharedPoints : undefined,
    pillars: pillars.length > 0 ? pillars : undefined,
    tier,
    score
  }
}

const renderTagList = (items: string[] | null | undefined) => {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-full bg-muted/60 px-3 py-1 text-sm text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

export function UserProfile({ userId }: UserProfileProps) {
  const [profile, setProfile] = useState<ProfileDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPresent, setIsPresent] = useState(false)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [hasConnection, setHasConnection] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null)
  const [currentEvent, setCurrentEvent] = useState<{event_id: string, event_name: string} | null>(null)
  const [matchBreakdown, setMatchBreakdown] = useState<MatchBreakdown | null>(null)
  const candidateStrengths = (matchBreakdown?.candidate_strengths ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const viewerNeeds = (matchBreakdown?.viewer_needs ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const offerTags = Array.from(
    new Set(
      [...(profile?.offer_tags ?? []), ...(profile?.event_offer_tags ?? [])]
        .map((tag) => tag?.trim?.())
        .filter((tag): tag is string => Boolean(tag && tag.length > 0))
    )
  )
  const wantTags = Array.from(
    new Set(
      [...(profile?.want_tags ?? []), ...(profile?.event_want_tags ?? [])]
        .map((tag) => tag?.trim?.())
        .filter((tag): tag is string => Boolean(tag && tag.length > 0))
    )
  )
  const hasWhatLookingForContent = Boolean(
    viewerNeeds.length > 0 ||
      (profile?.want_summary?.trim()?.length ?? 0) > 0 ||
      wantTags.length > 0
  )
  const expertiseList = Array.from(
    new Set(
      (profile?.expertise_tags ?? [])
        .map((tag) => tag?.trim?.())
        .filter((tag): tag is string => Boolean(tag && tag.length > 0))
    )
  )
  const toSentence = (items: string[]): string => {
    if (items.length === 0) return ""
    if (items.length === 1) return items[0]
    const head = items.slice(0, -1).join(", ")
    const tail = items[items.length - 1]
    return `${head}${items.length > 2 ? "," : ""} and ${tail}`
  }
  const tierLabels: Record<number, string> = {
    1: "Full match across pillars",
    2: "Business fit plus strong soft match",
    3: "Business fit",
    4: "Shared interests + personality",
    5: "Shared interests",
    6: "Personality alignment"
  }
  const formatPillarScore = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : ""

  const matchSummaryText =
    (matchBreakdown?.summary && matchBreakdown.summary.trim()) ||
    (matchExplanation && matchExplanation.trim()) ||
    null
  const whyMeetText = matchBreakdown?.why_meet?.trim()
  const offerSummaryText = profile?.offer_summary?.trim()
  const helpParagraphParts: string[] = []

  if (whyMeetText) {
    helpParagraphParts.push(whyMeetText)
  }

  if (offerSummaryText) {
    helpParagraphParts.push(offerSummaryText)
  } else if (candidateStrengths.length > 0) {
    helpParagraphParts.push(
      `Key ways ${profile?.first_name ?? "they"} can help include ${toSentence(candidateStrengths)}.`
    )
  } else if (offerTags.length > 0) {
    helpParagraphParts.push(
      `${profile?.first_name ?? "They"} focuses on ${toSentence(offerTags)}.`
    )
  }

  const matchParagraphText =
    helpParagraphParts.length > 0 ? helpParagraphParts.join(" ") : null
  const shouldShowMatchCard = Boolean(matchSummaryText || matchParagraphText)
  const tierValue = matchBreakdown?.tier
  const tierLabel = tierValue ? tierLabels[tierValue] ?? `Tier ${tierValue}` : null
  const matchScoreValue =
    typeof matchBreakdown?.score === "number" && Number.isFinite(matchBreakdown.score)
      ? matchBreakdown.score
      : null
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient() as any
  const hasGeneratedRef = useRef(false)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Load the profile from users table
        const { data: profileData, error: profileError } = await supabase
          .from("users")
          .select(
            `user_id,
            first_name,
            last_name,
            email,
            photo_url,
            career_title,
            company_name,
            expertise_summary,
            mbti_type,
            enneagram_type,
            career_years_experience,
            hobbies,
            offer_summary_text,
            want_summary_text,
            offer_tags,
            want_tags,
            engagement_availability_status,
            collaboration_role_intent,
            communication_style,
            personality_json,
            bigfive_scores,
            linkedin_titles,
            linkedin_companies
          `)
          .eq("user_id", userId)
          .single()

        if (profileError) {
          toast.error("Profile not found")
          router.push("/home")
          return
        }

        // Map to Profile interface
        const personality = (profileData.personality_json as Record<string, unknown> | null) || null
        const personalitySummary = personality && typeof personality.summary === "string" ? personality.summary : null
        const personalityTraits = Array.isArray(personality?.key_traits)
          ? (personality?.key_traits as string[])
          : null

        const mappedProfile: ProfileDetails = {
          id: profileData.user_id,
          first_name: profileData.first_name || "",
          last_name: profileData.last_name || "",
          email: profileData.email || "",
          avatar_url: profileData.photo_url || null,
          job_title: profileData.career_title || null,
          company: profileData.company_name || null,
          what_do_you_do: profileData.expertise_summary || null,
          location: null,
          linkedin_url: null,
          mbti: profileData.mbti_type || null,
          enneagram: profileData.enneagram_type || null,
          networking_goals: null,
          hobbies: (profileData.hobbies as string[] | null) || null,
          expertise_tags: null,
          consent: true,
          offer_summary: profileData.offer_summary_text || null,
          want_summary: profileData.want_summary_text || null,
          offer_tags: (profileData.offer_tags as string[] | null) || null,
          want_tags: (profileData.want_tags as string[] | null) || null,
          event_profile_summary: null,
          event_offer_tags: null,
          event_want_tags: null,
          event_goals_tags: null,
          business_need: null,
          why_attending: null,
          connection_types: null,
          event_role_intent: profileData.collaboration_role_intent || null,
          event_availability_status: profileData.engagement_availability_status || null,
          communication_style: profileData.communication_style || null,
          personality_summary: personalitySummary,
          personality_traits: personalityTraits,
          bigfive_scores: (profileData.bigfive_scores as Record<string, number> | null) || null,
          career_years_experience: profileData.career_years_experience || null,
          linkedin_titles: (profileData.linkedin_titles as string[] | null) || null,
          linkedin_companies: (profileData.linkedin_companies as string[] | null) || null,
        }

        setProfile(mappedProfile)

        // Load current user's info for comparison
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Check if this is the user's own profile
          setIsOwnProfile(user.id === userId)

          let eventId = searchParams.get('eventId') || undefined
          const source = searchParams.get('source')

          // Ensure a_id < b_id for consistent lookup
          const userIdA = user.id < userId ? user.id : userId
          const userIdB = user.id < userId ? userId : user.id

          // If this is a suggested match (or we lack eventId), pull the latest system match for details
          if (source === 'suggested' || !eventId) {
            try {
              const { data: suggestedConnections, error: suggestedError } = await supabase
                .from("connections")
                .select("event_id, match_explanation_text, match_score_breakdown_json")
                .eq("connection_kind", "system_match")
                .eq("a_id", userIdA)
                .eq("b_id", userIdB)
                .order("created_at", { ascending: false })
                .limit(1)

              if (!suggestedError && suggestedConnections && suggestedConnections.length > 0) {
                const suggested = suggestedConnections[0]
                if (!eventId && suggested.event_id) {
                  eventId = suggested.event_id
                }

                if (source === 'suggested') {
                  if (suggested.match_explanation_text) {
                    setMatchExplanation(suggested.match_explanation_text)
                  }
                  if (suggested.match_score_breakdown_json) {
                    const breakdown = parseMatchBreakdown(suggested.match_score_breakdown_json)
                    if (breakdown) {
                      setMatchBreakdown(breakdown)
                      if (breakdown.summary) {
                        setMatchExplanation(breakdown.summary)
                      }
                    } else {
                      setMatchBreakdown(null)
                    }
                  } else {
                    setMatchBreakdown(null)
                  }
                }
              }
            } catch (error) {
              console.error('Error loading suggested match details:', error)
            }
          }

          if (eventId) {
            // Check if user is present in current event (from attendance.checked_in_at)
            const { data: attendanceData } = await supabase
              .from("attendance")
              .select(
                `checked_in_at,
                why_attending_text,
                business_need_text,
                connection_types_selected,
                event_profile_summary_text,
                event_offer_tags,
                event_want_tags,
                event_goals_tags,
                event_role_intent,
                event_availability_status,
                events:event_id(event_id, event_name)
              `)
              .eq("user_id", userId)
              .eq("event_id", eventId)
              .maybeSingle()

            if (attendanceData) {
              setIsPresent(!!attendanceData.checked_in_at)
              if (attendanceData.events) {
                setCurrentEvent({
                  event_id: attendanceData.events.event_id,
                  event_name: attendanceData.events.event_name
                })
              }

              setProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      why_attending: attendanceData.why_attending_text || prev.why_attending || null,
                      business_need: attendanceData.business_need_text || prev.business_need || null,
                      connection_types: (attendanceData.connection_types_selected as string[] | null) || prev.connection_types || null,
                      event_profile_summary: attendanceData.event_profile_summary_text || prev.event_profile_summary || null,
                      event_offer_tags: (attendanceData.event_offer_tags as string[] | null) || prev.event_offer_tags || null,
                      event_want_tags: (attendanceData.event_want_tags as string[] | null) || prev.event_want_tags || null,
                      event_goals_tags: (attendanceData.event_goals_tags as string[] | null) || prev.event_goals_tags || null,
                      event_role_intent: attendanceData.event_role_intent || prev.event_role_intent || null,
                      event_availability_status: attendanceData.event_availability_status || prev.event_availability_status || null,
                    }
                  : prev
              )
            }

            try {
              const { data: existingConnection } = await supabase
                .from("connections")
                .select("match_explanation_text")
                .eq("event_id", eventId)
                .eq("a_id", userIdA)
                .eq("b_id", userIdB)
                .maybeSingle()
              
              setHasConnection(Boolean(existingConnection))
              if (existingConnection?.match_explanation_text && !matchExplanation) {
                setMatchExplanation(existingConnection.match_explanation_text)
              }
            } catch (_) {
              // ignore errors; default is no connection
            }
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error)
        toast.error("Failed to load profile")
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [userId, router, supabase, searchParams])

  const handleMessage = () => {
    // Get current event ID from URL parameters
    const eventId = searchParams.get('eventId')
    if (!eventId) {
      toast.error("Event ID is required to send messages")
      return
    }
    router.push(`/messages/conversation?eventId=${eventId}&userId=${userId}`)
  }

  const handleBack = () => {
    const source = searchParams.get('source')
    const shouldPrompt =
      (source === 'suggested' && !hasConnection) ||
      source === 'request' ||
      source === 'qr'

    if (shouldPrompt) {
      setShowFeedbackModal(true)
      return
    }

    router.back()
  }

  const recordNoClick = async () => {
    try {
      const eventId = searchParams.get('eventId')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !eventId) return
      // Optional analytics - ignore if table doesn't exist
      // This was in the old schema, keeping for now but it may not exist
    } catch (_) {
      // swallow analytics errors
    }
  }

  const createConnectionAndTally = async () => {
    try {
      const eventId = searchParams.get('eventId')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !eventId) return

      // Ensure a_id < b_id for consistent lookup
      const aId = user.id < userId ? user.id : userId
      const bId = user.id < userId ? userId : user.id

      // Create connection if it doesn't exist
      const { error: insertError } = await supabase
        .from('connections')
        .insert({ 
          event_id: eventId, 
          a_id: aId, 
          b_id: bId, 
          connection_kind: 'user_added',
          user_add_method: 'manual_add',
          created_by_user_id: user.id
        })
      
      if (insertError && !insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
        throw insertError
      }

      setHasConnection(true)
      toast.success('Connection recorded')
    } catch (error) {
      console.error('Error creating connection:', error)
      toast.error('Failed to record connection')
    }
  }

  const handleQRScan = () => {
    setIsQRScannerOpen(true)
  }

  const handleConnectionCreated = () => {
    // Refresh the profile or show success message
    toast.success("Connection created successfully!")
    // Refresh connection status
    const eventId = searchParams.get('eventId')
    if (eventId) {
      const loadConnection = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const userIdA = user.id < userId ? user.id : userId
          const userIdB = user.id < userId ? userId : user.id
          const { data: existingConnection } = await supabase
            .from("connections")
            .select("match_explanation_text")
            .eq("event_id", eventId)
            .eq("a_id", userIdA)
            .eq("b_id", userIdB)
            .maybeSingle()
          setHasConnection(Boolean(existingConnection))
        }
      }
      loadConnection()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Profile not found</p>
          <GradientButton onClick={() => router.push("/home")}>
            Go Home
          </GradientButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/background.jpg')" }}>
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={handleBack}
              variant="filled"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {profile.first_name} {profile.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {currentEvent?.event_name || 'Event'}
              </p>
            </div>

            <GradientButton
              onClick={handleMessage}
              variant="filled"
              size="icon"
            >
              <MessageSquare className="h-4 w-4" />
            </GradientButton>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Header */}
          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <PresenceAvatar
                  src={profile.avatar_url || undefined}
                  fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                  isPresent={isPresent}
                  size="lg"
                />
                <div className="flex-1 space-y-1">
                  <h2 className="text-2xl font-semibold text-foreground leading-tight">
                    {profile.first_name} {profile.last_name}
                  </h2>
                  {(profile.company || profile.job_title || profile.career_years_experience != null) && (
                    <p className="text-muted-foreground">
                      {[
                        profile.company,
                        profile.job_title,
                        profile.career_years_experience != null ? `${profile.career_years_experience}+ yrs experience` : null,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-accent">Areas of Expertise:</span>{" "}
                    {expertiseList.length > 0
                      ? expertiseList.join(", ")
                      : profile.what_do_you_do?.trim() || "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card - Only show for own profile */}
          {isOwnProfile && (
            <QRCard onScanClick={handleQRScan} />
          )}

          {/* Match Explanation */}
          {shouldShowMatchCard && (
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="pb-1">
                <CardTitle className="text-primary">Why you two should meet</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {matchSummaryText && (
                  <p className="text-foreground leading-relaxed font-medium">
                    {matchSummaryText}
                  </p>
                )}
                {matchParagraphText && (
                  <p className="text-muted-foreground leading-relaxed">
                    {matchParagraphText}
                  </p>
                )}
                {(tierLabel || (matchBreakdown?.pillars && matchBreakdown.pillars.length > 0)) && (
                  <div className="space-y-2 border-t border-border pt-3">
                    {tierLabel && (
                      <p className="text-sm font-semibold text-primary">
                        {tierLabel}
                        {matchScoreValue != null ? ` · Score ${matchScoreValue.toFixed(2)}` : ""}
                      </p>
                    )}
                    {matchBreakdown?.pillars && matchBreakdown.pillars.length > 0 && (
                      <div className="space-y-2">
                        {matchBreakdown.pillars.map((pillar) => (
                          <div
                            key={pillar.name}
                            className="flex items-start justify-between gap-4 rounded-md bg-muted/40 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {pillar.name}
                                {pillar.score != null && (
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                                    ({formatPillarScore(pillar.score)})
                                  </span>
                                )}
                              </p>
                              {pillar.evidence && (
                                <p className="text-xs text-muted-foreground">{pillar.evidence}</p>
                              )}
                            </div>
                            <span
                              className={`text-sm font-semibold ${
                                pillar.hit ? "text-emerald-500" : "text-muted-foreground"
                              }`}
                            >
                              {pillar.hit ? "✓" : formatPillarScore(pillar.score)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {profile.hobbies && profile.hobbies.length > 0 && (
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="pb-1">
                <CardTitle className="text-primary">Interests</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {renderTagList(profile.hobbies)}
              </CardContent>
            </Card>
          )}

          {searchParams.get('source') === 'suggested' && viewerNeeds.length > 0 && (
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="pb-1">
                <CardTitle className="text-primary">What you asked for</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="list-disc list-inside space-y-2 text-foreground">
                  {viewerNeeds.map((need, index) => (
                    <li key={`need-${index}`}>{need}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* What they're looking for */}
          {hasWhatLookingForContent && (
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="pb-1">
                <CardTitle className="text-primary">What {profile.first_name} is looking for</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {profile.want_summary?.trim() && (
                  <p className="text-foreground leading-relaxed">{profile.want_summary}</p>
                )}
                {renderTagList(wantTags)}
                {viewerNeeds.length > 0 && (
                  <ul className="list-disc list-inside space-y-2 text-foreground">
                    {viewerNeeds.map((need, index) => (
                      <li key={`need-expanded-${index}`}>{need}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {(profile.linkedin_titles && profile.linkedin_titles.length > 0) ||
            (profile.linkedin_companies && profile.linkedin_companies.length > 0) ? (
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-1">
                  <CardTitle className="text-primary">Professional history</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {profile.linkedin_titles && profile.linkedin_titles.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">Past roles</p>
                      {renderTagList(profile.linkedin_titles.slice(0, 6))}
                    </div>
                  )}
                  {profile.linkedin_companies && profile.linkedin_companies.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">Companies they've worked with</p>
                      {renderTagList(profile.linkedin_companies.slice(0, 6))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
        </div>
      </main>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onConnectionCreated={handleConnectionCreated}
      />

      {/* Suggested connection feedback modal */}
      <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">Have you met them yet?</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center space-x-2 mt-2">
            <GradientButton
              variant="outline"
              onClick={async () => {
                await recordNoClick()
                setShowFeedbackModal(false)
                router.back()
              }}
              size="sm"
            >
              No
            </GradientButton>
            <GradientButton
              onClick={async () => {
                await createConnectionAndTally()
                setShowFeedbackModal(false)
                router.back()
              }}
              size="sm"
            >
              Yes
            </GradientButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}