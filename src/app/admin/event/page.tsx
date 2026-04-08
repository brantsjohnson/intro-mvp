"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { toast } from "sonner"
import { ArrowLeft, Plus, Calendar, MapPin, Edit } from "lucide-react"

interface Event {
  event_id: string
  event_code: string
  event_name: string
  event_location: string | null
  event_starts_at: string | null
  event_ends_at: string | null
}

export default function AdminEventListPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    setLoadingEvents(true)
    try {
      const res = await fetch("/api/create-event")
      const json = await res.json()
      if (!res.ok) {
        console.error("Error loading events:", json)
        toast.error(json.error || "Failed to load events")
        return
      }
      setEvents(json.events || [])
    } catch (error) {
      console.error("Error loading events:", error)
      toast.error("An error occurred")
    } finally {
      setLoadingEvents(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set"
    try {
      const date = new Date(dateStr)
      return date.toLocaleString()
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/background.jpg')" }}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <GradientButton
              onClick={() => router.push("/admin/create-event")}
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </GradientButton>
            <h1 className="text-3xl font-bold">Events</h1>
          </div>
          <GradientButton onClick={() => router.push("/admin/create-event")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </GradientButton>
        </div>

        {loadingEvents ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading events...</p>
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No events found</p>
              <GradientButton onClick={() => router.push("/admin/create-event")}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Event
              </GradientButton>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Card key={event.event_id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push(`/admin/event/${event.event_id}`)}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{event.event_name}</CardTitle>
                      <p className="text-sm font-mono text-muted-foreground mb-4">{event.event_code}</p>
                    </div>
                    <GradientButton
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/admin/event/${event.event_id}`)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </GradientButton>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {event.event_location && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{event.event_location}</span>
                      </div>
                    )}
                    {event.event_starts_at && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(event.event_starts_at)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

