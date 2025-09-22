"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"

interface Event {
  id: string
  name: string
  code: string
}

export function EventJoinPage() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleJoinEvent = async (eventCode: string) => {
    setIsLoading(true)
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

      const typedEvent = event as Event

      // Check if user is already a member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from("event_members")
        .select("event_id, user_id")
        .eq("event_id", typedEvent.id)
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
          event_id: typedEvent.id,
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
            eventId: typedEvent.id, 
            newUserId: user.id 
          }),
        })
      } catch (error) {
        console.error('Failed to refresh matches for new user:', error)
        // Don't show error to user, this is a background process
      }

      toast.success("Successfully joined event!")
      // After joining from Home, ask networking goals; but if user completes onboarding first, they can come back from Home too
      router.push(`/onboarding?from=event-join&eventId=${typedEvent.id}`)
    } catch (error) {
      console.error("Error joining event:", error)
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleScanQR = () => {
    // TODO: Implement QR scanning
    toast.info("QR scanning will be implemented")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={() => router.back()}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <h1 className="text-lg font-semibold text-foreground">
              JOIN EVENT
            </h1>

            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-md mx-auto">
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">JOIN AN EVENT</CardTitle>
            </CardHeader>
            <CardContent>
              <EventJoinScanner
                onJoinEvent={handleJoinEvent}
                onScanQR={handleScanQR}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
