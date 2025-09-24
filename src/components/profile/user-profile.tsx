"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { AccordionSection } from "@/components/ui/accordion-section"
import { HobbiesGrid } from "@/components/ui/hobbies-grid"
import { ExpertiseGrid } from "@/components/ui/expertise-grid"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { createClientComponentClient } from "@/lib/supabase"
import { Profile, Hobby } from "@/lib/types"
// AI removed for now
import { toast } from "sonner"
import { ArrowLeft, MessageSquare } from "lucide-react"

interface UserProfileProps {
  userId: string
}

export function UserProfile({ userId }: UserProfileProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [hobbies, setHobbies] = useState<Hobby[]>([])
  const [userHobbies, setUserHobbies] = useState<number[]>([])
  const [currentUserHobbies, setCurrentUserHobbies] = useState<number[]>([])
  const [expertise, setExpertise] = useState<{id: number, label: string}[]>([])
  const [userExpertise, setUserExpertise] = useState<number[]>([])
  const [currentUserExpertise, setCurrentUserExpertise] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPresent, setIsPresent] = useState(false)
  const [aiInsights, setAiInsights] = useState<{
    why: string
    activities: string
    deeper: string
  } | null>(null)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [hasConnection, setHasConnection] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [matchBases, setMatchBases] = useState<string[]>([])
  const [matchPanels, setMatchPanels] = useState<{
    why_meet: string
    shared_activities: string[]
    dive_deeper: string
  } | null>(null)
  const [currentEvent, setCurrentEvent] = useState<{id: string, name: string} | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient() as any
  const hasGeneratedRef = useRef(false)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Load the profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single()

        if (profileError) {
          toast.error("Profile not found")
          router.push("/home")
          return
        }

        setProfile(profileData)

        // Load hobbies
        const { data: hobbiesData } = await supabase
          .from("hobbies")
          .select("*")
          .order("label")

        if (hobbiesData) {
          setHobbies(hobbiesData)
        }

        // Load expertise
        const { data: expertiseData } = await supabase
          .from("expertise_tags")
          .select("*")
          .order("label")

        if (expertiseData) {
          setExpertise(expertiseData)
        }

        // Load user's hobbies
        const { data: userHobbiesData } = await supabase
          .from("profile_hobbies")
          .select("hobby_id")
          .eq("user_id", userId)

        if (userHobbiesData) {
          setUserHobbies((userHobbiesData as Array<{ hobby_id: number }>).map(h => h.hobby_id))
        }

        // Load user's expertise
        const { data: userExpertiseData } = await supabase
          .from("profile_expertise")
          .select("tag_id")
          .eq("user_id", userId)

        if (userExpertiseData) {
          setUserExpertise((userExpertiseData as Array<{ tag_id: number }>).map(e => e.tag_id))
        }

        // Load current user's hobbies for comparison
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Check if this is the user's own profile
          setIsOwnProfile(user.id === userId)

          const { data: currentUserHobbiesData } = await supabase
            .from("profile_hobbies")
            .select("hobby_id")
            .eq("user_id", user.id)

          if (currentUserHobbiesData) {
            setCurrentUserHobbies((currentUserHobbiesData as Array<{ hobby_id: number }>).map(h => h.hobby_id))
          }

          const { data: currentUserExpertiseData } = await supabase
            .from("profile_expertise")
            .select("tag_id")
            .eq("user_id", user.id)

          if (currentUserExpertiseData) {
            setCurrentUserExpertise((currentUserExpertiseData as Array<{ tag_id: number }>).map(e => e.tag_id))
          }

          // Check if user is present in current event
          const { data: eventMember } = await supabase
            .from("event_members")
            .select("is_present")
            .eq("user_id", userId)
            .limit(1)
            .single()

          if (eventMember) {
            setIsPresent(eventMember.is_present)
          }

          // Detect if a connection already exists between current user and target
          try {
            const { data: existingConnection } = await supabase
              .from("connections")
              .select("id")
              .or(`and(a.eq.${user.id},b.eq.${userId}),and(a.eq.${userId},b.eq.${user.id})`)
              .limit(1)
              .maybeSingle()
            setHasConnection(Boolean(existingConnection))
          } catch (_) {
            // ignore errors; default is no connection
          }

          // Load current event data
          const eventId = searchParams.get('eventId')
          if (eventId) {
            try {
              const { data: eventData } = await supabase
                .from("events")
                .select("id, name")
                .eq("id", eventId)
                .single()
              
              if (eventData) {
                setCurrentEvent(eventData)
              }
            } catch (error) {
              console.warn('Failed to load event data:', error)
            }
          }

          // Load match data if this is a suggested connection
          const source = searchParams.get('source')
          if (source === 'suggested') {
            if (eventId) {
              try {
                // Load match where current user is A and target is B
                const { data: matchA } = await supabase
                  .from("matches")
                  .select("bases, panels")
                  .eq("event_id", eventId)
                  .eq("a", user.id)
                  .eq("b", userId)
                  .limit(1)
                  .maybeSingle()

                // Load match where current user is B and target is A
                const { data: matchB } = await supabase
                  .from("matches")
                  .select("bases, panels")
                  .eq("event_id", eventId)
                  .eq("a", userId)
                  .eq("b", user.id)
                  .limit(1)
                  .maybeSingle()

                const match = matchA || matchB
                if (match) {
                  if (match.bases) {
                    setMatchBases(match.bases)
                  }
                  if (match.panels) {
                    setMatchPanels(match.panels as {
                      why_meet: string
                      shared_activities: string[]
                      dive_deeper: string
                    })
                  }
                }
              } catch (error) {
                console.error("Error loading match data:", error)
              }
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
  }, [userId, router, supabase])

  // Insights disabled
  useEffect(() => {
    const noop = () => {
      if (!profile || hasGeneratedRef.current || isGeneratingInsights || aiInsights) return
      hasGeneratedRef.current = true
    }
    noop()
  }, [profile, userId, aiInsights])

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
    const fromSuggested = source === 'suggested'
    if (fromSuggested && !hasConnection) {
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
      // Optional table; ignore if missing
      await supabase
        .from('connection_feedback')
        .upsert({
          event_id: eventId,
          viewer_id: user.id,
          target_id: userId,
          no_count: 1
        }, { onConflict: 'event_id,viewer_id,target_id' })
        .select()
      await supabase.rpc('increment_feedback_no', {
        p_event_id: eventId,
        p_viewer_id: user.id,
        p_target_id: userId
      }).catch(() => {})
    } catch (_) {
      // swallow analytics errors
    }
  }

  const createConnectionAndTally = async () => {
    try {
      const eventId = searchParams.get('eventId')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !eventId) return

      // Create connection if it doesn't exist
      const { error: insertError } = await supabase
        .from('connections')
        .insert({ event_id: eventId, a: user.id, b: userId, source: 'match' })
      if (insertError && !insertError.message.includes('duplicate')) {
        throw insertError
      }

      // Increment per-user event stats for current user only
      try {
        await supabase
          .from('user_event_stats')
          .upsert({ event_id: eventId, user_id: user.id, match_connections: 1 }, { onConflict: 'event_id,user_id' })
        await supabase.rpc('increment_match_connections', { p_event_id: eventId, p_user_id: user.id }).catch(() => {})
      } catch (error) {
        console.warn('Failed to update user stats:', error)
        // Don't fail the connection creation if stats update fails
      }

      // Optional: mark feedback yes timestamp
      await supabase
        .from('connection_feedback')
        .upsert({ event_id: eventId, viewer_id: user.id, target_id: userId, yes_at: new Date().toISOString() }, { onConflict: 'event_id,viewer_id,target_id' })
        .select()
        .catch(() => {})

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
  }

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Profile not found</p>
          <GradientButton onClick={() => router.push("/home")}>
            Go Home
          </GradientButton>
        </div>
      </div>
    )
  }

  const mutualHobbies = hobbies.filter(hobby => 
    userHobbies.includes(hobby.id) && currentUserHobbies.includes(hobby.id)
  )

  const theirUniqueHobbies = hobbies.filter(hobby => 
    userHobbies.includes(hobby.id) && !currentUserHobbies.includes(hobby.id)
  )

  const mutualExpertise = expertise.filter(expertise => 
    userExpertise.includes(expertise.id) && currentUserExpertise.includes(expertise.id)
  )

  const theirUniqueExpertise = expertise.filter(expertise => 
    userExpertise.includes(expertise.id) && !currentUserExpertise.includes(expertise.id)
  )

  return (
    <div className="min-h-screen gradient-bg">
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
                Connected at: {currentEvent?.name || 'Event'}
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
              <div className="flex items-center space-x-4">
                <PresenceAvatar
                  src={profile.avatar_url || undefined}
                  fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                  isPresent={isPresent}
                  size="lg"
                />
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {profile.first_name} {profile.last_name}
                  </h2>
                  <p className="text-muted-foreground">
                    {profile.job_title} | {profile.company}
                  </p>
                  {/* Match basis pill - only show for suggested connections */}
                  {searchParams.get('source') === 'suggested' && matchBases.length > 0 && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-400 border-orange-500/30">
                        Matches: {matchBases.map(basis => 
                          basis.charAt(0).toUpperCase() + basis.slice(1)
                        ).join(' / ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card - Only show for own profile */}
          {isOwnProfile && (
            <QRCard onScanClick={handleQRScan} />
          )}

          {/* Match Insights - Only show for suggested connections */}
          {searchParams.get('source') === 'suggested' && (
            <div className="space-y-4">
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-1">
                  <CardTitle className="text-primary">Why you two should meet</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-foreground leading-relaxed">
                    {matchPanels?.why_meet || "Loading match insights..."}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-1">
                  <CardTitle className="text-primary">Activities you might enjoy</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {matchPanels?.shared_activities?.map((activity, index) => (
                      <p key={index} className="text-foreground leading-relaxed">
                        {activity}
                      </p>
                    )) || <p className="text-foreground">Loading activities...</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-1">
                  <CardTitle className="text-primary">Where to dive deeper</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-foreground leading-relaxed">
                    {matchPanels?.dive_deeper || "Loading conversation starter..."}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Hobbies */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">Hobbies</CardTitle>
              <p className="text-sm text-muted-foreground">
                {profile.first_name} has all listed but checked are mutual.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <HobbiesGrid
                hobbies={hobbies}
                selectedHobbies={userHobbies}
                onHobbyChange={() => {}} // Read-only for other users
                mode="display"
                mutualHobbies={mutualHobbies.map(h => h.id)}
                theirUniqueHobbies={theirUniqueHobbies.map(h => h.id)}
                showOnlySelected={true}
              />
            </CardContent>
          </Card>

          {/* Expertise */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">Expertise</CardTitle>
              <p className="text-sm text-muted-foreground">
                {profile.first_name} has all listed but checked are mutual.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <ExpertiseGrid
                expertise={expertise}
                selectedExpertise={userExpertise}
                onExpertiseChange={() => {}} // Read-only for other users
                mode="display"
                mutualExpertise={mutualExpertise.map(e => e.id)}
                theirUniqueExpertise={theirUniqueExpertise.map(e => e.id)}
                showOnlySelected={true}
              />
            </CardContent>
          </Card>

          {/* About */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">About</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Company</span>
                <span className="text-foreground">{profile.company}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Job Title</span>
                <span className="text-foreground">{profile.job_title}</span>
              </div>
              {profile.enneagram && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Enneagram type</span>
                  <span className="text-foreground">{profile.enneagram}</span>
                </div>
              )}
              {profile.mbti && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Myers-Briggs type</span>
                  <span className="text-foreground">{profile.mbti}</span>
                </div>
              )}
            </CardContent>
          </Card>
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
