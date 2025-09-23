"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GradientButton } from "@/components/ui/gradient-button"
import { HobbiesGrid } from "@/components/ui/hobbies-grid"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { createClientComponentClient } from "@/lib/supabase"
import { Profile, Hobby, Event } from "@/lib/types"
import { toast } from "sonner"
import { ArrowLeft, Edit3, Plus, ChevronDown } from "lucide-react"

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [userEvents, setUserEvents] = useState<Event[]>([])
  const [hobbies, setHobbies] = useState<Hobby[]>([])
  const [selectedHobbies, setSelectedHobbies] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showEventDropdown, setShowEventDropdown] = useState(false)
  const [isPresent, setIsPresent] = useState(false)
  
  // Form fields
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [mbti, setMbti] = useState("")
  const [enneagram, setEnneagram] = useState("")
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

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        toast.error("Failed to load profile")
        return
      }

      setProfile(profileData)
      setJobTitle(profileData.job_title || "")
      setCompany(profileData.company || "")
      setLinkedinUrl(profileData.linkedin_url || "")
      setMbti(profileData.mbti || "")
      setEnneagram(profileData.enneagram || "")
      setLocation(profileData.location || "")

      // Load user's events
      const { data: eventData, error: eventError } = await supabase
        .from("event_members")
        .select(`
          events (
            id,
            name,
            code,
            starts_at,
            ends_at
          )
        `)
        .eq("user_id", user.id)

      if (eventError) {
        console.error("Error loading events:", eventError)
      } else if (eventData) {
        const events = eventData.map((item: any) => item.events).filter(Boolean)
        setUserEvents(events)
        
        // Set current event (first one for now)
        if (events.length > 0) {
          setCurrentEvent(events[0])
          
          // Load presence status for current event
          const { data: presenceData, error: presenceError } = await supabase
            .from("event_members")
            .select("is_present")
            .eq("user_id", user.id)
            .eq("event_id", events[0].id)
            .single()
          
          if (!presenceError && presenceData) {
            setIsPresent(presenceData.is_present || false)
          }
        }
      }

      // Load hobbies
      const { data: hobbiesData, error: hobbiesError } = await supabase
        .from("hobbies")
        .select("*")
        .order("label")

      if (hobbiesError) {
        console.error("Error loading hobbies:", hobbiesError)
      } else {
        setHobbies(hobbiesData || [])
      }

      // Load user's selected hobbies
      const { data: userHobbiesData, error: userHobbiesError } = await supabase
        .from("profile_hobbies")
        .select("hobby_id")
        .eq("user_id", user.id)

      if (userHobbiesError) {
        console.error("Error loading user hobbies:", userHobbiesError)
      } else {
        const hobbyIds = userHobbiesData?.map(item => item.hobby_id) || []
        setSelectedHobbies(hobbyIds)
      }

    } catch (error) {
      console.error("Error loading user data:", error)
      toast.error("Failed to load profile data")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          job_title: jobTitle,
          company: company,
          linkedin_url: linkedinUrl,
          mbti: mbti,
          enneagram: enneagram,
          location: location,
        })
        .eq("id", profile.id)

      if (error) {
        toast.error("Failed to update profile")
        return
      }

      // Update hobbies
      const { error: deleteError } = await supabase
        .from("profile_hobbies")
        .delete()
        .eq("user_id", profile.id)

      if (deleteError) {
        console.error("Error deleting old hobbies:", deleteError)
      }

      if (selectedHobbies.length > 0) {
        const hobbyInserts = selectedHobbies.map(hobbyId => ({
          user_id: profile.id,
          hobby_id: hobbyId
        }))

        const { error: insertError } = await supabase
          .from("profile_hobbies")
          .insert(hobbyInserts)

        if (insertError) {
          console.error("Error inserting hobbies:", insertError)
        }
      }

      toast.success("Profile updated successfully")
      setIsEditing(false)
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error("Failed to save profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEventSwitch = async (event: Event) => {
    setCurrentEvent(event)
    setShowEventDropdown(false)
    toast.success(`Switched to ${event.name}`)
    // Refresh the home page data by redirecting
    router.push("/home")
  }

  const handleAddEvent = () => {
    router.push("/event/join")
  }

  const handleHobbyToggle = (hobbyId: number) => {
    setSelectedHobbies(prev => 
      prev.includes(hobbyId) 
        ? prev.filter(id => id !== hobbyId)
        : [...prev, hobbyId]
    )
  }

  const handlePresenceToggle = async () => {
    if (!currentEvent || !profile) return

    try {
      const { error } = await supabase
        .from("event_members")
        .update({ is_present: !isPresent })
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={() => router.back()}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <h1 className="text-lg font-semibold text-foreground">
              Profile Settings
            </h1>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <Edit3 className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Block */}
          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <PresenceAvatar
                  src={profile.avatar_url || undefined}
                  fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                  isPresent={isPresent}
                  size="lg"
                />
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {profile.first_name} {profile.last_name}
                  </h2>
                  <p className="text-muted-foreground">
                    {jobTitle} {company && `| ${company}`}
                  </p>
                  {currentEvent && (
                    <p className="text-primary text-sm mt-1">
                      Attended: {currentEvent.name}
                    </p>
                  )}
                </div>
                {currentEvent && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      {isPresent ? 'Present' : 'Not Present'}
                    </span>
                    <button
                      onClick={handlePresenceToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                        isPresent ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isPresent ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Event Switching */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-primary">Change event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10">
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

          {/* Hobbies */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-primary">Hobbies</CardTitle>
            </CardHeader>
            <CardContent>
              <HobbiesGrid
                hobbies={hobbies}
                selectedHobbies={selectedHobbies}
                onHobbyToggle={handleHobbyToggle}
                disabled={!isEditing}
              />
            </CardContent>
          </Card>

          {/* About Section */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-primary">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    disabled={!isEditing}
                    className={isEditing ? "border-primary/20" : ""}
                  />
                </div>
                
                <div>
                  <Label htmlFor="jobTitle">Job Title</Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    disabled={!isEditing}
                    className={isEditing ? "border-primary/20" : ""}
                  />
                </div>
                
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={!isEditing}
                    className={isEditing ? "border-primary/20" : ""}
                  />
                </div>
                
                <div>
                  <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                  <Input
                    id="linkedinUrl"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    disabled={!isEditing}
                    className={isEditing ? "border-primary/20" : ""}
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>
                
                <div>
                  <Label htmlFor="enneagram">Enneagram Type</Label>
                  <Input
                    id="enneagram"
                    value={enneagram}
                    onChange={(e) => setEnneagram(e.target.value)}
                    disabled={!isEditing}
                    className={isEditing ? "border-primary/20" : ""}
                    placeholder="e.g., 8 - Challenger"
                  />
                </div>
                
                <div>
                  <Label htmlFor="mbti">Myers-Briggs Type</Label>
                  <Input
                    id="mbti"
                    value={mbti}
                    onChange={(e) => setMbti(e.target.value)}
                    disabled={!isEditing}
                    className={isEditing ? "border-primary/20" : ""}
                    placeholder="e.g., ENTJ"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          {isEditing && (
            <div className="flex justify-end">
              <GradientButton
                onClick={handleSave}
                disabled={isSaving}
                className="px-8"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </GradientButton>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}