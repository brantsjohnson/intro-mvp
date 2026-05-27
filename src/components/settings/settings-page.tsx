"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { createClientComponentClient } from "@/lib/supabase"
import { getAvatarUrl } from "@/lib/utils"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { restartGuide } from "@/components/ui/user-guide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface UserProfileSummary {
  firstName: string
  lastName: string
  company: string | null
  jobTitle: string | null
  avatarUrl: string | null
}

interface AttendanceRecord {
  eventId: string
  eventName: string
  needSummary: string
  originalNeedSummary: string
  offerSummary: string
  originalOfferSummary: string
  checkedInAt: string | null
}

// Helper function to convert text to Title Case
function toTitleCase(text: string): string {
  return text.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  })
}

export function SettingsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponentClient(), [])

  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingEvent, setIsSavingEvent] = useState(false)
  const [isPresenceUpdating, setIsPresenceUpdating] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfileSummary | null>(null)
  const [profileDraft, setProfileDraft] = useState<{ company: string; jobTitle: string }>({
    company: "",
    jobTitle: "",
  })
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [originalSelectedEventId, setOriginalSelectedEventId] = useState<string | null>(null)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const selectedAttendance = useMemo(() => {
    return attendanceRecords.find((record) => record.eventId === selectedEventId) ?? null
  }, [attendanceRecords, selectedEventId])

  const isNeedSummaryDirty = Boolean(
    selectedAttendance &&
      selectedAttendance.needSummary.trim() !== selectedAttendance.originalNeedSummary.trim()
  )

  const isOfferSummaryDirty = Boolean(
    selectedAttendance &&
      selectedAttendance.offerSummary.trim() !== selectedAttendance.originalOfferSummary.trim()
  )

  const isEventSelectionDirty = Boolean(
    selectedEventId && originalSelectedEventId && selectedEventId !== originalSelectedEventId
  )

  const isEventSectionDirty =
    isNeedSummaryDirty || isOfferSummaryDirty || isEventSelectionDirty

  const isProfileDirty = profile
    ? (profile.company ?? "") !== profileDraft.company.trim() ||
      (profile.jobTitle ?? "") !== profileDraft.jobTitle.trim()
    : false

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true)

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) {
        console.error("Failed to load auth user:", authError)
        setIsLoading(false)
        return
      }

      if (!user) {
        router.push("/auth")
        return
      }

      setUserId(user.id)

      const [{ data: userRow, error: userError }, { data: attendanceRows, error: attendanceError }] =
        await Promise.all([
          supabase
            .from("users")
            .select("user_id, first_name, last_name, career_title, company_name, photo_url")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("attendance")
            .select(
              `
                event_id,
                need_summary_final,
                offer_summary_final,
                checked_in_at,
                events:event_id (
                  event_id,
                  event_name
                )
              `
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ])

      if (userError) {
        console.error("Failed to load profile row:", userError)
      } else if (userRow) {
        const avatarUrl = getAvatarUrl(userRow.photo_url)
        console.log('[SettingsPage] Avatar URL conversion:', {
          original: userRow.photo_url,
          originalType: typeof userRow.photo_url,
          converted: avatarUrl,
          convertedType: typeof avatarUrl,
          userId: userRow.user_id,
          isFullUrl: userRow.photo_url?.startsWith('http'),
          isStoragePath: userRow.photo_url && !userRow.photo_url.startsWith('http')
        })
        
        setProfile({
          firstName: userRow.first_name || "",
          lastName: userRow.last_name || "",
          company: userRow.company_name,
          jobTitle: userRow.career_title,
          avatarUrl: avatarUrl,
        })

        setProfileDraft({
          company: userRow.company_name ?? "",
          jobTitle: userRow.career_title ?? "",
        })
      }

      if (attendanceError) {
        console.error("Failed to load attendance rows:", attendanceError)
        setAttendanceRecords([])
        setSelectedEventId(null)
      } else {
        const mapped: AttendanceRecord[] =
          (attendanceRows ?? []).map((row: any) => ({
            eventId: row.event_id,
            eventName: row.events?.event_name ?? "Unnamed event",
            needSummary: row.need_summary_final ?? "",
            originalNeedSummary: row.need_summary_final ?? "",
            offerSummary: row.offer_summary_final ?? "",
            originalOfferSummary: row.offer_summary_final ?? "",
            checkedInAt: row.checked_in_at,
          })) ?? []

        setAttendanceRecords(mapped)

        if (mapped.length === 0) {
          setSelectedEventId(null)
          setOriginalSelectedEventId(null)
        } else {
          // Try to load saved preference from localStorage first
          const savedEventId = typeof window !== 'undefined' 
            ? localStorage.getItem(`current_event_id_${user.id}`)
            : null
          
          const eventIdToSelect = savedEventId && mapped.some((record) => record.eventId === savedEventId)
            ? savedEventId
            : mapped[0].eventId
          
          setSelectedEventId(eventIdToSelect)
          setOriginalSelectedEventId(eventIdToSelect)
        }
      }

      setIsLoading(false)
    }

    void loadSettings()
  }, [router, supabase])

  const handleSaveProfile = async () => {
    if (!userId || !profile) return
    if (!isProfileDirty) {
      return
    }

    const trimmedCompany = profileDraft.company.trim()
    const trimmedJobTitle = profileDraft.jobTitle.trim()

    setIsSavingProfile(true)
    try {
      const { error } = await supabase
        .from("users")
        .update({
          company_name: trimmedCompany.length > 0 ? trimmedCompany : null,
          career_title: trimmedJobTitle.length > 0 ? trimmedJobTitle : null,
        })
        .eq("user_id", userId)

      if (error) {
        console.error("Failed to update profile:", error)
        return
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              company: trimmedCompany.length > 0 ? trimmedCompany : null,
              jobTitle: trimmedJobTitle.length > 0 ? trimmedJobTitle : null,
            }
          : prev
      )

      setProfileDraft({
        company: trimmedCompany,
        jobTitle: trimmedJobTitle,
      })

    } catch (error) {
      console.error("Unexpected error updating profile:", error)
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleTogglePresence = async () => {
    if (!userId || !selectedAttendance) return

    const nextCheckedInAt = selectedAttendance.checkedInAt ? null : new Date().toISOString()

    setIsPresenceUpdating(true)
    try {
      const { error } = await supabase
        .from("attendance")
        .update({
          checked_in_at: nextCheckedInAt,
          last_seen_at: nextCheckedInAt,
        })
        .eq("user_id", userId)
        .eq("event_id", selectedAttendance.eventId)

      if (error) {
        console.error("Failed to toggle presence:", error)
        return
      }

      setAttendanceRecords((records) =>
        records.map((record) =>
          record.eventId === selectedAttendance.eventId
            ? { ...record, checkedInAt: nextCheckedInAt }
            : record
        )
      )

    } catch (error) {
      console.error("Unexpected error toggling presence:", error)
    } finally {
      setIsPresenceUpdating(false)
    }
  }

  const handleNeedSummaryChange = (value: string) => {
    if (!selectedAttendance) return
    setAttendanceRecords((records) =>
      records.map((record) =>
        record.eventId === selectedAttendance.eventId
          ? { ...record, needSummary: value }
          : record
      )
    )
  }

  const handleOfferSummaryChange = (value: string) => {
    if (!selectedAttendance) return
    setAttendanceRecords((records) =>
      records.map((record) =>
        record.eventId === selectedAttendance.eventId
          ? { ...record, offerSummary: value }
          : record
      )
    )
  }

  const handleResetEventSection = () => {
    if (!selectedAttendance) return

    setAttendanceRecords((records) =>
      records.map((record) =>
        record.eventId === selectedAttendance.eventId
          ? {
              ...record,
              needSummary: record.originalNeedSummary,
              offerSummary: record.originalOfferSummary,
            }
          : record
      )
    )
  }

  const handleSaveEventSection = async () => {
    if (!userId || !selectedAttendance) {
      toast.error("Unable to save: user or event not found")
      return
    }
    if (!isEventSectionDirty) {
      toast.info("No changes to save")
      return
    }

    const trimmedNeedSummary = selectedAttendance.needSummary.trim()
    const trimmedOfferSummary = selectedAttendance.offerSummary.trim()

    setIsSavingEvent(true)
    try {
      // Save any dirty event-text fields together in one UPDATE
      if (isNeedSummaryDirty || isOfferSummaryDirty) {
        const updatePayload: Record<string, unknown> = {
          last_profile_change_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        if (isNeedSummaryDirty) {
          updatePayload.need_summary_final =
            trimmedNeedSummary.length > 0 ? trimmedNeedSummary : null
        }
        if (isOfferSummaryDirty) {
          updatePayload.offer_summary_final =
            trimmedOfferSummary.length > 0 ? trimmedOfferSummary : null
        }

        const { error } = await supabase
          .from("attendance")
          .update(updatePayload)
          .eq("user_id", userId)
          .eq("event_id", selectedAttendance.eventId)

        if (error) {
          console.error("Failed to update event text fields:", error)
          toast.error("Failed to save. Please try again.")
          setIsSavingEvent(false)
          return
        }
      }

      // Save event preference if event selection changed
      if (isEventSelectionDirty && selectedEventId) {
        // Store in localStorage for immediate access
        if (typeof window !== 'undefined') {
          localStorage.setItem(`current_event_id_${userId}`, selectedEventId)
        }
        
        // Also try to store in users table if there's a current_event_id column
        // (This will silently fail if the column doesn't exist, which is fine)
        try {
          await supabase
            .from("users")
            .update({ 
              current_event_id: selectedEventId 
            } as any)
            .eq("user_id", userId)
        } catch (err) {
          // Column might not exist, that's okay - localStorage is the fallback
          console.log("Note: current_event_id column may not exist in users table")
        }
        
        // Update original to reflect the save
        setOriginalSelectedEventId(selectedEventId)
      }

      // Show success feedback
      if (isEventSelectionDirty && (isNeedSummaryDirty || isOfferSummaryDirty)) {
        toast.success("Event switched and changes saved!")
      } else if (isEventSelectionDirty) {
        toast.success(`Switched to ${selectedAttendance.eventName}!`)
      } else {
        toast.success("Saved successfully!")
      }

      // Update local state
      setAttendanceRecords((records) =>
        records.map((record) =>
          record.eventId === selectedAttendance.eventId
            ? {
                ...record,
                needSummary: trimmedNeedSummary,
                originalNeedSummary: trimmedNeedSummary,
                offerSummary: trimmedOfferSummary,
                originalOfferSummary: trimmedOfferSummary,
              }
            : record
        )
      )
      
      // Reset dirty flags
      if (isEventSelectionDirty) {
        setOriginalSelectedEventId(selectedEventId)
      }


      if (selectedAttendance.eventId && userId) {
        toast.promise(
          (async () => {
            const deriveResponse = await fetch("/api/derive-attendance", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                eventId: selectedAttendance.eventId,
                userId,
              }),
            })

            if (!deriveResponse.ok) {
              const details = await deriveResponse.text()
              throw new Error(`derive failed: ${details}`)
            }

            const refreshResponse = await fetch("/api/refresh-matches", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                eventId: selectedAttendance.eventId,
                newUserId: userId,
              }),
            })

            if (!refreshResponse.ok) {
              const details = await refreshResponse.text()
              throw new Error(`refresh failed: ${details}`)
            }
          })(),
          {
            loading: "Refreshing matches with your updated info…",
            success: "Your matches will reflect your updates shortly.",
            error:
              "Saved your update, but we couldn’t refresh matches automatically. We’ll try again soon.",
          }
        )
      }
    } catch (updateError) {
      console.error("Unexpected error updating event section:", updateError)
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setIsSavingEvent(false)
    }
  }

  const handleAddEvent = () => {
    haptics.light()
    router.push("/event/join")
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await supabase.auth.signOut()
      router.push("/auth")
    } catch (error) {
      console.error("Error signing out:", error)
      setIsLoggingOut(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Loading your settings…</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-none bg-black/60 text-center text-white shadow-lg">
          <CardHeader>
            <CardTitle>Profile not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-white/70">
            <p>We couldn’t find your profile details. Please complete onboarding to continue.</p>
            <Button onClick={() => router.push("/onboarding")}>Go to onboarding</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <button
              aria-label="Go back"
              onClick={() => router.back()}
              className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-elevation transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary bg-primary"
            >
              <ArrowLeft className="h-6 w-6 text-white" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-lg font-semibold text-foreground sm:text-xl" style={{ textTransform: 'none' }}>
                {toTitleCase("Profile Settings")}
              </h1>
            </div>
            <div className="h-10 w-10" />
          </div>
        </div>
      </header>

      <main className="mx-auto mt-4 flex max-w-2xl flex-col gap-4 px-4 pb-20">
        <Card className="bg-card border-border shadow-elevation">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <PresenceAvatar
              src={profile.avatarUrl || undefined}
              fallback={`${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`}
              isPresent={Boolean(selectedAttendance?.checkedInAt)}
              size="xl"
              className="h-24 w-24"
            />
            <div className="flex-1 space-y-2">
              <div className="space-y-0">
                <h2 className="text-lg font-semibold text-foreground leading-tight" style={{ textTransform: 'none' }}>
                  {toTitleCase(profile.firstName)}
                </h2>
                <h2 className="text-lg font-semibold text-foreground leading-tight" style={{ textTransform: 'none' }}>
                  {toTitleCase(profile.lastName)}
                </h2>
              </div>
              <div className="text-sm text-muted-foreground">
                {profile.jobTitle || profile.company ? (
                  <p style={{ textTransform: 'none' }}>
                    <span className="font-semibold text-foreground">
                      {profile.jobTitle ? toTitleCase(profile.jobTitle) : "Job title not set"}
                    </span>
                    {profile.jobTitle && profile.company && " | "}
                    {profile.company && <span>{toTitleCase(profile.company)}</span>}
                  </p>
                ) : (
                  <p style={{ textTransform: 'none' }}>Job title and company not set</p>
                )}
              </div>
            </div>
            {selectedAttendance && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground" style={{ textTransform: 'none' }}>
                  Status: <span className="font-medium text-foreground">{selectedAttendance.checkedInAt ? "Here" : "Away"}</span>
                </span>
                <button
                  onClick={handleTogglePresence}
                  disabled={isPresenceUpdating}
                  className="relative inline-flex h-6 w-11 items-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: selectedAttendance.checkedInAt ? "#4B915A" : "#D1D1D1",
                  }}
                  aria-label={selectedAttendance.checkedInAt ? "Mark as away" : "Mark as here"}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-xl bg-white transition-transform ${
                      selectedAttendance.checkedInAt ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-elevation">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2">
              <div>
                <CardTitle className="text-base font-semibold text-foreground" style={{ textTransform: 'none' }}>
                  {toTitleCase("About")}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-body" style={{ textTransform: 'none' }}>
                  {toTitleCase("Keep your headline up to date")}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-title text-foreground">
                {toTitleCase("Company")}
              </Label>
              <Input
                value={profileDraft.company}
                onChange={(event) =>
                  setProfileDraft((draft) => ({ ...draft, company: event.target.value }))
                }
                placeholder="Where do you work?"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-title text-foreground">
                {toTitleCase("Job Title")}
              </Label>
              <Input
                value={profileDraft.jobTitle}
                onChange={(event) =>
                  setProfileDraft((draft) => ({ ...draft, jobTitle: event.target.value }))
                }
                placeholder="What’s your role?"
              />
              <div className="flex items-center justify-end gap-3 mt-2">
                <Button
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={!isProfileDirty || isSavingProfile}
                  className="bg-primary text-primary-foreground hover:opacity-90"
                >
                  {isSavingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save profile
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-elevation">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold text-foreground" style={{ textTransform: 'none' }}>
                {toTitleCase("Current event")}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="border-accent/40 bg-transparent text-accent hover:bg-accent/10"
                onClick={handleAddEvent}
              >
                + Add an event
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 space-y-4">
            {attendanceRecords.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                You haven’t joined any events yet. Add an event to share what you’re looking for so
                we can start matching you.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-title text-foreground">
                    {toTitleCase("Change event")}
                  </Label>
                  <Select
                    value={selectedEventId ?? undefined}
                    onValueChange={(value) => {
                      console.log("Switching to event:", value)
                      const newEvent = attendanceRecords.find(r => r.eventId === value)
                      setSelectedEventId(value)
                      if (newEvent) {
                        toast.info(`Selected ${newEvent.eventName}. Click "Save changes" to switch.`)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {attendanceRecords.map((record) => (
                        <SelectItem 
                          value={record.eventId} 
                          key={record.eventId} 
                          style={{ textTransform: 'none' }}
                          className="bg-popover hover:bg-accent"
                        >
                          {toTitleCase(record.eventName)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAttendance && (
                  <div className="space-y-5">
                    {isEventSectionDirty && (
                      <div className="flex justify-end">
                        <span className="text-xs font-medium text-primary">
                          {isEventSelectionDirty &&
                          (isNeedSummaryDirty || isOfferSummaryDirty)
                            ? "Unsaved changes"
                            : isEventSelectionDirty
                            ? "Event switch pending"
                            : "Unsaved changes"}
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h3
                        className="text-sm font-medium text-foreground font-body"
                        style={{ textTransform: "none" }}
                      >
                        {toTitleCase("Why you’re attending")}
                      </h3>
                      <p
                        className="text-xs text-muted-foreground"
                        style={{ textTransform: "none" }}
                      >
                        Pulled from your onboarding answers. Edit to refine what we use for matching.
                      </p>
                      <Textarea
                        value={selectedAttendance.needSummary}
                        onChange={(event) => handleNeedSummaryChange(event.target.value)}
                        placeholder="What you’re looking for at this event (complete onboarding to auto-fill, or write it here)…"
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <h3
                        className="text-sm font-medium text-foreground font-body"
                        style={{ textTransform: "none" }}
                      >
                        {toTitleCase("What you can offer")}
                      </h3>
                      <p
                        className="text-xs text-muted-foreground"
                        style={{ textTransform: "none" }}
                      >
                        How others can benefit from talking to you. Used to match you to people who need what you offer.
                      </p>
                      <Textarea
                        value={selectedAttendance.offerSummary}
                        onChange={(event) => handleOfferSummaryChange(event.target.value)}
                        placeholder="What you can help others with at this event…"
                        rows={4}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isEventSectionDirty || isSavingEvent}
                        onClick={() => {
                          if (isNeedSummaryDirty || isOfferSummaryDirty) {
                            handleResetEventSection()
                          }
                          if (isEventSelectionDirty && originalSelectedEventId) {
                            setSelectedEventId(originalSelectedEventId)
                            toast.info("Event selection reset")
                          }
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEventSection}
                        disabled={!isEventSectionDirty || isSavingEvent}
                        className="bg-primary text-primary-foreground hover:opacity-90"
                      >
                        {isSavingEvent ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Redo Onboarding Guide Button */}
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => {
              restartGuide("intro-homepage-guide-completed")
            }}
            className="border-border text-foreground hover:bg-card/80"
            style={{ textTransform: 'none' }}
          >
            {toTitleCase("Redo Onboarding Guide")}
          </Button>
        </div>

        {/* Logout Button */}
        <div className="flex justify-center pb-8">
          <Button
            variant="outline"
            onClick={() => setShowLogoutDialog(true)}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            style={{ textTransform: 'none' }}
          >
            {toTitleCase("Log out")}
          </Button>
        </div>
      </main>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ textTransform: 'none' }}>
              Log out?
            </DialogTitle>
            <DialogDescription style={{ textTransform: 'none' }}>
              Are you sure you want to log out? You'll need to sign in again to access your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              disabled={isLoggingOut}
              style={{ textTransform: 'none' }}
            >
              {toTitleCase("Cancel")}
            </Button>
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              style={{ textTransform: 'none' }}
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {toTitleCase("Logging out...")}
                </>
              ) : (
                toTitleCase("Log out")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

