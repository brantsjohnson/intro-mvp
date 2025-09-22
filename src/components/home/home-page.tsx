"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { MatchCard } from "@/components/ui/match-card"
import { QRCard } from "@/components/ui/qr-card"
import { createClientComponentClient } from "@/lib/supabase"
import { User, Profile, Event } from "@/lib/types"
import { toast } from "sonner"
import { 
  Users, 
  MessageSquare, 
  Settings, 
  LogOut, 
  MapPin,
  Calendar,
  Sparkles
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
      const { data: eventData } = await supabase
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
        .single()

      if (eventData) {
        const eventMember = eventData as any // eslint-disable-line @typescript-eslint/no-explicit-any
        if (eventMember.events) {
          setCurrentEvent(eventMember.events as Event)
          setIsPresent(eventMember.is_present)
          loadMatches(eventMember.events.id)
        }
      }
      // If no events, keep currentEvent null; Home will show empty-state to join via code/QR

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
          ),
          event_members!inner (
            is_present
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
        is_present: match.event_members.is_present
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
    // TODO: Implement QR scanning
    toast.info("QR scanning will be implemented")
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Intro</h1>
                {currentEvent && (
                  <p className="text-sm text-muted-foreground">{currentEvent.name}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <PresenceAvatar
                src={profile.avatar_url || undefined}
                fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                isPresent={isPresent}
                size="sm"
              />
              <GradientButton
                onClick={togglePresence}
                disabled={isLoading}
                size="sm"
                variant={isPresent ? "secondary" : "default"}
              >
                {isPresent ? "I'm Here" : "Mark Present"}
              </GradientButton>
              <GradientButton
                onClick={() => router.push("/settings")}
                variant="outline"
                size="icon"
              >
                <Settings className="h-4 w-4" />
              </GradientButton>
              <GradientButton
                onClick={handleSignOut}
                variant="outline"
                size="icon"
              >
                <LogOut className="h-4 w-4" />
              </GradientButton>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
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

          {/* Sidebar */}
          <div className="space-y-6">
            {/* QR Code */}
            <QRCard
              qrCodeUrl={undefined} // TODO: Generate QR code
              onScanClick={handleQRScan}
            />

            {/* Quick Actions */}
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <GradientButton
                  onClick={() => router.push("/messages")}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Messages
                </GradientButton>
                <GradientButton
                  onClick={() => router.push("/event/join")}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Join Another Event
                </GradientButton>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
