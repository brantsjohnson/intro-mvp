"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GradientButton } from "@/components/ui/gradient-button"
import { HobbiesGrid } from "@/components/ui/hobbies-grid"
import { createClientComponentClient } from "@/lib/supabase"
import { Profile, Hobby } from "@/lib/types"
import { toast } from "sonner"
import { ArrowLeft, Camera } from "lucide-react"

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [hobbies, setHobbies] = useState<Hobby[]>([])
  const [selectedHobbies, setSelectedHobbies] = useState<number[]>([])
  const [expertiseTags, setExpertiseTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Form fields
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [mbti, setMbti] = useState("")
  const [enneagram, setEnneagram] = useState("")
  const [location, setLocation] = useState("")
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Suggest expertise based on job title
  const suggestedExpertise = useMemo(() => {
    const title = (jobTitle || "").toLowerCase()
    const base: string[] = [
      "Problem Solving",
      "Communication",
      "Project Coordination",
      "Process Optimization",
      "Client Service",
      "Strategic Thinking",
    ]
    const addIf = (cond: boolean, tag: string) => { if (cond && !base.includes(tag)) base.push(tag) }
    addIf(/manager|lead|head|director/.test(title), "Team Leadership")
    addIf(/marketing/.test(title), "Go-To-Market")
    addIf(/sales|account/.test(title), "Account Management")
    addIf(/engineer|developer|software/.test(title), "System Design")
    addIf(/product/.test(title), "Product Strategy")
    return base
  }, [jobTitle])

  // Normalized lookup set for selected expertise (case-insensitive, trimmed)
  const normalizedExpertiseSet = useMemo(
    () => new Set(expertiseTags.map(t => t.trim().toLowerCase())),
    [expertiseTags]
  )

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth")
          return
        }

        // Load profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (profileData) {
          setProfile(profileData)
          setJobTitle(profileData.job_title || "")
          setCompany(profileData.company || "")
          setLinkedinUrl(profileData.linkedin_url || "")
          setMbti(profileData.mbti || "")
          setEnneagram(profileData.enneagram || "")
          setLocation(profileData.location || "")
          setAvatarPreview(profileData.avatar_url)
        }

        // Load hobbies
        const { data: hobbiesData } = await supabase
          .from("hobbies")
          .select("*")
          .order("label")

        if (hobbiesData) {
          setHobbies(hobbiesData)
        }

        // Load user's hobbies
        const { data: userHobbiesData } = await supabase
          .from("profile_hobbies")
          .select("hobby_id")
          .eq("user_id", user.id)

        if (userHobbiesData) {
          setSelectedHobbies(userHobbiesData.map(h => h.hobby_id))
        }

        // Load expertise tags
        const { data: expertiseData } = await supabase
          .from("profile_expertise")
          .select(`
            expertise_tags (
              label
            )
          `)
          .eq("user_id", user.id)

        if (expertiseData) {
          setExpertiseTags(expertiseData.map((item: { expertise_tags: { label: string } }) => item.expertise_tags.label))
        }
      } catch (error) {
        console.error("Error loading profile:", error)
        toast.error("Failed to load profile")
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [router, supabase])

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadAvatar = async (userId: string) => {
    if (!avatarFile) return null

    const fileExt = avatarFile.name.split('.').pop()
    const fileName = `${userId}.${fileExt}`
    const filePath = `${userId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile)

    if (uploadError) {
      throw uploadError
    }

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  const addExpertiseTag = (value?: string) => {
    const tag = (value ?? newTag).trim()
    if (!tag) return
    const key = tag.toLowerCase()
    if (!normalizedExpertiseSet.has(key)) {
      setExpertiseTags([...expertiseTags, tag])
    }
    if (!value) setNewTag("")
  }

  const toggleExpertiseTag = (tag: string) => {
    const key = tag.trim().toLowerCase()
    if (normalizedExpertiseSet.has(key)) {
      setExpertiseTags(expertiseTags.filter(t => t.trim().toLowerCase() !== key))
    } else {
      setExpertiseTags([...expertiseTags, tag])
    }
  }

  const removeExpertiseTag = (tag: string) => {
    setExpertiseTags(expertiseTags.filter(t => t !== tag))
  }

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    try {
      // Upload avatar if provided
      let avatarUrl = profile.avatar_url
      if (avatarFile) {
        avatarUrl = await uploadAvatar(profile.id)
      }

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          job_title: jobTitle,
          company: company,
          linkedin_url: linkedinUrl,
          mbti: mbti,
          enneagram: enneagram,
          location: location,
          avatar_url: avatarUrl
        })
        .eq("id", profile.id)

      if (profileError) {
        toast.error("Failed to update profile")
        return
      }

      // Update hobbies
      const { error: deleteHobbiesError } = await supabase
        .from("profile_hobbies")
        .delete()
        .eq("user_id", profile.id)

      if (deleteHobbiesError) {
        toast.error("Failed to update hobbies")
        return
      }

      if (selectedHobbies.length > 0) {
        const hobbyInserts = selectedHobbies.map(hobbyId => ({
          user_id: profile.id,
          hobby_id: hobbyId
        }))

        const { error: hobbiesError } = await supabase
          .from("profile_hobbies")
          .insert(hobbyInserts)

        if (hobbiesError) {
          toast.error("Failed to update hobbies")
          return
        }
      }

      // Update expertise tags
      const { error: deleteExpertiseError } = await supabase
        .from("profile_expertise")
        .delete()
        .eq("user_id", profile.id)

      if (deleteExpertiseError) {
        toast.error("Failed to update expertise")
        return
      }

      if (expertiseTags.length > 0) {
        const tagInserts = await Promise.all(
          expertiseTags.map(async (tag) => {
            const { data: existingTag } = await supabase
              .from("expertise_tags")
              .select("id")
              .eq("label", tag)
              .single()

            if (existingTag) {
              return { user_id: profile.id, tag_id: existingTag.id }
            } else {
              const { data: newTag } = await supabase
                .from("expertise_tags")
                .insert({ label: tag })
                .select("id")
                .single()

              return { user_id: profile.id, tag_id: newTag?.id }
            }
          })
        )

        const { error: expertiseError } = await supabase
          .from("profile_expertise")
          .insert(tagInserts)

        if (expertiseError) {
          toast.error("Failed to update expertise")
          return
        }
      }

      toast.success("Profile updated successfully!")
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error("Failed to save profile")
    } finally {
      setIsSaving(false)
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
          <GradientButton onClick={() => router.push("/home")}>
            Go Home
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
              PROFILE SETTINGS
            </h1>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Header */}
          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {profile.first_name} {profile.last_name}
                  </h2>
                  <p className="text-muted-foreground">
                    {profile.job_title} | {profile.company}
                  </p>
                  <p className="text-sm text-primary mt-1">
                    Attended Marketing Conference
                  </p>
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    id="avatar-upload"
                  />
                  <Label htmlFor="avatar-upload" className="cursor-pointer">
                    <GradientButton variant="outline" size="sm" asChild>
                      <span>Edit Photo</span>
                    </GradientButton>
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Basic Information */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="jobTitle" className="text-sm font-medium text-foreground">
                    Job Title
                  </Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="mt-1 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="company" className="text-sm font-medium text-foreground">
                    Company
                  </Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="mt-1 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="linkedinUrl" className="text-sm font-medium text-foreground">
                  LinkedIn URL
                </Label>
                <Input
                  id="linkedinUrl"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                  className="mt-1 rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="location" className="text-sm font-medium text-foreground">
                  Location
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA"
                  className="mt-1 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mbti" className="text-sm font-medium text-foreground">
                    Myers-Briggs Type (Optional)
                  </Label>
                  <Input
                    id="mbti"
                    value={mbti}
                    onChange={(e) => setMbti(e.target.value.toUpperCase())}
                    placeholder="e.g. ENFP"
                    maxLength={4}
                    className="mt-1 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="enneagram" className="text-sm font-medium text-foreground">
                    Enneagram Type (Optional)
                  </Label>
                  <Input
                    id="enneagram"
                    value={enneagram}
                    onChange={(e) => setEnneagram(e.target.value)}
                    placeholder="e.g. 8 or 8w7"
                    className="mt-1 rounded-xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hobbies */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-lg">Hobbies</CardTitle>
            </CardHeader>
            <CardContent>
              <HobbiesGrid
                hobbies={hobbies}
                selectedHobbies={selectedHobbies}
                onHobbyChange={(hobbyId, checked) => {
                  if (checked) {
                    setSelectedHobbies([...selectedHobbies, hobbyId])
                  } else {
                    setSelectedHobbies(selectedHobbies.filter(id => id !== hobbyId))
                  }
                }}
                mode="select"
              />
            </CardContent>
          </Card>

          {/* Areas of Expertise */}
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-lg">Areas of Expertise</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Add your own expertise (always first) */}
                <div>
                  <Label className="text-sm font-medium text-foreground block mb-2">
                    Add your own expertise area
                  </Label>
                  <div className="flex space-x-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Add expertise area"
                      className="rounded-xl"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addExpertiseTag()
                        }
                      }}
                    />
                    <GradientButton onClick={() => addExpertiseTag()} size="sm">
                      Add
                    </GradientButton>
                  </div>
                </div>

                {/* Suggested based on job title (second) */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Suggested based on your job title:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedExpertise.map((tag) => {
                      const selected = normalizedExpertiseSet.has(tag.toLowerCase())
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleExpertiseTag(tag)}
                          className={
                            `inline-flex items-center px-3 py-1 rounded-full text-sm border transition-colors ` +
                            (selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-transparent text-foreground border-border hover:bg-primary/10")
                          }
                        >
                          {selected ? tag : `+ ${tag}`}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Selected tags (suggested + custom) listed below (third) */}
                {expertiseTags.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Selected:</p>
                    <div className="flex flex-wrap gap-2">
                      {expertiseTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20"
                        >
                          {tag}
                          <button
                            onClick={() => removeExpertiseTag(tag)}
                            className="ml-2 hover:text-destructive"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
