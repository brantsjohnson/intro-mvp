"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { createClientComponentClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

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
  businessNeed: string
  originalBusinessNeed: string
  checkedInAt: string | null
}

export function SettingsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponentClient(), [])

  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingBusinessNeed, setIsSavingBusinessNeed] = useState(false)
  const [isPresenceUpdating, setIsPresenceUpdating] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfileSummary | null>(null)
  const [profileDraft, setProfileDraft] = useState<{ company: string; jobTitle: string }>({
    company: "",
    jobTitle: "",
  })
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const selectedAttendance = useMemo(() => {
    return attendanceRecords.find((record) => record.eventId === selectedEventId) ?? null
  }, [attendanceRecords, selectedEventId])

  const isBusinessNeedDirty = Boolean(
    selectedAttendance &&
      selectedAttendance.businessNeed.trim() !== selectedAttendance.originalBusinessNeed.trim()
  )

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
        toast.error("We couldn’t load your profile. Please refresh and try again.")
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
                business_need_text,
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
        toast.error("We couldn’t load your profile details. Please try again.")
      } else if (userRow) {
        setProfile({
          firstName: userRow.first_name || "",
          lastName: userRow.last_name || "",
          company: userRow.company_name,
          jobTitle: userRow.career_title,
          avatarUrl: userRow.photo_url,
        })

        setProfileDraft({
          company: userRow.company_name ?? "",
          jobTitle: userRow.career_title ?? "",
        })
      }

      if (attendanceError) {
        console.error("Failed to load attendance rows:", attendanceError)
        toast.error("We couldn’t load your event preferences right now.")
        setAttendanceRecords([])
        setSelectedEventId(null)
      } else {
        const mapped: AttendanceRecord[] =
          (attendanceRows ?? []).map((row: any) => ({
            eventId: row.event_id,
            eventName: row.events?.event_name ?? "Unnamed event",
            businessNeed: row.business_need_text ?? "",
            originalBusinessNeed: row.business_need_text ?? "",
            checkedInAt: row.checked_in_at,
          })) ?? []

        setAttendanceRecords(mapped)

        if (mapped.length === 0) {
          setSelectedEventId(null)
        } else {
          setSelectedEventId((prev) => {
            if (prev && mapped.some((record) => record.eventId === prev)) {
              return prev
            }
            return mapped[0].eventId
          })
        }
      }

      setIsLoading(false)
    }

    void loadSettings()
  }, [router, supabase])

  const handleSaveProfile = async () => {
    if (!userId || !profile) return
    if (!isProfileDirty) {
      toast.info("No profile changes to save.")
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
        toast.error("We couldn’t update your profile. Please try again.")
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

      toast.success("Profile saved.")
    } catch (error) {
      console.error("Unexpected error updating profile:", error)
      toast.error("Something went wrong while saving. Please try again.")
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
        toast.error("We couldn’t update your presence. Please try again.")
        return
      }

      setAttendanceRecords((records) =>
        records.map((record) =>
          record.eventId === selectedAttendance.eventId
            ? { ...record, checkedInAt: nextCheckedInAt }
            : record
        )
      )

      toast.success(
        nextCheckedInAt ? "You’re now marked as here." : "You’re no longer marked as here."
      )
    } catch (error) {
      console.error("Unexpected error toggling presence:", error)
      toast.error("Something went wrong while updating presence.")
    } finally {
      setIsPresenceUpdating(false)
    }
  }

  const handleBusinessNeedChange = (value: string) => {
    if (!selectedAttendance) return

    setAttendanceRecords((records) =>
      records.map((record) =>
        record.eventId === selectedAttendance.eventId
          ? { ...record, businessNeed: value }
          : record
      )
    )
  }

  const handleResetBusinessNeed = () => {
    if (!selectedAttendance) return

    setAttendanceRecords((records) =>
      records.map((record) =>
        record.eventId === selectedAttendance.eventId
          ? { ...record, businessNeed: record.originalBusinessNeed }
          : record
      )
    )
  }

  const handleSaveBusinessNeed = async () => {
    if (!userId || !selectedAttendance) return
    if (!isBusinessNeedDirty) {
      toast.info("No changes to save.")
      return
    }

    const trimmedNeed = selectedAttendance.businessNeed.trim()

    setIsSavingBusinessNeed(true)
    try {
      const { error } = await supabase
        .from("attendance")
        .update({
          business_need_text: trimmedNeed.length > 0 ? trimmedNeed : null,
          last_profile_change_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("event_id", selectedAttendance.eventId)

      if (error) {
        console.error("Failed to update business need:", error)
        toast.error("We couldn’t update your business need. Please try again.")
        return
      }

      setAttendanceRecords((records) =>
        records.map((record) =>
          record.eventId === selectedAttendance.eventId
            ? {
                ...record,
                businessNeed: trimmedNeed,
                originalBusinessNeed: trimmedNeed,
              }
            : record
        )
      )

      toast.success("Business need saved.")

      if (selectedAttendance.eventId && userId) {
        void toast.promise(
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
            success: "Your matches will reflect the new business need shortly.",
            error:
              "Saved your update, but we couldn’t refresh matches automatically. We’ll try again soon.",
          }
        )
      }
    } catch (updateError) {
      console.error("Unexpected error updating business need:", updateError)
      toast.error("Something went wrong while saving. Please try again.")
    } finally {
      setIsSavingBusinessNeed(false)
    }
  }

  const handleAddEvent = () => {
    router.push("/event/join")
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
        <Card className="w-full max-w-md border border-border bg-card text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-foreground">Profile not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>We couldn’t find your profile details. Please complete onboarding to continue.</p>
            <Button onClick={() => router.push("/onboarding")}>Go to onboarding</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <button
            aria-label="Go back"
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full shadow-elevation transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary gradient-primary"
          >
            <ArrowLeft className="h-5 w-5 text-primary-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground sm:text-xl">Profile Settings</h1>
          <div className="h-10 w-10" />
        </div>
      </header>

      <main className="mx-auto mt-4 flex max-w-4xl flex-col gap-6 px-4">
        <Card className="bg-card border-border shadow-elevation">
          <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
            <PresenceAvatar
              src={profile.avatarUrl || undefined}
              fallback={`${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`}
              isPresent={Boolean(selectedAttendance?.checkedInAt)}
              size="lg"
            />
            <div className="flex-1 space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">
                {profile.firstName} {profile.lastName}
              </h2>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{profile.jobTitle ?? "Job title not set"}</p>
                <p>{profile.company ?? "Company not set"}</p>
              </div>
              {selectedAttendance && (
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Attending: {selectedAttendance.eventName}
                </p>
              )}
            </div>
            {selectedAttendance && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Presence
                </span>
                <button
                  onClick={handleTogglePresence}
                  disabled={isPresenceUpdating}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-elevation transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4B915A] ${
                    selectedAttendance.checkedInAt ? "text-white" : "text-foreground"
                  }`}
                  style={{
                    background: selectedAttendance.checkedInAt
                      ? "linear-gradient(135deg, #4B915A 0%, #0B3E16 100%)"
                      : "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
                  }}
                >
                  <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-black/20">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: selectedAttendance.checkedInAt ? "#90E29D" : "#D1D1D1",
                      }}
                    />
                  </span>
                  {isPresenceUpdating
                    ? "Updating…"
                    : selectedAttendance.checkedInAt
                      ? "Here"
                    : "Mark as here"}
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-elevation">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">About</CardTitle>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Keep your headline up to date
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleSaveProfile}
                disabled={!isProfileDirty || isSavingProfile}
                className="gradient-primary text-primary-foreground hover:opacity-90"
              >
                {isSavingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save profile
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Company</span>
              <Input
                value={profileDraft.company}
                onChange={(event) =>
                  setProfileDraft((draft) => ({ ...draft, company: event.target.value }))
                }
                placeholder="Where do you work?"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Job Title</span>
              <Input
                value={profileDraft.jobTitle}
                onChange={(event) =>
                  setProfileDraft((draft) => ({ ...draft, jobTitle: event.target.value }))
                }
                placeholder="What’s your role?"
              />
            </label>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-elevation">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold text-foreground">
                Current event
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
          <CardContent className="space-y-4 pt-0">
            {attendanceRecords.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                You haven’t joined any events yet. Add an event to share what you’re looking for so
                we can start matching you.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Change event
                  </label>
                  <Select
                    value={selectedEventId ?? undefined}
                    onValueChange={(value) => setSelectedEventId(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                    <SelectContent>
                      {attendanceRecords.map((record) => (
                        <SelectItem value={record.eventId} key={record.eventId}>
                          {record.eventName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAttendance && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground">
                        Business need for this event
                      </h3>
                      {isBusinessNeedDirty && (
                        <span className="text-xs font-medium text-primary">Unsaved changes</span>
                      )}
                    </div>
                    <Textarea
                      value={selectedAttendance.businessNeed}
                      onChange={(event) => handleBusinessNeedChange(event.target.value)}
                      placeholder="Tell attendees what business need you’re focused on right now…"
                      rows={6}
                    />
                    <div className="flex items-center justify-end gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isBusinessNeedDirty || isSavingBusinessNeed}
                        onClick={handleResetBusinessNeed}
                      >
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveBusinessNeed}
                        disabled={!isBusinessNeedDirty || isSavingBusinessNeed}
                        className="gradient-primary text-primary-foreground hover:opacity-90"
                      >
                        {isSavingBusinessNeed ? (
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
      </main>
    </div>
  )
}

