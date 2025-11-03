"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GradientButton } from "@/components/ui/gradient-button"
import { toast } from "sonner"
import { ArrowLeft, Plus } from "lucide-react"

export default function CreateEventPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    eventCode: "",
    eventName: "",
    eventLocation: "",
    eventStartsAt: "",
    eventEndsAt: ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.eventCode || !formData.eventName) {
      toast.error("Event code and name are required")
      return
    }

    if (formData.eventCode.length !== 6) {
      toast.error("Event code must be exactly 6 characters")
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
          eventStartsAt: formData.eventStartsAt || null,
          eventEndsAt: formData.eventEndsAt || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to create event')
        return
      }

      toast.success(`Event ${result.event.event_code} created successfully!`)
      router.push('/home')
    } catch (error) {
      console.error('Error creating event:', error)
      toast.error('An error occurred while creating the event')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen gradient-bg">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
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
        <div className="max-w-2xl mx-auto">
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
        </div>
      </main>
    </div>
  )
}

