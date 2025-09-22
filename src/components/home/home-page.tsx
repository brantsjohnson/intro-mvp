"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { MatchCard } from "@/components/ui/match-card"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { User, Profile, Event } from "@/lib/types"
import { toast } from "sonner"
import { 
  Users, 
  MessageSquare, 
  MapPin,
  Calendar,
  Plus
} from "lucide-react"

interface MatchWithProfile {
  id: string
  summary: string
  bases: string[]
  panels: Record<string, unknown>
  profile: Profile
  is_present: boolean
}

export function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [matches, setMatches] = useState<MatchWithProfile[]>([])
  const [isPresent, setIsPresent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
      }
    }
    
    // Initial check
    getUser()
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.id)
      if (session?.user) {
        setUser(session.user)
      } else if (event === 'SIGNED_OUT') {
        router.push("/auth")
      }
    })
    
    return () => subscription.unsubscribe()
  }, [router, supabase.auth])

  useEffect(() => {
    if (user) {
      loadUserData()
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh data when page comes into focus (e.g., after returning from event join)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        loadUserData()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadUserData = async () => {
    if (!user) return
    
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        toast.error("Failed to load profile")
        return
      }

      setProfile(profileData)

      // Load current event (for now, just get the first event the user is in)
      const { data: eventData, error: eventError } = await supabase
        .from("event_members")
        .select(`
          is_present,
          events (
            id,
            name,
            code,
            starts_at,
            ends_at
          )
        `)
        .eq("user_id", user.id)
        .limit(1)

      console.log("Event membership query result:", { eventData, eventError, userId: user.id })

      if (eventError) {
        console.error("Error loading event membership:", eventError)
        // Clear current event if there's an error
        setCurrentEvent(null)
        setIsPresent(false)
        setMatches([])
      } else if (eventData && eventData.length > 0) {
        const eventMember = eventData[0] as any // eslint-disable-line @typescript-eslint/no-explicit-any
        console.log("Event member data:", eventMember)
        if (eventMember?.events) {
          const event = eventMember.events as Event
          // Set matchmaking_enabled to false by default if not present
          if (!event.matchmaking_enabled) {
            event.matchmaking_enabled = false
          }
          setCurrentEvent(event)
          setIsPresent(eventMember.is_present || false)
          loadMatches(eventMember.events.id)
        } else {
          // No event data, clear everything
          setCurrentEvent(null)
          setIsPresent(false)
          setMatches([])
        }
      } else {
        // No event membership found, clear everything
        console.log("No event membership found for user:", user.id)
        setCurrentEvent(null)
        setIsPresent(false)
        setMatches([])
      }

    } catch {
      toast.error("Failed to load user data")
    } finally {
      setIsLoading(false)
    }
  }

  const loadMatches = async (eventId: string) => {
    if (!user) return
    
    try {
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(`
          id,
          summary,
          bases,
          panels,
          profiles!matches_b_fkey (
            id,
            first_name,
            last_name,
            job_title,
            company,
            avatar_url
          )
        `)
        .eq("event_id", eventId)
        .eq("a", user.id)
        .limit(3)

      if (matchesError) {
        console.error("Failed to load matches:", matchesError)
        return
      }

      const formattedMatches = matchesData?.map((match: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: match.id,
        summary: match.summary,
        bases: match.bases,
        panels: match.panels,
        profile: match.profiles,
        is_present: false // Default to false since we're not loading presence data for matches
      })) || []

      setMatches(formattedMatches)
    } catch (error) {
      console.error("Failed to load matches:", error)
    }
  }

  const togglePresence = async () => {
    if (!currentEvent || !user) return

    setIsLoading(true)
    try {
      const newPresence = !isPresent
      const { error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("event_members")
        .update({ is_present: newPresence })
        .eq("event_id", currentEvent.id)
        .eq("user_id", user.id)

      if (error) {
        toast.error("Failed to update presence")
        return
      }

      setIsPresent(newPresence)
      toast.success(newPresence ? "You're now marked as present!" : "You're no longer marked as present")
    } catch {
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth")
  }

  const handleMatchClick = (match: MatchWithProfile) => {
    router.push(`/profile/${match.profile.id}`)
  }

  const handleQRScan = () => {
    setIsQRScannerOpen(true)
  }

  const handleConnectionCreated = () => {
    // Refresh matches when a new connection is created
    if (currentEvent) {
      loadMatches(currentEvent.id)
    }
  }

  const handleRefreshData = () => {
    if (user) {
      loadUserData()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please complete your profile setup</p>
          <GradientButton onClick={() => router.push("/onboarding")}>
            Complete Setup
          </GradientButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center">
            {/* Left: User avatar with presence indicator */}
            <PresenceAvatar
              src={profile.avatar_url || undefined}
              fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
              isPresent={isPresent}
              size="md"
            />
            
            {/* Right of avatar: Intro wordmark */}
            <div className="ml-4">
              <h1 
                className="text-2xl font-bold"
                style={{ 
                  fontFamily: 'Changa One, cursive',
                  color: '#EB7437'
                }}
              >
                INTRO
              </h1>
            </div>
            
            {/* Right: Message icon with gradient */}
            <div className="ml-auto">
              <button
                onClick={() => router.push("/messages")}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #EC874E 0%, #BF341E 100%)',
                  border: 'none'
                }}
              >
                <MessageSquare className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Welcome Section */}
            <Card className="bg-card border-border shadow-elevation">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <PresenceAvatar
                    src={profile.avatar_url || undefined}
                    fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                    isPresent={isPresent}
                    size="lg"
                  />
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      Welcome back, {profile.first_name}!
                    </h2>
                    <p className="text-muted-foreground">
                      {profile.job_title} at {profile.company}
                    </p>
                    {currentEvent && (
                      <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {currentEvent.starts_at ? new Date(currentEvent.starts_at).toLocaleDateString() : 'TBD'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-4 w-4" />
                          <span>Conference Venue</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* QR Code Section - Prominently displayed */}
            {currentEvent && (
              <Card className="bg-card border-border shadow-elevation">
                <CardContent className="p-6 text-center space-y-4">
                  <h3 className="text-lg font-medium text-foreground">
                    Connect with other attendees and see what you have in common.
                  </h3>
                  <QRCard onScanClick={handleQRScan} />
                </CardContent>
              </Card>
            )}

            {/* If no current event, prompt to join */}
            {!currentEvent && (
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="h-5 w-5" />
                    <span>Join an Event</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">You are not part of any events yet. Join using an invite link, QR code, or a 5‑character code.</p>
                  <div className="flex gap-3">
                    <GradientButton onClick={() => router.push('/event/join')} className="flex-1">
                      Enter Code / Scan QR
                    </GradientButton>
                    <GradientButton onClick={handleRefreshData} variant="outline" size="sm">
                      Refresh
                    </GradientButton>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* People You Should Know */}
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>People You Should Know</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {matches.length > 0 ? (
                  matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      name={`${match.profile.first_name} ${match.profile.last_name}`}
                      jobTitle={match.profile.job_title || ''}
                      company={match.profile.company || ''}
                      avatarUrl={match.profile.avatar_url || undefined}
                      matchBases={match.bases}
                      summary={match.summary}
                      isPresent={match.is_present}
                      onClick={() => handleMatchClick(match)}
                    />
                  ))
                ) : currentEvent && !currentEvent.matchmaking_enabled ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <Users className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">
                      Waiting for matchmaking to begin
                    </h3>
                    <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                      The event organizer will start the AI matchmaking process soon. Check back later for personalized introductions!
                    </p>
                    <div className="mt-6 flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      No matches yet
                    </h3>
                    <p className="text-muted-foreground">
                      Matches will appear here once the event starts and matching is run.
                    </p>
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
