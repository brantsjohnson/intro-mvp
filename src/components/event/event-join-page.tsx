"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { haptics } from "@/lib/haptics"
import { ArrowLeft } from "lucide-react"

interface Event {
  event_id: string
  event_name: string
  event_code: string
}

export function EventJoinPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isAutoJoining, setIsAutoJoining] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  // Check authentication first, then handle event code
  useEffect(() => {
    const checkAuthAndHandleEvent = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const eventCode = searchParams.get('code')
        
        if (!user) {
          // User is not authenticated - redirect to auth with event code
          if (eventCode) {
            router.push(`/auth?eventCode=${eventCode}`)
          } else {
            router.push('/auth')
          }
          return
        }

        // User is authenticated - handle event joining
        if (eventCode) {
          await handleAutoJoinEvent(eventCode)
        }
      } catch (error) {
        console.error("Error checking auth:", error)
        router.push('/auth')
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuthAndHandleEvent()
  }, [searchParams, router, supabase.auth])

  const handleAutoJoinEvent = async (eventCode: string) => {
    setIsAutoJoining(true)
    try {
      // User is authenticated - auto-join the event
      await handleJoinEvent(eventCode)
      // handleJoinEvent will handle the redirect, so we don't need to do anything here
    } catch (error) {
      console.error("Error in auto-join:", error)
    } finally {
      setIsAutoJoining(false)
    }
  }

  const handleJoinEvent = async (eventCode: string) => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
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
        // Redirect to home page since they're already in the event
        router.push('/home')
        return
      }

      // Join the event
      const { error: joinError } = await supabase
        .from("attendance")
        .insert({
          event_id: typedEvent.event_id,
          user_id: user.id,
          checked_in_at: new Date().toISOString()
        })

      if (joinError) {
        return
      }

      // Success haptic feedback
      haptics.success()

      // Trigger match refresh for the new user (in background)
      try {
        await fetch('/api/refresh-matches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            eventId: typedEvent.event_id, 
            newUserId: user.id 
          }),
        })
      } catch (error) {
        console.error('Failed to refresh matches for new user:', error)
        // Don't show error to user, this is a background process
      }

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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
          <p className="text-xs text-muted-foreground mt-2">Do not refresh this page. Could take 30 seconds.</p>
        </div>
      </div>
    )
  }

  // Show auto-joining state
  if (isAutoJoining) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Joining event...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <GradientButton
              onClick={() => router.push('/onboarding')}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <div className="flex-1 text-center">
              <h1 className="text-lg font-semibold text-foreground">
                JOIN EVENT
              </h1>
            </div>

            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-md mx-auto">
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Join An Event</CardTitle>
            </CardHeader>
            <CardContent>
              <EventJoinScanner
                onJoinEvent={handleJoinEvent}
                onScanQR={() => {}} // QR scanning is handled internally by EventJoinScanner
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
