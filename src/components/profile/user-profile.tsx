"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { AccordionSection } from "@/components/ui/accordion-section"
import { HobbiesGrid } from "@/components/ui/hobbies-grid"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { Profile, Hobby } from "@/lib/types"
import { AIService, ProfileData } from "@/lib/ai-service"
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
  
  const router = useRouter()
  const supabase = createClientComponentClient()
  const aiService = new AIService()

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

        // Load user's hobbies
        const { data: userHobbiesData } = await supabase
          .from("profile_hobbies")
          .select("hobby_id")
          .eq("user_id", userId)

        if (userHobbiesData) {
          setUserHobbies(userHobbiesData.map(h => h.hobby_id))
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
            setCurrentUserHobbies(currentUserHobbiesData.map(h => h.hobby_id))
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

  // Generate AI insights when profile and current user data are loaded
  useEffect(() => {
    const generateInsights = async () => {
      if (!profile || isGeneratingInsights) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id === userId) return // Don't generate insights for self

      setIsGeneratingInsights(true)
      try {
        // Get current user's profile data
        const { data: currentUserProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (!currentUserProfile) return

        // Get current user's hobbies
        const { data: currentUserHobbiesData } = await supabase
          .from("profile_hobbies")
          .select(`
            hobbies!inner (label)
          `)
          .eq("user_id", user.id)

        // Get current user's expertise
        const { data: currentUserExpertise } = await supabase
          .from("profile_expertise")
          .select(`
            expertise_tags!inner (label)
          `)
          .eq("user_id", user.id)

        // Get current user's networking goals for current event
        const { data: currentUserNetworkingGoals } = await supabase
          .from("event_networking_goals")
          .select("networking_goals")
          .eq("user_id", user.id)
          .limit(1)
          .single()

        // Get target user's hobbies
        const { data: targetUserHobbiesData } = await supabase
          .from("profile_hobbies")
          .select(`
            hobbies!inner (label)
          `)
          .eq("user_id", userId)

        // Get target user's expertise
        const { data: targetUserExpertise } = await supabase
          .from("profile_expertise")
          .select(`
            expertise_tags!inner (label)
          `)
          .eq("user_id", userId)

        // Get target user's networking goals for current event
        const { data: targetUserNetworkingGoals } = await supabase
          .from("event_networking_goals")
          .select("networking_goals")
          .eq("user_id", userId)
          .limit(1)
          .single()

        // Create profile data for AI
        const currentUserData: ProfileData = {
          id: currentUserProfile.id,
          first_name: currentUserProfile.first_name,
          last_name: currentUserProfile.last_name,
          job_title: currentUserProfile.job_title,
          company: currentUserProfile.company,
          what_do_you_do: currentUserProfile.what_do_you_do,
          location: currentUserProfile.location,
          mbti: currentUserProfile.mbti,
          enneagram: currentUserProfile.enneagram,
          networking_goals: currentUserNetworkingGoals?.networking_goals || [],
          hobbies: currentUserHobbiesData?.map(h => h.hobbies.label) || [],
          expertise: currentUserExpertise?.map(e => e.expertise_tags.label) || []
        }

        const targetUserData: ProfileData = {
          id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          job_title: profile.job_title,
          company: profile.company,
          what_do_you_do: profile.what_do_you_do,
          location: profile.location,
          mbti: profile.mbti,
          enneagram: profile.enneagram,
          networking_goals: targetUserNetworkingGoals?.networking_goals || [],
          hobbies: targetUserHobbiesData?.map(h => h.hobbies.label) || [],
          expertise: targetUserExpertise?.map(e => e.expertise_tags.label) || []
        }

        // Generate AI insights
        const insights = await aiService.generateProfileInsights(currentUserData, targetUserData)
        setAiInsights(insights)
      } catch (error) {
        console.error("Error generating AI insights:", error)
        // Don't show error to user, just use fallback content
      } finally {
        setIsGeneratingInsights(false)
      }
    }

    generateInsights()
  }, [profile, userId, supabase, aiService, isGeneratingInsights])

  const handleMessage = () => {
    // Get current event ID from URL or context
    const currentEventId = "current-event-id" // TODO: Get from context or URL
    router.push(`/messages/conversation?eventId=${currentEventId}&userId=${userId}`)
  }

  const handleBack = () => {
    // TODO: Implement back button guard for suggested matches
    router.back()
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={handleBack}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {profile.first_name} {profile.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Connected at: Marketing Conference
              </p>
            </div>

            <GradientButton
              onClick={handleMessage}
              variant="outline"
              size="icon"
            >
              <MessageSquare className="h-4 w-4" />
            </GradientButton>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
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
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                      Matches: Interests, Personality
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card - Only show for own profile */}
          {isOwnProfile && (
            <QRCard onScanClick={handleQRScan} />
          )}

          {/* Accordions */}
          <div className="space-y-4">
            <AccordionSection
              title="Why You Two Should Meet"
              defaultOpen={true}
            >
              {isGeneratingInsights ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground">Generating insights...</p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {aiInsights?.why || "Based on your shared interests and complementary backgrounds, you both would benefit from discussing career growth strategies and networking opportunities."}
                </p>
              )}
            </AccordionSection>

            <AccordionSection
              title="Activities You Might Enjoy"
              defaultOpen={true}
            >
              {isGeneratingInsights ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground">Generating insights...</p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {aiInsights?.activities || "Consider attending the networking mixer together, or grab coffee during the morning break to discuss your shared interests."}
                </p>
              )}
            </AccordionSection>

            <AccordionSection
              title="Where To Dive Deeper"
              defaultOpen={false}
            >
              {isGeneratingInsights ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground">Generating insights...</p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {aiInsights?.deeper || "What drives you most in your current role? This open-ended question can lead to meaningful conversations about career aspirations and values."}
                </p>
              )}
            </AccordionSection>
          </div>

          {/* Hobbies */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-lg">Hobbies</CardTitle>
            </CardHeader>
            <CardContent>
              <HobbiesGrid
                hobbies={hobbies}
                selectedHobbies={userHobbies}
                onHobbyChange={() => {}} // Read-only for other users
                mode="display"
                mutualHobbies={mutualHobbies.map(h => h.id)}
                theirUniqueHobbies={theirUniqueHobbies.map(h => h.id)}
              />
            </CardContent>
          </Card>

          {/* About */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-lg">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Company</span>
                <span className="text-foreground">{profile.company}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Job Title</span>
                <span className="text-foreground">{profile.job_title}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Location</span>
                <span className="text-foreground">Utah</span>
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
    </div>
  )
}
