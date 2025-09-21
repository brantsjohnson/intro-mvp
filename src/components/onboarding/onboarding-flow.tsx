"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
// import { Checkbox } from "@/components/ui/checkbox"
import { HobbiesGrid } from "@/components/ui/hobbies-grid"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { User, Hobby } from "@/lib/types"
import { toast } from "sonner"
import { Camera, ArrowRight } from "lucide-react"


interface OnboardingStep {
  id: string
  title: string
  description: string
  component: React.ReactNode
}

export function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [hobbies, setHobbies] = useState<Hobby[]>([])
  const [selectedHobbies, setSelectedHobbies] = useState<number[]>([])
  const [expertiseTags, setExpertiseTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  
  // Profile data
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [mbti, setMbti] = useState("")
  const [enneagram, setEnneagram] = useState("")
  const [networkingGoals, setNetworkingGoals] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth")
        return
      }
      setUser(user)
    }
    getUser()
  }, [router, supabase.auth])

  useEffect(() => {
    const fetchHobbies = async () => {
      const { data, error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("hobbies")
        .select("*")
        .order("label")
      
      if (error) {
        toast.error("Failed to load hobbies")
      } else {
        setHobbies(data || [])
      }
    }
    fetchHobbies()
  }, [supabase])

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

    const { error: uploadError } = await (supabase as any).storage // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('avatars')
      .upload(filePath, avatarFile)

    if (uploadError) {
      throw uploadError
    }

    const { data } = (supabase as any).storage // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('avatars')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  const addExpertiseTag = () => {
    if (newTag.trim() && !expertiseTags.includes(newTag.trim())) {
      setExpertiseTags([...expertiseTags, newTag.trim()])
      setNewTag("")
    }
  }

  const removeExpertiseTag = (tag: string) => {
    setExpertiseTags(expertiseTags.filter(t => t !== tag))
  }

  const handleJoinEvent = async (eventCode: string) => {
    if (!user) return
    
    setIsLoading(true)
    try {
      // First, get the event by code
      const { data: event, error: eventError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("events")
        .select("*")
        .eq("code", eventCode.toUpperCase())
        .single()

      if (eventError || !event) {
        toast.error("Event not found")
        return
      }

      // Join the event
      const { error: joinError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("event_members")
        .insert({
          event_id: event.id,
          user_id: user.id
        })

      if (joinError) {
        toast.error("Failed to join event")
        return
      }

      toast.success("Successfully joined event!")
      setCurrentStep(currentStep + 1)
    } catch {
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleScanQR = () => {
    // TODO: Implement QR scanning
    toast.info("QR scanning will be implemented")
  }

  const handleCompleteOnboarding = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      // Upload avatar if provided
      let avatarUrl = null
      if (avatarFile) {
        avatarUrl = await uploadAvatar(user.id)
      }

      // Update profile
      const { error: profileError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("profiles")
        .upsert({
          id: user.id,
          first_name: user.user_metadata?.first_name || "",
          last_name: user.user_metadata?.last_name || "",
          email: user.email || "",
          avatar_url: avatarUrl,
          job_title: jobTitle,
          company: company,
          linkedin_url: linkedinUrl,
          mbti: mbti,
          enneagram: enneagram,
          consent: true
        })

      if (profileError) {
        toast.error("Failed to update profile")
        return
      }

      // Add hobbies
      if (selectedHobbies.length > 0) {
        const hobbyInserts = selectedHobbies.map(hobbyId => ({
          user_id: user.id,
          hobby_id: hobbyId
        }))

        const { error: hobbiesError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from("profile_hobbies")
          .insert(hobbyInserts)

        if (hobbiesError) {
          toast.error("Failed to save hobbies")
          return
        }
      }

      // Add expertise tags
      if (expertiseTags.length > 0) {
        // First, get or create expertise tags
        const tagInserts = await Promise.all(
          expertiseTags.map(async (tag) => {
            const { data: existingTag } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
              .from("expertise_tags")
              .select("id")
              .eq("label", tag)
              .single()

            if (existingTag) {
              return { user_id: user.id, tag_id: existingTag.id }
            } else {
              const { data: newTag } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
                .from("expertise_tags")
                .insert({ label: tag })
                .select("id")
                .single()

              return { user_id: user.id, tag_id: newTag?.id }
            }
          })
        )

        const { error: expertiseError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from("profile_expertise")
          .insert(tagInserts)

        if (expertiseError) {
          toast.error("Failed to save expertise")
          return
        }
      }

      toast.success("Onboarding completed!")
      router.push("/home")
    } catch {
      toast.error("An error occurred during onboarding")
    } finally {
      setIsLoading(false)
    }
  }

  const steps: OnboardingStep[] = [
    {
      id: "profile",
      title: "Complete Your Profile",
      description: "Tell us about yourself so we can find the right connections",
      component: (
        <div className="space-y-6">
          {/* Avatar Upload */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Profile Photo
            </Label>
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="h-8 w-8 text-muted-foreground" />
                )}
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
                    <span>Take Photo</span>
                  </GradientButton>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Your photo will be visible to other attendees
                </p>
              </div>
            </div>
          </div>

          {/* Job Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="jobTitle" className="text-sm font-medium text-foreground">
                Job Title *
              </Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer"
                className="mt-1 rounded-xl"
                required
              />
            </div>
            <div>
              <Label htmlFor="company" className="text-sm font-medium text-foreground">
                Company *
              </Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Tech Corp"
                className="mt-1 rounded-xl"
                required
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
            <Label htmlFor="networkingGoals" className="text-sm font-medium text-foreground">
              What are you looking to network about?
            </Label>
            <Textarea
              id="networkingGoals"
              value={networkingGoals}
              onChange={(e) => setNetworkingGoals(e.target.value)}
              placeholder="e.g. Career opportunities, mentorship, collaboration on AI projects..."
              className="mt-1 rounded-xl"
              rows={3}
            />
          </div>
        </div>
      )
    },
    {
      id: "personality",
      title: "Personality & Interests",
      description: "Help us understand your personality and interests for better matching",
      component: (
        <div className="space-y-6">
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

          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Hobbies & Interests
            </Label>
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
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Areas of Expertise
            </Label>
            <div className="space-y-3">
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
                <GradientButton onClick={addExpertiseTag} size="sm">
                  Add
                </GradientButton>
              </div>
              {expertiseTags.length > 0 && (
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
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      id: "join-event",
      title: "Join an Event",
      description: "Scan a QR code or enter an event code to get started",
      component: (
        <EventJoinScanner
          onJoinEvent={handleJoinEvent}
          onScanQR={handleScanQR}
          isLoading={isLoading}
        />
      )
    }
  ]

  if (!user) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  }

  const currentStepData = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(((currentStep + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="gradient-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <Card className="bg-card border-border shadow-elevation">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-foreground">
              {currentStepData.title}
            </CardTitle>
            <p className="text-muted-foreground">
              {currentStepData.description}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentStepData.component}
            
            <div className="flex justify-between pt-4">
              <GradientButton
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                Back
              </GradientButton>
              
              {isLastStep ? (
                <GradientButton
                  onClick={handleCompleteOnboarding}
                  disabled={isLoading || !jobTitle || !company}
                >
                  {isLoading ? "Completing..." : "Complete Setup"}
                </GradientButton>
              ) : (
                <GradientButton
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={currentStep === 0 && (!jobTitle || !company)}
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </GradientButton>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
