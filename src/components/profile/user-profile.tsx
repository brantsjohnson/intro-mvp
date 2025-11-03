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

export function UserProfile({ userId }: UserProfileProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPresent, setIsPresent] = useState(false)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [hasConnection, setHasConnection] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null)
  const [currentEvent, setCurrentEvent] = useState<{event_id: string, event_name: string} | null>(null)
  
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
          .select("user_id, first_name, last_name, email, photo_url, career_title, company_name, expertise_summary, mbti_type, enneagram_type")
          .eq("user_id", userId)
          .single()

        if (profileError) {
          toast.error("Profile not found")
          router.push("/home")
          return
        }

        // Map to Profile interface
        const mappedProfile: Profile = {
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
          hobbies: null,
          expertise_tags: null,
          consent: true,
        }

        setProfile(mappedProfile)

        // Load current user's info for comparison
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Check if this is the user's own profile
          setIsOwnProfile(user.id === userId)

          // Check if user is present in current event (from attendance.checked_in_at)
          const eventId = searchParams.get('eventId')
          if (eventId) {
            const { data: attendanceData } = await supabase
              .from("attendance")
              .select("checked_in_at, events:event_id(event_id, event_name)")
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
            }

            // Detect if a connection already exists between current user and target
            // Use a_id and b_id, ensuring a_id < b_id
            const userIdA = user.id < userId ? user.id : userId
            const userIdB = user.id < userId ? userId : user.id
            
            try {
              const { data: existingConnection } = await supabase
                .from("connections")
                .select("connection_id, match_explanation_text")
                .eq("event_id", eventId)
                .eq("a_id", userIdA)
                .eq("b_id", userIdB)
                .maybeSingle()
              
              setHasConnection(Boolean(existingConnection))
              if (existingConnection?.match_explanation_text) {
                setMatchExplanation(existingConnection.match_explanation_text)
              }
            } catch (_) {
              // ignore errors; default is no connection
            }

            // Load match explanation if this is a suggested connection
            const source = searchParams.get('source')
            if (source === 'suggested' && !matchExplanation) {
              try {
                const { data: connectionData } = await supabase
                  .from("connections")
                  .select("match_explanation_text, match_score_breakdown_json")
                  .eq("event_id", eventId)
                  .eq("a_id", userIdA)
                  .eq("b_id", userIdB)
                  .eq("connection_kind", "system_match")
                  .maybeSingle()

                if (connectionData?.match_explanation_text) {
                  setMatchExplanation(connectionData.match_explanation_text)
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
            .select("connection_id")
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
                    {profile.job_title || ""} {profile.company && `| ${profile.company}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card - Only show for own profile */}
          {isOwnProfile && (
            <QRCard onScanClick={handleQRScan} />
          )}

          {/* Match Explanation - Only show for suggested connections */}
          {searchParams.get('source') === 'suggested' && matchExplanation && (
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="pb-1">
                <CardTitle className="text-primary">Why you two should meet</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-foreground leading-relaxed">
                  {matchExplanation}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Expertise Summary */}
          {profile.what_do_you_do && (
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="pb-1">
                <CardTitle className="text-primary">Expertise</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-foreground leading-relaxed">
                  {profile.what_do_you_do}
                </p>
              </CardContent>
            </Card>
          )}

          {/* About */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">About</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {profile.company && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Company</span>
                  <span className="text-foreground">{profile.company}</span>
                </div>
              )}
              {profile.job_title && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Job Title</span>
                  <span className="text-foreground">{profile.job_title}</span>
                </div>
              )}
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