"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventQRCodeService } from "@/lib/event-qr-service"
import { createClientComponentClient } from "@/lib/supabase"
import { ArrowLeft, Save, Users, Play, Copy, QrCode, Link as LinkIcon } from "lucide-react"
import Image from "next/image"

interface Event {
  event_id: string
  event_code: string
  event_name: string
  event_location: string | null
  event_starts_at: string | null
  event_ends_at: string | null
  onboarding_question_schema: any
  matching_config: any
}

export default function AdminEventEditPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.eventId as string
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [questionSchema, setQuestionSchema] = useState<string>("")
  const [editedEventName, setEditedEventName] = useState<string>("")
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string>("")
  
  const supabase = createClientComponentClient()
  const qrService = new EventQRCodeService()

  useEffect(() => {
    if (eventId) {
      loadEvent()
    }
  }, [eventId])

  useEffect(() => {
    if (event) {
      loadMatchCount()
      generateQRCodeAndUrl()
    }
  }, [event])

  const generateQRCodeAndUrl = async () => {
    if (!event) return
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.introevent.site'
      const url = qrService.generateEncryptedJoinUrl(event.event_code, baseUrl)
      setJoinUrl(url)
      
      const qrCode = await qrService.generateEventQRCode(event.event_code, baseUrl)
      if (qrCode) {
        setQrCodeUrl(qrCode)
      }
    } catch (error) {
      console.error('Error generating QR code:', error)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const loadEvent = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("event_id", eventId)
        .single()

      if (error) {
        console.error("Error loading event:", error)
        router.push("/admin/create-event")
        return
      }

      setEvent(data)
      setEditedEventName(data.event_name || "")
      // Convert onboarding_question_schema to JSON string for editing
      setQuestionSchema(
        data.onboarding_question_schema 
          ? JSON.stringify(data.onboarding_question_schema, null, 2)
          : "{}"
      )
    } catch (error) {
      console.error("Error loading event:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMatchCount = async () => {
    if (!event) return
    try {
      const response = await fetch(`/api/admin-start-matching?eventCode=${event.event_code}`)
      const data = await response.json()
      if (data.match_count !== undefined) {
        setMatchCount(data.match_count)
      }
    } catch (error) {
      console.error("Error loading match count:", error)
    }
  }

  const handleStartMatching = async () => {
    if (!event) return
    
    setIsMatching(true)
    try {
      const response = await fetch('/api/admin-start-matching', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventCode: event.event_code,
          force: true
        })
      })

      const result = await response.json()
      
      if (response.ok) {
        // Reload match count after a delay
        setTimeout(() => {
          loadMatchCount()
        }, 2000)
      } else {
        console.error('Matching error:', result)
      }
    } catch (error) {
      console.error('Error starting matching:', error)
    } finally {
      setIsMatching(false)
    }
  }

  const handleSave = async () => {
    if (!event) return

    setIsSaving(true)
    try {
      // Update event name if changed
      if (editedEventName !== event.event_name) {
        const updateResponse = await fetch('/api/update-event', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            eventId: event.event_id,
            eventName: editedEventName
          })
        })

        if (!updateResponse.ok) {
          const error = await updateResponse.json()
          setIsSaving(false)
          return
        }
      }

      // Validate JSON
      let parsedSchema
      try {
        parsedSchema = JSON.parse(questionSchema)
      } catch (e) {
        setIsSaving(false)
        return
      }

      const { error } = await supabase
        .from("events")
        .update({
          onboarding_question_schema: parsedSchema
        })
        .eq("event_id", eventId)

      if (error) {
        console.error("Error updating event:", error)
        return
      }

    } catch (error) {
      console.error("Error saving event:", error)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading event...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Event not found</p>
          <GradientButton onClick={() => router.push("/admin/create-event")}>
            Create Event
          </GradientButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <GradientButton
                onClick={() => router.back()}
                variant="outline"
                size="icon"
              >
                <ArrowLeft className="h-4 w-4" />
              </GradientButton>
              <div className="ml-4">
                <h1 className="text-lg font-semibold text-foreground">
                  Edit Event: {event.event_name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Event Code: {event.event_code}
                </p>
              </div>
            </div>
            <GradientButton
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save Changes"}
            </GradientButton>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Event Info Card */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle>Event Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Event Name</Label>
                <Input 
                  value={editedEventName} 
                  onChange={(e) => setEditedEventName(e.target.value)}
                  className="mt-1" 
                />
              </div>
              <div>
                <Label>Event Code</Label>
                <Input value={event.event_code} disabled className="mt-1" />
              </div>
              {event.event_location && (
                <div>
                  <Label>Location</Label>
                  <Input value={event.event_location} disabled className="mt-1" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Join Link & QR Code Card */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Custom Join Link & QR Code
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Share this link or QR code to allow users to automatically join the event. Users will skip the join page and be added directly.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Join Link</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    value={joinUrl} 
                    readOnly 
                    className="font-mono text-sm" 
                  />
                  <GradientButton
                    onClick={() => copyToClipboard(joinUrl)}
                    variant="outline"
                    size="icon"
                    title="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </GradientButton>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Click the copy button to share this link. Users clicking it will automatically join the event.
                </p>
              </div>
              
              {qrCodeUrl && (
                <div className="flex flex-col items-center gap-2 pt-4 border-t border-border">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    QR Code
                  </Label>
                  <div className="bg-white p-2 rounded-lg">
                    <Image
                      src={qrCodeUrl}
                      alt={`QR Code for ${event.event_code}`}
                      width={200}
                      height={200}
                      className="rounded"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Scan to automatically join event {event.event_code}
                  </p>
                  <GradientButton
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = qrCodeUrl
                      link.download = `qr-code-${event.event_code}.png`
                      link.click()
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Download QR Code
                  </GradientButton>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matching Card */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                AI Matching
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Run AI-powered matching for all users in this event
                  </p>
                  {matchCount !== null && (
                    <p className="text-sm font-medium mt-1">
                      Current matches: {matchCount}
                    </p>
                  )}
                </div>
                <GradientButton
                  onClick={handleStartMatching}
                  disabled={isMatching}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isMatching ? "Running..." : "Start Matching"}
                </GradientButton>
              </div>
              <p className="text-xs text-muted-foreground">
                This will match all users in the event using vector similarity, shared interests, and career proximity.
              </p>
            </CardContent>
          </Card>

          {/* Onboarding Questions Card */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle>Onboarding Questions Schema</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Configure the onboarding questions for this event. This is a JSON schema that defines the adaptive Q&A questions.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Label htmlFor="questionSchema">Question Schema (JSON)</Label>
                <Textarea
                  id="questionSchema"
                  value={questionSchema}
                  onChange={(e) => setQuestionSchema(e.target.value)}
                  className="font-mono text-sm min-h-[400px]"
                  placeholder='{"version": "v1", "questions": []}'
                />
                <p className="text-xs text-muted-foreground">
                  Edit the JSON schema to customize onboarding questions. The schema will be validated before saving.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
