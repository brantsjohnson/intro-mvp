"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { MatchCard } from "@/components/ui/match-card"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { MessageService } from "@/lib/message-service-simple"
import { User, Profile, Event } from "@/lib/types"
import { toast } from "sonner"
import { 
  Users, 
  MessageSquare, 
  MapPin,
  Calendar,
  Plus,
  QrCode,
  UserPlus,
  ArrowRight
} from "lucide-react"

interface MatchWithProfile {
  id: string
  summary: string
  bases: string[]
  panels: Record<string, unknown>
  profile: Profile
  is_present: boolean
}

interface ConnectionWithProfile {
  id: string
  source: string
  created_at: string
  profile: Profile
  connection_reason?: string
}

export function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [matches, setMatches] = useState<MatchWithProfile[]>([])
  const [connections, setConnections] = useState<ConnectionWithProfile[]>([])
  const [isPresent, setIsPresent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [isJoiningEvent, setIsJoiningEvent] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  
  const router = useRouter()
  const supabase = createClientComponentClient()
  const messageService = new MessageService()

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

  // Load unread message count when current event changes
  useEffect(() => {
    const loadUnreadCount = async () => {
      if (currentEvent && user) {
        try {
          const count = await messageService.getUnreadCount(currentEvent.id)
          setUnreadMessageCount(count)
        } catch (error) {
          console.error("Error loading unread count:", error)
        }
      }
    }

    loadUnreadCount()

    // Subscribe to real-time message updates
    if (currentEvent) {
      const subscription = messageService.subscribeToMessages(currentEvent.id, () => {
        loadUnreadCount() // Reload count when messages change
      })

      return () => subscription.unsubscribe()
    }
  }, [currentEvent, user, messageService])

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
          loadConnections(eventMember.events.id)
        } else {
          // No event data, clear everything
          setCurrentEvent(null)
          setIsPresent(false)
          setMatches([])
          setConnections([])
        }
      } else {
        // No event membership found, clear everything
        console.log("No event membership found for user:", user.id)
        setCurrentEvent(null)
        setIsPresent(false)
        setMatches([])
        setConnections([])
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
      // Load matches where current user is A (show profile B)
      const aSidePromise = supabase
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

      // Load matches where current user is B (show profile A)
      const bSidePromise = supabase
        .from("matches")
        .select(`
          id,
          summary,
          bases,
          panels,
          profiles!matches_a_fkey (
            id,
            first_name,
            last_name,
            job_title,
            company,
            avatar_url
          )
        `)
        .eq("event_id", eventId)
        .eq("b", user.id)
        .limit(3)

      const [{ data: aData, error: aError }, { data: bData, error: bError }] = await Promise.all([aSidePromise, bSidePromise])

      if (aError || bError) {
        console.error("Failed to load matches:", aError || bError)
        return
      }

      const toFormatted = (rows: any[] | null) => // eslint-disable-line @typescript-eslint/no-explicit-any
        (rows || []).map((match: any) => ({
          id: match.id,
          summary: match.summary,
          bases: match.bases,
          panels: match.panels,
          profile: match.profiles,
          is_present: false
        }))

      // Merge and de-duplicate by id, prefer earliest
      const merged = [...toFormatted(aData), ...toFormatted(bData)]
      const seen = new Set<string>()
      const deduped: MatchWithProfile[] = []
      for (const m of merged) {
        if (!seen.has(m.id)) {
          seen.add(m.id)
          deduped.push(m)
        }
      }

      // Limit to 3 overall
      setMatches(deduped.slice(0, 3))
    } catch (error) {
      console.error("Failed to load matches:", error)
    }
  }

  const loadConnections = async (eventId: string) => {
    if (!user) return
    
    try {
      // Load connections where current user is A (show profile B)
      const aSidePromise = supabase
        .from("connections")
        .select(`
          id,
          source,
          created_at,
          profiles!b (
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

      // Load connections where current user is B (show profile A)
      const bSidePromise = supabase
        .from("connections")
        .select(`
          id,
          source,
          created_at,
          profiles!a (
            id,
            first_name,
            last_name,
            job_title,
            company,
            avatar_url
          )
        `)
        .eq("event_id", eventId)
        .eq("b", user.id)

      const [{ data: aData, error: aError }, { data: bData, error: bError }] = await Promise.all([aSidePromise, bSidePromise])

      if (aError || bError) {
        console.error("Failed to load connections:", aError || bError)
        return
      }

      const toFormatted = (rows: any[] | null) => // eslint-disable-line @typescript-eslint/no-explicit-any
        (rows || []).map((connection: any) => ({
          id: connection.id,
          source: connection.source,
          created_at: connection.created_at,
          profile: connection.profiles,
          connection_reason: connection.source === 'qr' ? 'QR Code Connection' : 'AI Match'
        }))

      // Merge and de-duplicate by id, prefer earliest
      const merged = [...toFormatted(aData), ...toFormatted(bData)]
      const seen = new Set<string>()
      const deduped: ConnectionWithProfile[] = []
      for (const c of merged) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          deduped.push(c)
        }
      }

      // Sort by creation date, newest first
      deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      
      setConnections(deduped)
    } catch (error) {
      console.error("Failed to load connections:", error)
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
    if (currentEvent) {
      router.push(`/profile/${match.profile.id}?source=suggested&eventId=${currentEvent.id}`)
    } else {
      router.push(`/profile/${match.profile.id}`)
    }
  }

  const handleQRScan = () => {
    setIsQRScannerOpen(true)
  }

  const handleConnectionCreated = () => {
    // Refresh matches and connections when a new connection is created
    if (currentEvent) {
      loadMatches(currentEvent.id)
      loadConnections(currentEvent.id)
    }
  }

  const handleJoinEvent = async (eventCode: string) => {
    setIsJoiningEvent(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error("Please sign in first")
        return
      }

      // First, get the event by code
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("code", eventCode.toUpperCase())
        .eq("is_active", true)
        .maybeSingle()

      if (eventError) {
        console.error("Event query error:", eventError)
        toast.error("Failed to check event. Please try again.")
        return
      }

      if (!event) {
        toast.error("Event not found or inactive")
        return
      }

      // Check if user is already a member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from("event_members")
        .select("event_id, user_id")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (memberCheckError) {
        console.error("Error checking membership:", memberCheckError)
        toast.error("Failed to check membership. Please try again.")
        return
      }

      if (existingMember) {
        toast.error("You're already a member of this event")
        return
      }

      // Join the event
      const { error: joinError } = await supabase
        .from("event_members")
        .insert({
          event_id: event.id,
          user_id: user.id
        })

      if (joinError) {
        toast.error("Failed to join event")
        return
      }

      // Trigger match refresh for the new user (in background)
      try {
        await fetch('/api/refresh-matches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            eventId: event.id, 
            newUserId: user.id 
          }),
        })
      } catch (error) {
        console.error('Failed to refresh matches for new user:', error)
        // Don't show error to user, this is a background process
      }

      toast.success("Successfully joined event!")
      // After joining from Home, ask networking goals; but if user completes onboarding first, they can come back from Home too
      router.push(`/onboarding?from=event-join&eventId=${event.id}`)
    } catch (error) {
      console.error("Error joining event:", error)
      toast.error("An error occurred")
    } finally {
      setIsJoiningEvent(false)
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
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Left: User avatar with presence indicator */}
            <button
              onClick={() => router.push("/settings")}
              className="focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-full"
            >
              <PresenceAvatar
                src={profile.avatar_url || undefined}
                fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                isPresent={isPresent}
                size="md"
              />
            </button>
            
            {/* Center: Intro wordmark */}
            <div className="flex-1 flex justify-center">
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
            
            {/* Right: Message icon with gradient and unread badge */}
            <div className="relative">
              <button
                onClick={() => router.push(`/messages?eventId=${currentEvent?.id || ''}`)}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #EC874E 0%, #BF341E 100%)',
                  border: 'none'
                }}
              >
                <MessageSquare className="h-5 w-5 text-white" />
              </button>
              {unreadMessageCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-[#BF341E] text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Event Title and Presence Section */}
          {currentEvent && (
            <Card className="bg-card border-border shadow-elevation">
              <CardContent className="p-4 text-center space-y-4">
                {/* Event Title */}
                <h2 className="text-2xl font-semibold text-foreground">
                  {currentEvent.name}
                </h2>
                
                {/* Gradient Separator Line */}
                <div 
                  className="h-1 w-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #EC874E 0%, #BF341E 100%)'
                  }}
                />
                
                {/* Event Details - Compact Format */}
                <div className="text-sm text-muted-foreground space-y-1">
                  {currentEvent.starts_at && (
                    <p>
                      {new Date(currentEvent.starts_at).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })} @ {new Date(currentEvent.starts_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                      {currentEvent.ends_at && (
                        <> - {new Date(currentEvent.ends_at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}</>
                      )}
                    </p>
                  )}
                  {currentEvent.location && (
                    <p className="font-medium">Location: {currentEvent.location}</p>
                  )}
                </div>
                
                {/* I'm Here Button - Only show if not present */}
                {!isPresent && (
                  <button
                    onClick={togglePresence}
                    disabled={isLoading}
                    className="px-8 py-3 rounded-lg text-white font-medium text-lg mx-auto block"
                    style={{
                      background: 'linear-gradient(135deg, #4B915A 0%, #0B3E16 100%)',
                      border: 'none'
                    }}
                  >
                    I'm Here
                  </button>
                )}
                
                {/* Instructions - Only show if not present */}
                {!isPresent && (
                  <p className="text-muted-foreground text-center text-sm">
                    Let your Intro matches know you're at the conference
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* People You Should Know - Only show when event exists */}
          {currentEvent && (
            <div className="space-y-3">
              {/* Title Section */}
              <div className="px-1">
                <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                  <Users className="h-5 w-5" />
                  <span>People You Should Know</span>
                </h2>
              </div>
              
              {/* Matches Container */}
              <div className="space-y-2">
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
                  <Card className="bg-card border-border shadow-elevation">
                    <CardContent className="text-center py-4">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Waiting for matchmaking to begin
                      </h3>
                      <p className="text-muted-foreground max-w-md mx-auto leading-relaxed text-sm">
                        The event organizer will start the AI matchmaking process soon. Check back later for personalized introductions!
                      </p>
                      <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-card border-border shadow-elevation">
                    <CardContent className="text-center py-4">
                      <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <h3 className="text-base font-medium text-foreground mb-2">
                        No matches yet
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        Matches will appear here once the event starts and matching is run.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Add Other Attendees Section - Only show when event exists */}
            {currentEvent && (
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center space-x-2">
                    <QrCode className="h-5 w-5" />
                    <span>Add other attendees</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <QRCard onScanClick={handleQRScan} />
                </CardContent>
              </Card>
            )}

            {/* Your Connections - Only show when connections exist */}
            {currentEvent && connections.length > 0 && (
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center space-x-2">
                    <UserPlus className="h-5 w-5" />
                    <span>Your Connections</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {connections.map((connection) => (
                    <div
                      key={connection.id}
                      className="flex items-center space-x-3 p-3 rounded-lg bg-card/50 border border-border hover:bg-card/80 transition-colors cursor-pointer"
                      onClick={() => router.push(`/profile/${connection.profile.id}?source=connection&eventId=${currentEvent.id}`)}
                    >
                      <PresenceAvatar
                        src={connection.profile.avatar_url}
                        fallback={`${connection.profile.first_name[0]}${connection.profile.last_name[0]}`}
                        isPresent={false}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground">
                          {connection.profile.first_name} {connection.profile.last_name}
                        </h3>
                        {connection.profile.job_title && (
                          <p className="text-sm text-muted-foreground">
                            {connection.profile.job_title}
                            {connection.profile.company && ` at ${connection.profile.company}`}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {connection.connection_reason}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* If no current event, show join event section */}
        {!currentEvent && (
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="text-center pb-3">
              <CardTitle className="text-xl">JOIN AN EVENT</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <EventJoinScanner
                onJoinEvent={handleJoinEvent}
                onScanQR={() => {}} // QR scanning is handled within EventJoinScanner
                isLoading={isJoiningEvent}
              />
            </CardContent>
          </Card>
        )}
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
