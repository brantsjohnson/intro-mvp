"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Checkbox } from "@/components/ui/checkbox"
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
  const [editedEventName, setEditedEventName] = useState<string>("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [surveyQuestion, setSurveyQuestion] = useState<string>("")
  const [showRefreshButton, setShowRefreshButton] = useState<boolean>(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isSendingCards, setIsSendingCards] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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
      setEditedEventName(data.event_name || "")
      // Convert onboarding_question_schema to JSON string for editing
      setQuestionSchema(
        data.onboarding_question_schema 
          ? JSON.stringify(data.onboarding_question_schema, null, 2)
          : "{}"
      )
      // Set logo URL from matching_config
      const matchingConfig = data.matching_config as { logo_url?: string; survey_question?: string; show_refresh_button?: boolean } | null
      let logoUrlFromDb = matchingConfig?.logo_url || null
      console.log('Loading event - matching_config:', data.matching_config)
      console.log('Loading logo URL from database:', logoUrlFromDb)

      // Load survey question (optional)
      setSurveyQuestion(matchingConfig?.survey_question || "")
      
      // Load show_refresh_button setting
      setShowRefreshButton(matchingConfig?.show_refresh_button ?? false)
      
      // If no logo in database, check bucket for existing logo files
      if (!logoUrlFromDb) {
        try {
          const { data: files, error: listError } = await supabase.storage
            .from('event-assets')
            .list(eventId, {
              sortBy: { column: 'created_at', order: 'desc' },
              limit: 10
            })

          if (!listError && files && files.length > 0) {
            // Find the most recent logo file
            const latestLogo = files.find(f => f.name.startsWith('logo-')) || files[0]
            if (latestLogo) {
              const logoPath = `${eventId}/${latestLogo.name}`
              const { data: urlData } = supabase.storage
                .from('event-assets')
                .getPublicUrl(logoPath)
              
              logoUrlFromDb = urlData.publicUrl
              console.log('Found logo in bucket, auto-setting:', logoUrlFromDb)
              
              // Update database with the logo URL
              const updatedConfig = {
                ...(matchingConfig || {}),
                logo_url: logoUrlFromDb
              }
              
              await supabase
                .from('events')
                .update({
                  matching_config: updatedConfig
                })
                .eq('event_id', eventId)
              
              console.log('Auto-saved logo URL to database')
            }
          }
        } catch (error) {
          console.error('Error checking bucket for logo:', error)
          // Don't fail the page load if bucket check fails
        }
      }
      
      console.log('Final logo URL:', logoUrlFromDb)
      setLogoUrl(logoUrlFromDb)
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
      const updatedConfig = {
        ...currentConfig,
        logo_url: newLogoUrl
      }
      
      console.log('Updating matching_config with:', updatedConfig)
      
      const { error: updateError } = await supabase
        .from('events')
        .update({
          matching_config: updatedConfig
        })
        .eq('event_id', eventId)

      if (updateError) {
        console.error('Error updating logo URL:', updateError)
        toast.error('Failed to save logo URL')
        return
      }

      console.log('Database update successful. Updated matching_config:', updatedConfig)
      
      // Verify the update by reading it back
      const { data: verifyData, error: verifyError } = await supabase
        .from('events')
        .select('matching_config')
        .eq('event_id', eventId)
        .single()
      
      if (!verifyError && verifyData) {
        const verifiedLogoUrl = (verifyData.matching_config as { logo_url?: string })?.logo_url
        console.log('Verified logo URL from database:', verifiedLogoUrl)
        if (verifiedLogoUrl !== newLogoUrl) {
          console.warn('Logo URL mismatch! Expected:', newLogoUrl, 'Got:', verifiedLogoUrl)
        }
      }
      
      // Update state immediately so user sees the logo
      setLogoUrl(newLogoUrl)
      console.log('logoUrl state set to:', newLogoUrl)
      
      // Update local event state
      setEvent({
        ...event,
        matching_config: updatedConfig
      })
      
      // Clear the file input after successful upload
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
      toast.success('Logo uploaded successfully!')
      
      // Don't reload immediately - the state is already updated
      // Reloading can cause the logo to disappear if there's a timing issue
    } catch (error) {
      console.error('Error uploading logo:', error)
      toast.error('Failed to upload logo')
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleSetLogoFromBucket = async () => {
    if (!event) return
    
    setIsUploadingLogo(true)
    try {
      // List files in the bucket for this event
      const { data: files, error: listError } = await supabase.storage
        .from('event-assets')
        .list(eventId, {
          sortBy: { column: 'created_at', order: 'desc' },
          limit: 1
        })

      if (listError || !files || files.length === 0) {
        console.error('Error listing files or no files found:', listError)
        toast.error('No logo files found in bucket')
        return
      }

      // Get the most recent logo file
      const latestLogo = files.find(f => f.name.startsWith('logo-')) || files[0]
      const logoPath = `${eventId}/${latestLogo.name}`
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-assets')
        .getPublicUrl(logoPath)

      const logoUrl = urlData.publicUrl
      console.log('Setting logo from bucket:', logoUrl)

      // Update database
      const currentConfig = event.matching_config || {}
      const updatedConfig = {
        ...currentConfig,
        logo_url: logoUrl
      }
      
      const { error: updateError, count } = await supabase
        .from('events')
        .update({
          matching_config: updatedConfig
        })
        .eq('event_id', eventId)
        .select('matching_config')

      if (updateError) {
        console.error('Error updating logo URL:', updateError)
        toast.error('Failed to save logo URL')
        return
      }

      console.log('Database update successful. Rows updated:', count)
      console.log('Logo URL saved to database:', logoUrl)
      
      // Verify the update by reading it back
      const { data: verifyData, error: verifyError } = await supabase
        .from('events')
        .select('matching_config')
        .eq('event_id', eventId)
        .single()
      
      if (!verifyError && verifyData) {
        const verifiedLogoUrl = (verifyData.matching_config as { logo_url?: string })?.logo_url
        console.log('Verified logo URL from database:', verifiedLogoUrl)
        if (verifiedLogoUrl !== logoUrl) {
          console.warn('Logo URL mismatch! Expected:', logoUrl, 'Got:', verifiedLogoUrl)
        }
      }
      
      // Update state immediately
      setLogoUrl(logoUrl)
      setEvent({
        ...event,
        matching_config: updatedConfig
      })
      
      toast.success('Logo set from bucket!')
      
      // Don't reload immediately - let the user see the logo first
      // The state is already updated, so reloading isn't necessary
    } catch (error) {
      console.error('Error setting logo from bucket:', error)
      toast.error('Failed to set logo from bucket')
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
        if (result.failed > 0) {
          // Show detailed error information for failures
          const failedResults = result.results?.filter((r: any) => !r.success) || []
          const errorMessages = failedResults.map((r: any) => r.error || 'Unknown error').join(', ')
          toast.error(`Sent ${result.sent} networking cards, ${result.failed} failed. Errors: ${errorMessages}`, {
            duration: 10000,
          })
        } else {
          toast.success(`Sent ${result.sent} networking cards`)
        }
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
          toast.error(error.error || 'Failed to update event name')
          setIsSaving(false)
          return
        }
      }

      // Validate JSON
      let parsedSchema
      try {
        parsedSchema = JSON.parse(questionSchema)
      } catch (e) {
        toast.error("Invalid JSON format. Please check your syntax.")
        setIsSaving(false)
        return
      }

      const updatedMatchingConfig = {
        ...(event.matching_config || {}),
        survey_question: surveyQuestion.trim(),
        show_refresh_button: showRefreshButton,
      }

      // Preserve matching_config when updating onboarding_question_schema
      const { error } = await supabase
        .from("events")
        .update({
          onboarding_question_schema: parsedSchema,
          matching_config: updatedMatchingConfig // Preserve matching_config and survey question
        })
        .eq("event_id", eventId)

      if (error) {
        console.error("Error updating event:", error)
        toast.error("Failed to save onboarding questions")
        return
      }

      // Reload event to ensure everything is in sync
      await loadEvent()
      
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
              <div>
                <Label>Event Logo</Label>
                
                {/* Always show logo if it exists, above the upload section */}
                {logoUrl ? (
                  <div className="mt-2 mb-4 p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Current Event Logo
                    </p>
                    <div className="relative inline-block">
                      {/* Use regular img tag to avoid Next.js Image issues */}
                      <img 
                        src={logoUrl} 
                        alt="Event logo" 
                        className="max-w-[200px] max-h-[80px] object-contain border border-border rounded bg-white p-2"
                        onError={(e) => {
                          console.error('Error loading logo image:', logoUrl)
                          console.error('Image error event:', e)
                        }}
                        onLoad={() => {
                          console.log('Logo image loaded successfully:', logoUrl)
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      This logo will appear on networking summary cards (converted to grayscale)
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 mb-4 p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">
                      No logo uploaded yet. Logo URL state: {logoUrl || 'null'}
                    </p>
                  </div>
                )}
                
                {/* Upload section */}
                <div className={logoUrl ? "mt-4" : "mt-2"}>
                  <div className="flex items-center gap-2 mb-2">
                    <Input
                      ref={fileInputRef}
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
                  {!logoUrl && (
                    <GradientButton
                      onClick={handleSetLogoFromBucket}
                      disabled={isUploadingLogo}
                      variant="outline"
                      size="sm"
                      className="mt-2"
                    >
                      Set Logo from Bucket (Use Most Recent)
                    </GradientButton>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {logoUrl 
                      ? "Upload a new logo to replace the current one"
                      : "Upload a logo to display on networking summary cards (will be converted to grayscale)"
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Survey Settings */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle>Post-event Survey</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Set the organizer-defined rating question. Attendees also answer two fixed ratings and one open-ended question after receiving their recap.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="surveyQuestion">Organizer question (5-star rating)</Label>
                <Input
                  id="surveyQuestion"
                  value={surveyQuestion}
                  onChange={(e) => setSurveyQuestion(e.target.value)}
                  placeholder="e.g., How valuable were the connections you made today?"
                  className="mt-1"
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Fixed rating questions:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>How useful is this app in helping you build your network?</li>
                  <li>How likely are you to do business with the interactions it suggested?</li>
                </ul>
                <p>Open question: Who was your most beneficial connection you made at the event?</p>
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
              <div className="flex items-center space-x-3 pt-2 border-t border-border">
                <Checkbox
                  id="show-refresh-button"
                  checked={showRefreshButton}
                  onCheckedChange={(checked) => setShowRefreshButton(checked === true)}
                />
                <Label
                  htmlFor="show-refresh-button"
                  className="text-sm cursor-pointer"
                >
                  Show "Refresh Matches" button to users
                </Label>
              </div>
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
