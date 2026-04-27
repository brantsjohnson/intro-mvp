"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { mergeInviteFromUrl, clearPendingEventInvite } from "@/lib/pending-event-invite"
import { haptics } from "@/lib/haptics"
import { toast } from "sonner"
import { ArrowLeft, Calendar, MapPin } from "lucide-react"

interface Event {
  event_id: string
  event_name: string
  event_code: string
  event_location: string | null
  event_starts_at: string | null
  event_ends_at: string | null
}

// Allowed emails that can see all events
const ALLOWED_EMAILS = ["alexisbinch5@gmail.com", "brantshanonjohnson@gmail.com"]

export function EventJoinPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isAutoJoining, setIsAutoJoining] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [availableEvents, setAvailableEvents] = useState<Event[]>([])
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [canSeeAllEvents, setCanSeeAllEvents] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  // Check authentication first, then handle event code
  useEffect(() => {
    const checkAuthAndHandleEvent = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const eventCode = searchParams.get("code")
        mergeInviteFromUrl(eventCode, null)

        if (!user) {
          // User is not authenticated - redirect to auth with event code
          if (eventCode) {
            router.push(`/auth?eventCode=${eventCode}`)
          } else {
            router.push("/auth")
          }
          return
        }

        // Get user email
        const { data: userData } = await supabase
          .from("users")
          .select("email")
          .eq("user_id", user.id)
          .single()

        const email = userData?.email || user.email
        setUserEmail(email || null)

        // Check if user can see all events
        if (email && ALLOWED_EMAILS.includes(email.toLowerCase())) {
          setCanSeeAllEvents(true)
          await loadAllEvents()
        }

        // User is authenticated - handle event joining
        if (eventCode) {
          await handleAutoJoinEvent(eventCode)
        }
      } catch (error) {
        console.error("Error checking auth:", error)
        router.push("/auth")
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuthAndHandleEvent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router])

  const loadAllEvents = async () => {
    setIsLoadingEvents(true)
    try {
      const { data: events, error } = await supabase
        .from("events")
        .select(
          "event_id, event_name, event_code, event_location, event_starts_at, event_ends_at",
        )
        .order("event_starts_at", { ascending: false, nullsFirst: false })

      if (error) {
        console.error("Error loading events:", error)
        toast.error("Failed to load events")
        return
      }

      setAvailableEvents(events || [])
    } catch (error) {
      console.error("Error loading events:", error)
      toast.error("Failed to load events")
    } finally {
      setIsLoadingEvents(false)
    }
  }

  const handleAutoJoinEvent = async (eventCode: string) => {
    setIsAutoJoining(true)
    try {
      await handleJoinEvent(eventCode)
      // handleJoinEvent handles redirect
    } catch (error) {
      console.error("Error in auto-join:", error)
    } finally {
      setIsAutoJoining(false)
    }
  }

  const handleJoinEvent = async (eventCode: string) => {
    setIsLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        return
      }

      // First, get the event by code
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("event_id, event_name, event_code")
        .eq("event_code", eventCode.toUpperCase())
        .maybeSingle()

      if (eventError) {
        console.error("Event query error:", eventError)
        return
      }

      if (!event) {
        return
      }

      const typedEvent = event as Event

      // Check if user is already a member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from("attendance")
        .select("event_id, user_id")
        .eq("event_id", typedEvent.event_id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (memberCheckError) {
        console.error("Error checking membership:", memberCheckError)
        return
      }

      if (existingMember) {
        clearPendingEventInvite()
        // Redirect to home page since they're already in the event
        router.push("/home")
        return
      }

      // Join the event
      const { error: joinError } = await supabase.from("attendance").insert({
        event_id: typedEvent.event_id,
        user_id: user.id,
        checked_in_at: new Date().toISOString(),
      })

      if (joinError) {
        console.error("Error joining event:", joinError)
        return
      }

      clearPendingEventInvite()

      // Success haptic feedback
      haptics.success()

      void fetch("/api/refresh-matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: typedEvent.event_id,
          newUserId: user.id,
        }),
      }).catch((error) => {
        console.error("Failed to refresh matches for new user:", error)
      })

      // Redirect to onboarding step 3 (networking goals) for this specific event
      router.push(`/onboarding?from=event-join&eventId=${typedEvent.event_id}`)
    } catch (error) {
      console.error("Error joining event:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
          <p className="text-xs text-muted-foreground mt-2">
            Do not refresh this page. Could take 30 seconds.
          </p>
        </div>
      </div>
    )
  }

  // Show auto-joining state
  if (isAutoJoining) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Joining event...</p>
        </div>
      </div>
    )
  }

  const handleSelectEvent = async (event: Event) => {
    await handleJoinEvent(event.event_code)
  }

  const formatEventDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <GradientButton
              onClick={() => router.push("/onboarding")}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>

            <div className="flex-1 text-center">
              <h1 className="text-lg font-semibold text-foreground">JOIN EVENT</h1>
            </div>

            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        {canSeeAllEvents ? (
          <div className="max-w-2xl mx-auto">
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Select An Event</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Choose an event to join from the list below
                </p>
              </CardHeader>
              <CardContent>
                {isLoadingEvents ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading events...</p>
                  </div>
                ) : availableEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No events available</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableEvents.map((event) => (
                      <Card
                        key={event.event_id}
                        className="bg-card border-border shadow-elevation cursor-pointer hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)] transition-shadow"
                        onClick={() => handleSelectEvent(event)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-foreground mb-1">
                                {event.event_name}
                              </h3>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-medium text-foreground">
                                    {event.event_code}
                                  </span>
                                </div>
                                {event.event_location && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <span>{event.event_location}</span>
                                  </div>
                                )}
                                {event.event_starts_at && (
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    <span>{formatEventDate(event.event_starts_at)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <GradientButton
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSelectEvent(event)
                              }}
                              disabled={isLoading}
                              size="sm"
                            >
                              Join
                            </GradientButton>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <Card className="bg-card border-border shadow-elevation">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Join An Event</CardTitle>
              </CardHeader>
              <CardContent>
                <EventJoinScanner
                  onJoinEvent={handleJoinEvent}
                  onScanQR={() => {
                    /* QR scanning handled internally */
                  }}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
