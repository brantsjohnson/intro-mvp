"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { createClientComponentClient } from "@/lib/supabase"
import { Profile, Event } from "@/lib/types"
import { toast } from "sonner"
import { ArrowLeft, Edit3, Plus, ChevronDown } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [userEvents, setUserEvents] = useState<Event[]>([])
  const [expertiseSummary, setExpertiseSummary] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showEventDropdown, setShowEventDropdown] = useState(false)
  const [isPresent, setIsPresent] = useState(false)
  
  // Form fields
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [location, setLocation] = useState("")
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth")
        return
      }

      // Load profile from users table
      const { data: person, error: profileError } = await supabase
        .from("users")
        .select("user_id, first_name, last_name, email, photo_url, career_title, company_name, expertise_summary, mbti_type, enneagram_type")
        .eq("user_id", user.id)
        .single()

      if (profileError) {
        console.error("Error loading profile:", profileError)
        toast.error("Failed to load profile")
        return
      }

      const mapped: Profile = {
        id: person.user_id,
        first_name: person.first_name || "",
        last_name: person.last_name || "",
        email: person.email || "",
        avatar_url: person.photo_url || null,
        job_title: person.career_title || null,
        company: person.company_name || null,
        what_do_you_do: null,
        location: null,
        linkedin_url: null,
        mbti: person.mbti_type || null,
        enneagram: person.enneagram_type || null,
        networking_goals: null,
        hobbies: null,
        expertise_tags: null,
        consent: true,
      }
      setProfile(mapped)
      setJobTitle(person.career_title || "")
      setCompany(person.company_name || "")
      setLocation("") // Location not in users table currently
      setExpertiseSummary(person.expertise_summary || "")

      // Load user's events from attendance
      const { data: eventData, error: eventError } = await supabase
        .from("attendance")
        .select("events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location)")
        .eq("user_id", user.id)

      if (eventError) {
        console.error("Error loading events:", eventError)
      } else if (eventData) {
        const events = eventData
          .map((item: any) => item.events)
          .filter(Boolean)
          .map((e: any) => ({
            id: e.event_id,
            name: e.event_name,
            code: e.event_code,
            starts_at: e.event_starts_at,
            ends_at: e.event_ends_at,
            location: e.event_location,
            header_image_url: null,
            is_active: true,
            matchmaking_enabled: true,
          }))
        setUserEvents(events)
        
        // Set current event (most recent)
        if (events.length > 0) {
          setCurrentEvent(events[0])
          
          // Load presence status for current event
          const { data: presenceData, error: presenceError } = await supabase
            .from("attendance")
            .select("checked_in_at")
            .eq("user_id", user.id)
            .eq("event_id", events[0].id)
            .maybeSingle()
          
          if (!presenceError && presenceData) {
            setIsPresent(!!presenceData.checked_in_at)
          }
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error)
      toast.error("Failed to load profile data")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveChanges = async () => {
    if (!profile) return

    try {
      setIsSaving(true)

      // Update users table with basic info
      const { error: profileError } = await supabase
        .from("users")
        .update({
          career_title: jobTitle,
          company_name: company,
          expertise_summary: expertiseSummary.trim() || null,
        })
        .eq("user_id", profile.id)

      if (profileError) {
        console.error("Error updating profile:", profileError)
        toast.error("Failed to update profile")
        return
      }

      // Reload profile data
      await loadUserData()
      toast.success("Profile updated successfully")
      setIsEditing(false)
    } catch (error) {
      console.error("Error saving changes:", error)
      toast.error("Failed to save changes")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEventSwitch = async (event: Event) => {
    setCurrentEvent(event)
    setShowEventDropdown(false)
    
    // Update presence status for the switched event
    if (profile) {
      const { data: presenceData } = await supabase
        .from("attendance")
        .select("checked_in_at")
        .eq("user_id", profile.id)
        .eq("event_id", event.id)
        .maybeSingle()
      
      setIsPresent(!!presenceData?.checked_in_at)
    }
    
    toast.success(`Switched to ${event.name}`)
  }

  const handleAddEvent = () => {
    router.push("/event/join")
  }

  const handlePresenceToggle = async () => {
    if (!currentEvent || !profile) return

    try {
      const { error } = await supabase
        .from("attendance")
        .update({ checked_in_at: !isPresent ? new Date().toISOString() : null })
        .eq("user_id", profile.id)
        .eq("event_id", currentEvent.id)

      if (error) {
        toast.error("Failed to update presence status")
        return
      }

      setIsPresent(!isPresent)
      toast.success(`You are now ${!isPresent ? 'present' : 'not present'} at the event`)
    } catch (error) {
      console.error("Error toggling presence:", error)
      toast.error("Failed to update presence status")
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Profile not found</p>
          <GradientButton onClick={() => router.push("/onboarding")}>
            Complete Setup
          </GradientButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={() => !isEditing && router.back()}
              variant={isEditing ? "outline" : "default"}
              size="icon"
              disabled={isEditing}
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <h1 className="text-lg font-semibold text-foreground">
              Profile Settings
            </h1>

            <div className="flex items-center space-x-2">
              {isEditing && (
                <GradientButton
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  size="sm"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </GradientButton>
              )}
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <Edit3 className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Profile Block */}
          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-center space-y-2">
                  <PresenceAvatar
                    src={profile.avatar_url || undefined}
                    fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                    isPresent={isPresent}
                    size="xl"
                  />
                  {currentEvent && (
                    <div className="flex flex-col items-center space-y-1">
                      <button
                        onClick={handlePresenceToggle}
                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                          isPresent ? 'bg-gradient-to-r from-[#4B915A] to-[#0B3E16]' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            isPresent ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {isPresent ? 'Here' : 'Away'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    {profile.first_name} {profile.last_name}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {jobTitle} {company && `| ${company}`}
                  </p>
                  {currentEvent && (
                    <p className="text-primary text-xs mt-0.5">
                      Attended: {currentEvent.name}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Event Switching */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">Change event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {/* Current Event Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowEventDropdown(!showEventDropdown)}
                  className="w-full p-3 bg-muted border border-border rounded-lg flex items-center justify-between text-left"
                >
                  <span className="text-foreground">
                    Current Event: {currentEvent?.name || "No event selected"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                
                {showEventDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                    {userEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => handleEventSwitch(event)}
                        className="w-full p-3 text-left hover:bg-muted border-b border-border last:border-b-0"
                      >
                        <div className="text-foreground">{event.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {event.starts_at ? new Date(event.starts_at).toLocaleDateString() : 'TBD'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Event Button */}
              <button
                onClick={handleAddEvent}
                className="w-full p-3 rounded-lg text-white font-medium flex items-center justify-center space-x-2"
                style={{
                  background: 'linear-gradient(135deg, #EC874E 0%, #BF341E 100%)',
                  border: 'none'
                }}
              >
                <Plus className="h-4 w-4" />
                <span>Add an event</span>
              </button>
            </CardContent>
          </Card>

          {/* About Section */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">About</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isEditing ? (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="border-primary/20 focus:border-primary focus:ring-primary text-black"
                      style={{ backgroundColor: '#DDDDDD', color: 'black' }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input
                      id="jobTitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="border-primary/20 focus:border-primary focus:ring-primary text-black"
                      style={{ backgroundColor: '#DDDDDD', color: 'black' }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="border-primary/20 focus:border-primary focus:ring-primary text-black"
                      style={{ backgroundColor: '#DDDDDD', color: 'black' }}
                      placeholder="City, State"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-muted-foreground">Company</span>
                    <span className="text-foreground">{company || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-muted-foreground">Job Title</span>
                    <span className="text-foreground">{jobTitle || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-muted-foreground">Location</span>
                    <span className="text-foreground">{location || "—"}</span>
                  </div>
                  {profile?.enneagram && (
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-muted-foreground">Enneagram type</span>
                      <span className="text-foreground">{profile.enneagram}</span>
                    </div>
                  )}
                  {profile?.mbti && (
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-muted-foreground">Myers-Briggs type</span>
                      <span className="text-foreground">{profile.mbti}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expertise Section */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader className="pb-1">
              <CardTitle className="text-primary">Expertise</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isEditing ? (
                <div>
                  <Label htmlFor="expertiseSummary">Areas of Expertise</Label>
                  <Textarea
                    id="expertiseSummary"
                    value={expertiseSummary}
                    onChange={(e) => setExpertiseSummary(e.target.value)}
                    placeholder="e.g., Machine Learning, Sales Strategy, Product Design"
                    className="border-primary/20 focus:border-primary focus:ring-primary text-black mt-2"
                    style={{ backgroundColor: '#DDDDDD', color: 'black' }}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter your areas of expertise separated by commas
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {expertiseSummary ? (
                    <div className="flex flex-wrap gap-2">
                      {expertiseSummary.split(',').map((expertise, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                        >
                          {expertise.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No expertise listed</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
