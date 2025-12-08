"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { ArrowLeft, Save, Users, Play, Upload, Mail } from "lucide-react"
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isSendingCards, setIsSendingCards] = useState(false)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    if (eventId) {
      loadEvent()
    }
  }, [eventId])

  useEffect(() => {
    if (event) {
      loadMatchCount()
    }
  }, [event])

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
        toast.error("Failed to load event")
        router.push("/admin/create-event")
        return
      }

      setEvent(data)
      // Convert onboarding_question_schema to JSON string for editing
      setQuestionSchema(
        data.onboarding_question_schema 
          ? JSON.stringify(data.onboarding_question_schema, null, 2)
          : "{}"
      )
      // Set logo URL from matching_config
      setLogoUrl(data.matching_config?.logo_url || null)
    } catch (error) {
      console.error("Error loading event:", error)
      toast.error("An error occurred")
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
        toast.success(`Matching started! ${result.matchmaker_result?.processed || 0} users processed.`)
        // Reload match count after a delay
        setTimeout(() => {
          loadMatchCount()
        }, 2000)
      } else {
        toast.error(result.error || 'Failed to start matching')
        console.error('Matching error:', result)
      }
    } catch (error) {
      console.error('Error starting matching:', error)
      toast.error('Failed to start matching')
    } finally {
      setIsMatching(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!event) return

    setIsUploadingLogo(true)
    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${eventId}/logo-${Date.now()}.${fileExt}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('event-assets')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true
        })

      if (uploadError) {
        console.error('Error uploading logo:', uploadError)
        toast.error('Failed to upload logo')
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-assets')
        .getPublicUrl(fileName)

      const newLogoUrl = urlData.publicUrl

      // Update event matching_config with logo URL
      const currentConfig = event.matching_config || {}
      const { error: updateError } = await supabase
        .from('events')
        .update({
          matching_config: {
            ...currentConfig,
            logo_url: newLogoUrl
          }
        })
        .eq('event_id', eventId)

      if (updateError) {
        console.error('Error updating logo URL:', updateError)
        toast.error('Failed to save logo URL')
        return
      }

      setLogoUrl(newLogoUrl)
      // Update local event state
      setEvent({
        ...event,
        matching_config: {
          ...currentConfig,
          logo_url: newLogoUrl
        }
      })
      toast.success('Logo uploaded successfully!')
    } catch (error) {
      console.error('Error uploading logo:', error)
      toast.error('Failed to upload logo')
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleSendNetworkingCards = async () => {
    if (!event) return

    setIsSendingCards(true)
    try {
      const response = await fetch('/api/admin-send-networking-cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId: event.event_id,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success(`Sent ${result.sent} networking cards${result.failed > 0 ? ` (${result.failed} failed)` : ''}`)
      } else {
        toast.error(result.error || 'Failed to send networking cards')
      }
    } catch (error) {
      console.error('Error sending networking cards:', error)
      toast.error('Failed to send networking cards')
    } finally {
      setIsSendingCards(false)
    }
  }

  const handleSave = async () => {
    if (!event) return

    setIsSaving(true)
    try {
      // Validate JSON
      let parsedSchema
      try {
        parsedSchema = JSON.parse(questionSchema)
      } catch (e) {
        toast.error("Invalid JSON format. Please check your syntax.")
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
        toast.error("Failed to save onboarding questions")
        return
      }

      toast.success("Onboarding questions saved successfully!")
    } catch (error) {
      console.error("Error saving event:", error)
      toast.error("An error occurred while saving")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading event...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>
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
    <div className="min-h-screen bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/background.jpg')" }}>
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
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
                <Input value={event.event_name} disabled className="mt-1" />
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
              <div>
                <Label>Event Logo</Label>
                {logoUrl && (
                  <div className="mt-2 mb-2">
                    <Image 
                      src={logoUrl} 
                      alt="Event logo" 
                      width={200}
                      height={80}
                      className="max-w-[200px] max-h-[80px] object-contain border border-border rounded"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleLogoUpload(file)
                      }
                    }}
                    className="mt-1"
                    disabled={isUploadingLogo}
                  />
                  {isUploadingLogo && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a logo to display on networking summary cards (will be converted to grayscale)
                </p>
              </div>
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

          {/* Networking Cards Card */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Networking Summary Cards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Send networking summary cards to all event attendees
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each attendee will receive a personalized PNG summary via email
                  </p>
                </div>
                <GradientButton
                  onClick={handleSendNetworkingCards}
                  disabled={isSendingCards}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {isSendingCards ? "Sending..." : "Send Cards"}
                </GradientButton>
              </div>
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
