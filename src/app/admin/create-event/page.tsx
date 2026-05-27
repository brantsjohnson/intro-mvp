"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventQRCodeService } from "@/lib/event-qr-service"
import { ArrowLeft, Plus, Edit, QrCode, Calendar, MapPin, Copy, Link as LinkIcon } from "lucide-react"
import Image from "next/image"

interface Event {
  event_id: string
  event_code: string
  event_name: string
  event_location: string | null
  event_starts_at: string | null
  event_ends_at: string | null
  event_description: string | null
}

export default function CreateEventPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const [joinUrls, setJoinUrls] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    eventCode: "",
    eventName: "",
    eventLocation: "",
    eventDescription: "",
    eventStartsAt: "",
    eventEndsAt: ""
  })
  const [editFormData, setEditFormData] = useState<Record<string, any>>({})
  const qrService = new EventQRCodeService()

  useEffect(() => {
    loadEvents()
  }, [])

  useEffect(() => {
    // Generate QR codes and join URLs for all events
    const generateQRCodesAndUrls = async () => {
      const codes: Record<string, string> = {}
      const urls: Record<string, string> = {}
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.introevent.site'
      
      for (const event of events) {
        const qrCode = await qrService.generateEventQRCode(event.event_code, baseUrl)
        if (qrCode) {
          codes[event.event_id] = qrCode
        }
        const joinUrl = qrService.generateEncryptedJoinUrl(event.event_code, baseUrl)
        urls[event.event_id] = joinUrl
      }
      setQrCodes(codes)
      setJoinUrls(urls)
    }
    if (events.length > 0) {
      generateQRCodesAndUrls()
    }
  }, [events])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const loadEvents = async () => {
    setLoadingEvents(true)
    try {
      const res = await fetch("/api/create-event")
      const json = await res.json()
      if (!res.ok) {
        console.error("Error loading events:", json)
        return
      }
      setEvents(json.events || [])
    } catch (error) {
      console.error("Error loading events:", error)
    } finally {
      setLoadingEvents(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.eventCode || !formData.eventName) {
      return
    }

    if (formData.eventCode.length !== 6) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/create-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventCode: formData.eventCode.toUpperCase(),
          eventName: formData.eventName,
          eventLocation: formData.eventLocation || null,
          eventDescription: formData.eventDescription || null,
          // Store times exactly as entered (datetime-local format)
          eventStartsAt: formData.eventStartsAt || null,
          eventEndsAt: formData.eventEndsAt || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        return
      }

      // Reset form
      setFormData({
        eventCode: "",
        eventName: "",
        eventLocation: "",
        eventDescription: "",
        eventStartsAt: "",
        eventEndsAt: ""
      })
      // Reload events
      await loadEvents()
    } catch (error) {
      console.error('Error creating event:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartEdit = (event: Event) => {
    setEditingEventId(event.event_id)
    // Convert datetime strings to datetime-local format
    const formatForInput = (dateStr: string | null) => {
      if (!dateStr) return ""
      // If it's already in the right format, return as-is
      if (dateStr.includes('T')) {
        return dateStr.slice(0, 16) // "YYYY-MM-DDTHH:mm"
      }
      // Otherwise try to parse and format
      try {
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      } catch {
        return ""
      }
    }
    setEditFormData({
      eventName: event.event_name,
      eventLocation: event.event_location || "",
      eventDescription: event.event_description || "",
      eventStartsAt: formatForInput(event.event_starts_at),
      eventEndsAt: formatForInput(event.event_ends_at)
    })
  }

  const handleCancelEdit = () => {
    setEditingEventId(null)
    setEditFormData({})
  }

  const handleSaveEdit = async (eventId: string) => {
    try {
      const response = await fetch('/api/update-event', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
          eventName: editFormData.eventName,
          eventLocation: editFormData.eventLocation || null,
          eventDescription: editFormData.eventDescription ?? null,
          // Store times exactly as entered (datetime-local format)
          eventStartsAt: editFormData.eventStartsAt || null,
          eventEndsAt: editFormData.eventEndsAt || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        return
      }

      setEditingEventId(null)
      setEditFormData({})
      await loadEvents()
    } catch (error) {
      console.error('Error updating event:', error)
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "Not set"
    // If it's already in datetime-local format, format it nicely
    if (dateStr.includes('T')) {
      const [date, time] = dateStr.split('T')
      const [year, month, day] = date.split('-')
      const [hours, minutes] = time.split(':')
      const hour12 = parseInt(hours) % 12 || 12
      const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM'
      return `${month}/${day}/${year} ${hour12}:${minutes} ${ampm}`
    }
    // Otherwise try to parse as ISO date
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return dateStr
    }
  }

  const isEventLive = (event: Event) => {
    if (!event.event_starts_at || !event.event_ends_at) return false
    const now = new Date()
    const start = new Date(event.event_starts_at)
    const end = new Date(event.event_ends_at)
    return now >= start && now <= end
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center">
            <GradientButton
              onClick={() => router.back()}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            <h1 className="ml-4 text-lg font-semibold text-foreground">
              Create Event
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Create New Event Form */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle>Create New Event</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="eventCode">Event Code *</Label>
                  <Input
                    id="eventCode"
                    value={formData.eventCode}
                    onChange={(e) => setFormData({ ...formData, eventCode: e.target.value.toUpperCase() })}
                    placeholder="ABC123 (exactly 6 characters)"
                    maxLength={6}
                    required
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be exactly 6 characters. Users will use this to join the event.
                  </p>
                </div>

                <div>
                  <Label htmlFor="eventName">Event Name *</Label>
                  <Input
                    id="eventName"
                    value={formData.eventName}
                    onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                    placeholder="e.g., Founder Friday - April"
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="eventLocation">Location</Label>
                  <Input
                    id="eventLocation"
                    value={formData.eventLocation}
                    onChange={(e) => setFormData({ ...formData, eventLocation: e.target.value })}
                    placeholder="e.g., San Francisco, CA"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="eventDescription">Event Description</Label>
                  <Textarea
                    id="eventDescription"
                    value={formData.eventDescription}
                    onChange={(e) =>
                      setFormData({ ...formData, eventDescription: e.target.value })
                    }
                    placeholder="What is this event actually about? Theme, main topics or sessions, intended audience, anything that should ground the onboarding AI's follow-up questions."
                    className="mt-1 min-h-[140px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Used by the onboarding AI as ground truth for event-anchored follow-ups
                    (topics, sessions, audience). Optional — you can fill it in later.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="eventStartsAt">Start Date & Time</Label>
                    <Input
                      id="eventStartsAt"
                      type="datetime-local"
                      value={formData.eventStartsAt}
                      onChange={(e) => setFormData({ ...formData, eventStartsAt: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="eventEndsAt">End Date & Time</Label>
                    <Input
                      id="eventEndsAt"
                      type="datetime-local"
                      value={formData.eventEndsAt}
                      onChange={(e) => setFormData({ ...formData, eventEndsAt: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <GradientButton
                    type="submit"
                    disabled={isLoading || !formData.eventCode || !formData.eventName}
                  >
                    {isLoading ? "Creating..." : "Create Event"}
                  </GradientButton>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Live Events List */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle>Live Events</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEvents ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading events...</p>
                </div>
              ) : events.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No events found. Create one above!</p>
              ) : (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div
                      key={event.event_id}
                      className="border border-border rounded-lg p-4 space-y-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-foreground">
                              {event.event_name}
                            </h3>
                            {isEventLive(event) && (
                              <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-500 rounded-xl">
                                LIVE
                              </span>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Code:</span>
                              <span className="font-mono">{event.event_code}</span>
                            </div>
                            {event.event_location && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span>{event.event_location}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {formatDateTime(event.event_starts_at)} - {formatDateTime(event.event_ends_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <GradientButton
                            variant="outline"
                            size="icon"
                            onClick={() => router.push(`/admin/event/${event.event_id}`)}
                          >
                            <Edit className="h-4 w-4" />
                          </GradientButton>
                        </div>
                      </div>

                      {/* Custom Join Link & QR Code */}
                      {(joinUrls[event.event_id] || qrCodes[event.event_id]) && (
                        <div className="flex flex-col gap-4 pt-4 border-t border-border">
                          {/* Join Link */}
                          {joinUrls[event.event_id] && (
                            <div>
                              <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                                <LinkIcon className="h-4 w-4" />
                                Custom Join Link
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input 
                                  value={joinUrls[event.event_id]} 
                                  readOnly 
                                  className="font-mono text-sm" 
                                />
                                <GradientButton
                                  onClick={() => copyToClipboard(joinUrls[event.event_id])}
                                  variant="outline"
                                  size="icon"
                                  title="Copy link"
                                >
                                  <Copy className="h-4 w-4" />
                                </GradientButton>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Share this link to allow users to automatically join the event.
                              </p>
                            </div>
                          )}
                          
                          {/* QR Code */}
                          {qrCodes[event.event_id] && (
                            <div className="flex flex-col items-center gap-2">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <QrCode className="h-4 w-4" />
                                QR Code
                              </Label>
                              <div className="bg-white p-2 rounded-lg">
                                <Image
                                  src={qrCodes[event.event_id]}
                                  alt={`QR Code for ${event.event_code}`}
                                  width={200}
                                  height={200}
                                  className="rounded"
                                />
                              </div>
                              <p className="text-xs text-muted-foreground text-center">
                                Scan to automatically join event {event.event_code}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline Edit Form */}
                      {editingEventId === event.event_id ? (
                        <div className="pt-4 border-t border-border space-y-4">
                          <div>
                            <Label>Event Name</Label>
                            <Input
                              value={editFormData.eventName || ""}
                              onChange={(e) => setEditFormData({ ...editFormData, eventName: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>Location</Label>
                            <Input
                              value={editFormData.eventLocation || ""}
                              onChange={(e) => setEditFormData({ ...editFormData, eventLocation: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>Event Description</Label>
                            <Textarea
                              value={editFormData.eventDescription || ""}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  eventDescription: e.target.value,
                                })
                              }
                              placeholder="What is this event actually about? Theme, topics, sessions, audience."
                              className="mt-1 min-h-[120px]"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Used by the onboarding AI for event-anchored follow-up questions.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label>Start Date & Time</Label>
                              <Input
                                type="datetime-local"
                                value={editFormData.eventStartsAt || ""}
                                onChange={(e) => setEditFormData({ ...editFormData, eventStartsAt: e.target.value })}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label>End Date & Time</Label>
                              <Input
                                type="datetime-local"
                                value={editFormData.eventEndsAt || ""}
                                onChange={(e) => setEditFormData({ ...editFormData, eventEndsAt: e.target.value })}
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <GradientButton
                              onClick={() => handleSaveEdit(event.event_id)}
                              className="flex-1"
                            >
                              Save Changes
                            </GradientButton>
                            <GradientButton
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="flex-1"
                            >
                              Cancel
                            </GradientButton>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2">
                          <GradientButton
                            variant="outline"
                            size="sm"
                            onClick={() => handleStartEdit(event)}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Event
                          </GradientButton>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
