"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventQRCodeService } from "@/lib/event-qr-service"
import type { EventHealthMetrics } from "@/lib/platform-admin-metrics"
import { createClientComponentClient } from "@/lib/supabase"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  ArrowLeft,
  Save,
  Users,
  Play,
  Copy,
  QrCode,
  Link as LinkIcon,
  Mail,
  Activity,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import Image from "next/image"

interface Event {
  event_id: string
  event_code: string
  event_name: string
  event_location: string | null
  event_starts_at: string | null
  event_ends_at: string | null
  event_description: string | null
  onboarding_question_schema: any
  matching_config: any
}

interface PortalOrganizerPerson {
  user_id: string
  display: string
  email: string | null
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
  const [editedEventDescription, setEditedEventDescription] = useState<string>("")

  // QR / join link
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string>("")

  // Logo + survey + flags
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [surveyQuestion, setSurveyQuestion] = useState<string>("")
  const [showRefreshButton, setShowRefreshButton] = useState<boolean>(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isSendingCards, setIsSendingCards] = useState(false)
  const [eventHealth, setEventHealth] = useState<EventHealthMetrics | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const [portalOrganizers, setPortalOrganizers] = useState<PortalOrganizerPerson[]>([])
  const [portalEligible, setPortalEligible] = useState<PortalOrganizerPerson[]>([])
  const [portalSelectedUserId, setPortalSelectedUserId] = useState<string>("")
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalSaving, setPortalSaving] = useState(false)

  const [sponsorsList, setSponsorsList] = useState<PortalOrganizerPerson[]>([])
  const [sponsorEligible, setSponsorEligible] = useState<PortalOrganizerPerson[]>([])
  const [sponsorSelectedUserId, setSponsorSelectedUserId] = useState<string>("")
  const [sponsorLoading, setSponsorLoading] = useState(false)
  const [sponsorSaving, setSponsorSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClientComponentClient()
  const qrService = new EventQRCodeService()

  useEffect(() => {
    if (eventId) {
      loadEvent()
      loadPortalOrganizers()
      loadSponsors()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (event) {
      loadMatchCount()
      loadEventHealth()
      generateQRCodeAndUrl()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  const generateQRCodeAndUrl = async () => {
    if (!event) return

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.introevent.site"
      const url = qrService.generateEncryptedJoinUrl(event.event_code, baseUrl)
      setJoinUrl(url)

      const qrCode = await qrService.generateEventQRCode(event.event_code, baseUrl)
      if (qrCode) {
        setQrCodeUrl(qrCode)
      }
    } catch (error) {
      console.error("Error generating QR code:", error)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error("Failed to copy:", error)
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
      setEditedEventDescription(data.event_description || "")
      setQuestionSchema(
        data.onboarding_question_schema
          ? JSON.stringify(data.onboarding_question_schema, null, 2)
          : "{}",
      )

      const matchingConfig =
        (data.matching_config as {
          logo_url?: string
          survey_question?: string
          show_refresh_button?: boolean
        } | null) || {}

      let logoUrlFromDb = matchingConfig.logo_url || null
      console.log("Loading event - matching_config:", data.matching_config)
      console.log("Loading logo URL from database:", logoUrlFromDb)

      setSurveyQuestion(matchingConfig.survey_question || "")
      setShowRefreshButton(matchingConfig.show_refresh_button ?? false)

      // If no logo saved in matching_config, try to infer from bucket
      if (!logoUrlFromDb) {
        try {
          const { data: files, error: listError } = await supabase.storage
            .from("event-assets")
            .list(eventId, {
              sortBy: { column: "created_at", order: "desc" },
              limit: 10,
            })

          if (!listError && files && files.length > 0) {
            const latestLogo = files.find((f) => f.name.startsWith("logo-")) || files[0]
            if (latestLogo) {
              const logoPath = `${eventId}/${latestLogo.name}`
              const { data: urlData } = supabase.storage
                .from("event-assets")
                .getPublicUrl(logoPath)

              logoUrlFromDb = urlData.publicUrl
              console.log("Found logo in bucket, auto-setting:", logoUrlFromDb)

              const updatedConfig = {
                ...matchingConfig,
                logo_url: logoUrlFromDb,
              }

              await supabase
                .from("events")
                .update({
                  matching_config: updatedConfig,
                })
                .eq("event_id", eventId)

              console.log("Auto-saved logo URL to database")
            }
          }
        } catch (error) {
          console.error("Error checking bucket for logo:", error)
        }
      }

      console.log("Final logo URL:", logoUrlFromDb)
      setLogoUrl(logoUrlFromDb)
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

  const loadEventHealth = async () => {
    if (!eventId) return
    setHealthLoading(true)
    try {
      const res = await fetch(
        `/api/platform-admin/event-health?eventId=${encodeURIComponent(eventId)}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as EventHealthMetrics
      setEventHealth(data)
    } catch (e) {
      console.error("Error loading event health:", e)
    } finally {
      setHealthLoading(false)
    }
  }

  const loadPortalOrganizers = async () => {
    if (!eventId) return
    setPortalLoading(true)
    try {
      const res = await fetch(
        `/api/platform-admin/event-organizers?eventId=${encodeURIComponent(eventId)}`,
      )
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 503) {
          toast.error(data.error || "event_organizers table missing — run Phase B migration")
        }
        return
      }
      setPortalOrganizers(data.organizers ?? [])
      setPortalEligible(data.eligible_attendees ?? [])
      setPortalSelectedUserId("")
    } catch (e) {
      console.error("Error loading organizers:", e)
    } finally {
      setPortalLoading(false)
    }
  }

  const handleAddPortalOrganizer = async () => {
    if (!eventId || !portalSelectedUserId) return
    setPortalSaving(true)
    try {
      const res = await fetch("/api/platform-admin/event-organizers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId: portalSelectedUserId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to add organizer")
        return
      }
      toast.success("Organizer added — they can use /organizer when signed in")
      await loadPortalOrganizers()
    } catch (e) {
      console.error(e)
      toast.error("Failed to add organizer")
    } finally {
      setPortalSaving(false)
    }
  }

  const handleRemovePortalOrganizer = async (userId: string) => {
    if (!eventId) return
    setPortalSaving(true)
    try {
      const q = new URLSearchParams({ eventId, userId })
      const res = await fetch(`/api/platform-admin/event-organizers?${q}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to remove")
        return
      }
      toast.success("Removed organizer access")
      await loadPortalOrganizers()
    } catch (e) {
      console.error(e)
      toast.error("Failed to remove")
    } finally {
      setPortalSaving(false)
    }
  }

  const loadSponsors = async () => {
    if (!eventId) return
    setSponsorLoading(true)
    try {
      const res = await fetch(
        `/api/platform-admin/event-sponsors?eventId=${encodeURIComponent(eventId)}`,
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to load sponsors")
        return
      }
      setSponsorsList(data.sponsors ?? [])
      setSponsorEligible(data.eligible_attendees ?? [])
      setSponsorSelectedUserId("")
    } catch (e) {
      console.error("Error loading sponsors:", e)
    } finally {
      setSponsorLoading(false)
    }
  }

  const handleAddSponsor = async () => {
    if (!eventId || !sponsorSelectedUserId) return
    setSponsorSaving(true)
    try {
      const res = await fetch("/api/platform-admin/event-sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId: sponsorSelectedUserId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to add sponsor")
        return
      }
      toast.success("Sponsor added — they can use /sponsor when signed in")
      await loadSponsors()
    } catch (e) {
      console.error(e)
      toast.error("Failed to add sponsor")
    } finally {
      setSponsorSaving(false)
    }
  }

  const handleRemoveSponsor = async (userId: string) => {
    if (!eventId) return
    setSponsorSaving(true)
    try {
      const q = new URLSearchParams({ eventId, userId })
      const res = await fetch(`/api/platform-admin/event-sponsors?${q}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to remove sponsor")
        return
      }
      toast.success("Removed sponsor access")
      await loadSponsors()
    } catch (e) {
      console.error(e)
      toast.error("Failed to remove sponsor")
    } finally {
      setSponsorSaving(false)
    }
  }

  const handleStartMatching = async () => {
    if (!event) return

    setIsMatching(true)
    try {
      const response = await fetch("/api/admin-start-matching", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventCode: event.event_code,
          force: true,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setTimeout(() => {
          loadMatchCount()
          loadEventHealth()
        }, 2000)
      } else {
        console.error("Matching error:", result)
      }
    } catch (error) {
      console.error("Error starting matching:", error)
    } finally {
      setIsMatching(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!event) return

    setIsUploadingLogo(true)
    try {
      const fileExt = file.name.split(".").pop()
      const fileName = `${eventId}/logo-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from("event-assets")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) {
        console.error("Error uploading logo:", uploadError)
        toast.error("Failed to upload logo")
        return
      }

      const { data: urlData } = supabase.storage
        .from("event-assets")
        .getPublicUrl(fileName)

      const newLogoUrl = urlData.publicUrl

      const currentConfig = event.matching_config || {}
      const updatedConfig = {
        ...currentConfig,
        logo_url: newLogoUrl,
      }

      console.log("Updating matching_config with:", updatedConfig)

      const { error: updateError } = await supabase
        .from("events")
        .update({
          matching_config: updatedConfig,
        })
        .eq("event_id", eventId)

      if (updateError) {
        console.error("Error updating logo URL:", updateError)
        toast.error("Failed to save logo URL")
        return
      }

      console.log("Database update successful. Updated matching_config:", updatedConfig)

      const { data: verifyData, error: verifyError } = await supabase
        .from("events")
        .select("matching_config")
        .eq("event_id", eventId)
        .single()

      if (!verifyError && verifyData) {
        const verifiedLogoUrl = (verifyData.matching_config as { logo_url?: string })?.logo_url
        console.log("Verified logo URL from database:", verifiedLogoUrl)
      }

      setLogoUrl(newLogoUrl)
      console.log("logoUrl state set to:", newLogoUrl)

      setEvent({
        ...event,
        matching_config: updatedConfig,
      })

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }

      toast.success("Logo uploaded successfully!")
    } catch (error) {
      console.error("Error uploading logo:", error)
      toast.error("Failed to upload logo")
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleSetLogoFromBucket = async () => {
    if (!event) return

    setIsUploadingLogo(true)
    try {
      const { data: files, error: listError } = await supabase.storage
        .from("event-assets")
        .list(eventId, {
          sortBy: { column: "created_at", order: "desc" },
          limit: 1,
        })

      if (listError || !files || files.length === 0) {
        console.error("Error listing files or no files found:", listError)
        toast.error("No logo files found in bucket")
        return
      }

      const latestLogo = files.find((f) => f.name.startsWith("logo-")) || files[0]
      const logoPath = `${eventId}/${latestLogo.name}`

      const { data: urlData } = supabase.storage
        .from("event-assets")
        .getPublicUrl(logoPath)

      const logoUrl = urlData.publicUrl
      console.log("Setting logo from bucket:", logoUrl)

      const currentConfig = event.matching_config || {}
      const updatedConfig = {
        ...currentConfig,
        logo_url: logoUrl,
      }

      const { error: updateError } = await supabase
        .from("events")
        .update({
          matching_config: updatedConfig,
        })
        .eq("event_id", eventId)

      if (updateError) {
        console.error("Error updating logo URL:", updateError)
        toast.error("Failed to save logo URL")
        return
      }

      console.log("Logo URL saved to database:", logoUrl)

      const { data: verifyData, error: verifyError } = await supabase
        .from("events")
        .select("matching_config")
        .eq("event_id", eventId)
        .single()

      if (!verifyError && verifyData) {
        const verifiedLogoUrl = (verifyData.matching_config as { logo_url?: string })?.logo_url
        console.log("Verified logo URL from database:", verifiedLogoUrl)
      }

      setLogoUrl(logoUrl)
      setEvent({
        ...event,
        matching_config: updatedConfig,
      })

      toast.success("Logo set from bucket!")
    } catch (error) {
      console.error("Error setting logo from bucket:", error)
      toast.error("Failed to set logo from bucket")
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleSendNetworkingCards = async () => {
    if (!event) return

    setIsSendingCards(true)
    try {
      const response = await fetch("/api/admin-send-networking-cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: event.event_id,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        if (result.failed > 0) {
          const failedResults = result.results?.filter((r: any) => !r.success) || []
          const errorMessages = failedResults
            .map((r: any) => r.error || "Unknown error")
            .join(", ")
          toast.error(
            `Sent ${result.sent} networking cards, ${result.failed} failed. Errors: ${errorMessages}`,
            { duration: 10000 },
          )
        } else {
          toast.success(`Sent ${result.sent} networking cards`)
        }
      } else {
        toast.error(result.error || "Failed to send networking cards")
      }
    } catch (error) {
      console.error("Error sending networking cards:", error)
      toast.error("Failed to send networking cards")
    } finally {
      setIsSendingCards(false)
    }
  }

  const handleSave = async () => {
    if (!event) return

    setIsSaving(true)
    try {
      const nameChanged = editedEventName !== event.event_name
      const descriptionChanged =
        (editedEventDescription || "") !== (event.event_description || "")
      if (nameChanged || descriptionChanged) {
        const updateResponse = await fetch("/api/update-event", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventId: event.event_id,
            ...(nameChanged ? { eventName: editedEventName } : {}),
            ...(descriptionChanged
              ? { eventDescription: editedEventDescription }
              : {}),
          }),
        })

        if (!updateResponse.ok) {
          await updateResponse.json()
          setIsSaving(false)
          return
        }
      }

      let parsedSchema
      try {
        parsedSchema = JSON.parse(questionSchema)
      } catch (e) {
        console.error("Invalid JSON schema:", e)
        setIsSaving(false)
        return
      }

      const updatedMatchingConfig = {
        ...(event.matching_config || {}),
        survey_question: surveyQuestion.trim(),
        show_refresh_button: showRefreshButton,
      }

      const { error } = await supabase
        .from("events")
        .update({
          onboarding_question_schema: parsedSchema,
          matching_config: updatedMatchingConfig,
        })
        .eq("event_id", eventId)

      if (error) {
        console.error("Error updating event:", error)
        setIsSaving(false)
        return
      }

      await loadEvent()
      toast.success("Onboarding questions saved successfully!")
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
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
              <GradientButton onClick={() => router.back()} variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </GradientButton>
              <div className="ml-4">
                <h1 className="text-lg font-semibold text-foreground">
                  Edit Event: {event.event_name}
                </h1>
                <p className="text-sm text-muted-foreground">Event Code: {event.event_code}</p>
              </div>
            </div>
            <GradientButton onClick={handleSave} disabled={isSaving}>
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
                <Label htmlFor="eventDescription">Event Description</Label>
                <Textarea
                  id="eventDescription"
                  value={editedEventDescription}
                  onChange={(e) => setEditedEventDescription(e.target.value)}
                  placeholder="What is this event actually about? Include the theme, main topics or sessions, intended audience, and anything else that should ground the onboarding AI's follow-up questions (e.g. so it asks about sessions that actually exist instead of inventing topics)."
                  className="mt-1 min-h-[160px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used by the onboarding AI as ground truth for event-anchored follow-up
                  questions (topics, sessions, audience). Leave blank to fall back to a generic
                  clarifier.
                </p>
              </div>
              <div>
                <Label>Event Logo</Label>

                {logoUrl ? (
                  <div className="mt-2 mb-4 p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Current Event Logo
                    </p>
                    <div className="relative inline-block">
                      <img
                        src={logoUrl}
                        alt="Event logo"
                        className="max-w-[200px] max-h-[80px] object-contain border border-border rounded bg-white p-2"
                        onError={(e) => {
                          console.error("Error loading logo image:", logoUrl)
                          console.error("Image error event:", e)
                        }}
                        onLoad={() => {
                          console.log("Logo image loaded successfully:", logoUrl)
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
                      No logo uploaded yet. Logo URL state: {logoUrl || "null"}
                    </p>
                  </div>
                )}

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
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
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
                      : "Upload a logo to display on networking summary cards (will be converted to grayscale)"}
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
                Set the organizer-defined rating question. Attendees also answer two fixed ratings
                and one open-ended question after receiving their recap.
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

          {/* Custom Join Link & QR Code */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Custom Join Link & QR Code
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Share this link or QR code to allow users to automatically join the event. Users
                will skip the join page and be added directly.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Join Link</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={joinUrl} readOnly className="font-mono text-sm" />
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
                  Click the copy button to share this link. Users clicking it will automatically
                  join the event.
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
                      const link = document.createElement("a")
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

          {/* Event health (category-correct metrics — see docs/supabase-categories-reference.md) */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5" />
                Event health
              </CardTitle>
              <GradientButton variant="outline" size="sm" onClick={loadEventHealth} disabled={healthLoading}>
                {healthLoading ? "Refreshing..." : "Refresh"}
              </GradientButton>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {!eventHealth && healthLoading ? (
                <p className="text-muted-foreground">Loading metrics…</p>
              ) : !eventHealth ? (
                <p className="text-muted-foreground">No metrics loaded.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Attendees (attendance rows)</p>
                      <p className="text-lg font-semibold">{eventHealth.attendance_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        AI matches (connection_kind = system_match)
                      </p>
                      <p className="text-lg font-semibold">{eventHealth.system_match_count}</p>
                    </div>
                  </div>
                  {Object.keys(eventHealth.connections_by_kind).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Connections by kind
                      </p>
                      <ul className="text-xs space-y-0.5 font-mono">
                        {Object.entries(eventHealth.connections_by_kind)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => (
                            <li key={k}>
                              {k}: {v}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {Object.keys(eventHealth.connections_by_user_add_method).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        User add methods (non-null user_add_method)
                      </p>
                      <ul className="text-xs space-y-0.5 font-mono">
                        {Object.entries(eventHealth.connections_by_user_add_method)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => (
                            <li key={k}>
                              {k}: {v}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {Object.keys(eventHealth.connection_types_selected_counts).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Attendee intent (connection_types_selected, DB values)
                      </p>
                      <ul className="text-xs space-y-0.5 font-mono max-h-40 overflow-y-auto">
                        {Object.entries(eventHealth.connection_types_selected_counts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => (
                            <li key={k}>
                              {k}: {v}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Organizer portal access (Phase B) — pick from attendees */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5" />
                Organizer portal (/organizer)
              </CardTitle>
              <GradientButton
                variant="outline"
                size="sm"
                onClick={loadPortalOrganizers}
                disabled={portalLoading}
              >
                {portalLoading ? "Loading…" : "Refresh"}
              </GradientButton>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-muted-foreground">
                People listed here can open the read-only organizer dashboard for this event after
                they sign in. Choices are{" "}
                <strong>attendees only</strong> (so they already have a profile row). To grant
                access to someone who has not joined yet, use Supabase SQL or Table Editor on{" "}
                <code className="rounded bg-muted px-1">event_organizers</code>.
              </p>
              {portalOrganizers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Current organizers</p>
                  <ul className="space-y-2">
                    {portalOrganizers.map((p) => (
                      <li
                        key={p.user_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-[calc(0.75rem+var(--concave-surface-inset))] py-[calc(0.5rem+var(--concave-surface-inset))]"
                      >
                        <div>
                          <span className="font-medium">{p.display}</span>
                          {p.email && (
                            <span className="text-muted-foreground text-xs ml-2">{p.email}</span>
                          )}
                        </div>
                        <GradientButton
                          variant="outline"
                          size="sm"
                          disabled={portalSaving}
                          onClick={() => handleRemovePortalOrganizer(p.user_id)}
                        >
                          Remove
                        </GradientButton>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {portalEligible.length > 0 ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Add from attendees</Label>
                    <Select
                      value={portalSelectedUserId || undefined}
                      onValueChange={setPortalSelectedUserId}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder="Select attendee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {portalEligible.map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.display}
                            {p.email ? ` (${p.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <GradientButton
                    onClick={handleAddPortalOrganizer}
                    disabled={!portalSelectedUserId || portalSaving}
                  >
                    Add organizer
                  </GradientButton>
                </div>
              ) : (
                portalOrganizers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No attendees yet (or migration not applied). Organizers can be added once
                    people join this event.
                  </p>
                )
              )}
              {portalOrganizers.length > 0 && portalEligible.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every attendee is already an organizer, or there are no other attendees to add.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sponsor portal access (Phase C) */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5" />
                Sponsor portal (/sponsor)
              </CardTitle>
              <GradientButton
                variant="outline"
                size="sm"
                onClick={loadSponsors}
                disabled={sponsorLoading}
              >
                {sponsorLoading ? "Loading…" : "Refresh"}
              </GradientButton>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-muted-foreground">
                Sponsors get a read-only dashboard with aggregated attendee need/want signals and
                their own <strong>system_match</strong> rows. Only people who already have an{" "}
                <code className="rounded bg-muted px-1">attendance</code> row can be marked.
              </p>
              {sponsorsList.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Current sponsors
                  </p>
                  <ul className="space-y-2">
                    {sponsorsList.map((p) => (
                      <li
                        key={p.user_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-[calc(0.75rem+var(--concave-surface-inset))] py-[calc(0.5rem+var(--concave-surface-inset))]"
                      >
                        <div>
                          <span className="font-medium">{p.display}</span>
                          {p.email && (
                            <span className="ml-2 text-xs text-muted-foreground">{p.email}</span>
                          )}
                        </div>
                        <GradientButton
                          variant="outline"
                          size="sm"
                          disabled={sponsorSaving}
                          onClick={() => handleRemoveSponsor(p.user_id)}
                        >
                          Remove
                        </GradientButton>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sponsorEligible.length > 0 ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Add from attendees</Label>
                    <Select
                      value={sponsorSelectedUserId || undefined}
                      onValueChange={setSponsorSelectedUserId}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder="Select attendee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sponsorEligible.map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.display}
                            {p.email ? ` (${p.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <GradientButton
                    onClick={handleAddSponsor}
                    disabled={!sponsorSelectedUserId || sponsorSaving}
                  >
                    Add sponsor
                  </GradientButton>
                </div>
              ) : (
                sponsorsList.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No attendees yet. Sponsors can be added once people join this event.
                  </p>
                )
              )}
              {sponsorsList.length > 0 && sponsorEligible.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every attendee is already a sponsor, or there are no other attendees to add.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Matching */}
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
                    <p className="text-sm font-medium mt-1">Current matches: {matchCount}</p>
                  )}
                </div>
                <GradientButton onClick={handleStartMatching} disabled={isMatching}>
                  <Play className="h-4 w-4 mr-2" />
                  {isMatching ? "Running..." : "Start Matching"}
                </GradientButton>
              </div>
              <p className="text-xs text-muted-foreground">
                This will match all users in the event using vector similarity, shared interests,
                and career proximity.
              </p>
              <div className="flex items-center space-x-3 pt-2 border-t border-border">
                <Checkbox
                  id="show-refresh-button"
                  checked={showRefreshButton}
                  onCheckedChange={(checked) => setShowRefreshButton(checked === true)}
                />
                <Label htmlFor="show-refresh-button" className="text-sm cursor-pointer">
                  Show &quot;Refresh Matches&quot; button to users
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Networking Cards */}
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
                <GradientButton onClick={handleSendNetworkingCards} disabled={isSendingCards}>
                  <Mail className="h-4 w-4 mr-2" />
                  {isSendingCards ? "Sending..." : "Send Cards"}
                </GradientButton>
              </div>
            </CardContent>
          </Card>

          {/* Onboarding Questions */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle>Onboarding Questions Schema</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Configure the onboarding questions for this event. This is a JSON schema that
                defines the adaptive Q&amp;A questions.
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
                  Edit the JSON schema to customize onboarding questions. The schema will be
                  validated before saving.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
