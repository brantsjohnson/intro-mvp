"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Checkbox } from "@/components/ui/checkbox"
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
  const searchParams = useSearchParams()
  const fromEventJoin = searchParams.get('from') === 'event-join'
  const eventId = searchParams.get('eventId')
  const [currentStep, setCurrentStep] = useState(0) // Always start from index 0 of the visible steps
  const [isLoading, setIsLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [hobbies, setHobbies] = useState<Hobby[]>([])
  const [selectedHobbies, setSelectedHobbies] = useState<number[]>([])
  const [expertiseTags, setExpertiseTags] = useState<string[]>([])
  const [customExpertiseTags, setCustomExpertiseTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [networkingGoals, setNetworkingGoals] = useState<string[]>([])
  const [customNetworkingGoal, setCustomNetworkingGoal] = useState("")
  const [isJoiningEvent, setIsJoiningEvent] = useState(false)
  
  // Profile data
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [whatDoYouDo, setWhatDoYouDo] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [mbti, setMbti] = useState("")
  const [enneagram, setEnneagram] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Generate AI-based expertise suggestions based on job title
  const generateExpertiseSuggestions = (jobTitle: string): string[] => {
    const title = jobTitle.toLowerCase()
    
    if (title.includes('engineer') || title.includes('developer') || title.includes('programmer')) {
      return ['Software Development', 'System Architecture', 'Code Review', 'Technical Leadership', 'API Design', 'Database Management']
    } else if (title.includes('designer') || title.includes('ux') || title.includes('ui')) {
      return ['User Experience Design', 'Visual Design', 'Prototyping', 'Design Systems', 'User Research', 'Interface Design']
    } else if (title.includes('manager') || title.includes('director') || title.includes('lead')) {
      return ['Team Leadership', 'Project Management', 'Strategic Planning', 'Process Improvement', 'Stakeholder Management', 'Budget Planning']
    } else if (title.includes('marketing') || title.includes('growth') || title.includes('brand')) {
      return ['Digital Marketing', 'Content Strategy', 'Brand Management', 'Campaign Planning', 'Analytics', 'Social Media']
    } else if (title.includes('sales') || title.includes('business development')) {
      return ['Client Relations', 'Sales Strategy', 'Lead Generation', 'Negotiation', 'Market Analysis', 'Revenue Growth']
    } else if (title.includes('product') || title.includes('pm')) {
      return ['Product Strategy', 'Feature Planning', 'User Stories', 'Market Research', 'Roadmap Development', 'Cross-functional Collaboration']
    } else if (title.includes('data') || title.includes('analyst') || title.includes('scientist')) {
      return ['Data Analysis', 'Statistical Modeling', 'Machine Learning', 'Data Visualization', 'Predictive Analytics', 'Database Querying']
    } else if (title.includes('finance') || title.includes('accounting') || title.includes('cfo')) {
      return ['Financial Analysis', 'Budget Management', 'Risk Assessment', 'Investment Strategy', 'Financial Reporting', 'Cost Optimization']
    } else if (title.includes('hr') || title.includes('human resources') || title.includes('people')) {
      return ['Talent Acquisition', 'Employee Relations', 'Performance Management', 'Training & Development', 'Organizational Culture', 'Compensation Planning']
    } else {
      return ['Problem Solving', 'Communication', 'Project Coordination', 'Process Optimization', 'Client Service', 'Strategic Thinking']
    }
  }

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        // Pre-fill form fields from Google OAuth data
        if (user.user_metadata) {
          const metadata = user.user_metadata
          if (metadata.first_name) setFirstName(metadata.first_name)
          if (metadata.last_name) setLastName(metadata.last_name)
          if (metadata.full_name) {
            const nameParts = metadata.full_name.split(' ')
            if (nameParts.length >= 2) {
              setFirstName(nameParts[0])
              setLastName(nameParts.slice(1).join(' '))
            }
          }
          if (metadata.avatar_url) setAvatarPreview(metadata.avatar_url)
        }
      }
    }
    
    // Initial check
    getUser()
    
    // Set a timeout to redirect if no user is found after 3 seconds
    const timeoutId = setTimeout(() => {
      if (!user) {
        console.log('Timeout: No user found after 3 seconds, redirecting to auth')
        router.push("/auth")
      }
    }, 3000)
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.id)
      if (session?.user) {
        clearTimeout(timeoutId) // Clear timeout if user is found
        setUser(session.user)
        // Pre-fill form fields from Google OAuth data
        if (session.user.user_metadata) {
          const metadata = session.user.user_metadata
          if (metadata.first_name) setFirstName(metadata.first_name)
          if (metadata.last_name) setLastName(metadata.last_name)
          if (metadata.full_name) {
            const nameParts = metadata.full_name.split(' ')
            if (nameParts.length >= 2) {
              setFirstName(nameParts[0])
              setLastName(nameParts.slice(1).join(' '))
            }
          }
          if (metadata.avatar_url) setAvatarPreview(metadata.avatar_url)
        }
      } else if (event === 'SIGNED_OUT') {
        clearTimeout(timeoutId)
        router.push("/auth")
      }
    })
    
    return () => {
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [router, supabase.auth, user])

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
    if (newTag.trim() && !customExpertiseTags.includes(newTag.trim()) && !expertiseTags.includes(newTag.trim())) {
      setCustomExpertiseTags([...customExpertiseTags, newTag.trim()])
      setNewTag("")
    }
  }

  const removeExpertiseTag = (tag: string) => {
    setExpertiseTags(expertiseTags.filter(t => t !== tag))
  }

  const removeCustomExpertiseTag = (tag: string) => {
    setCustomExpertiseTags(customExpertiseTags.filter(t => t !== tag))
  }


  const handleJoinEvent = async (eventCode: string) => {
    if (!user) {
      toast.error("You must be logged in to join an event")
      return
    }

    setIsJoiningEvent(true)
    try {
      // Find the event by code
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id, name")
        .eq("code", eventCode.toUpperCase())
        .single()

      if (eventError || !eventData) {
        toast.error("Event not found. Please check the code and try again.")
        return
      }

      // Add user to the event
      const { error: joinError } = await supabase
        .from("event_members")
        .insert({
          event_id: eventData.id,
          user_id: user.id,
          is_present: true
        })

      if (joinError) {
        if (joinError.message.includes("duplicate")) {
          toast.error("You're already a member of this event")
        } else {
          toast.error("Failed to join event. Please try again.")
        }
        return
      }

      toast.success(`Successfully joined ${eventData.name}!`)
      
      // Redirect to home page
      setTimeout(() => {
        router.push("/home")
      }, 1000)
    } catch (error) {
      console.error("Error joining event:", error)
      toast.error("An error occurred while joining the event")
    } finally {
      setIsJoiningEvent(false)
    }
  }

  const handleCompleteOnboarding = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      // Upload avatar if provided, otherwise use Google avatar URL
      let avatarUrl = null
      if (avatarFile) {
        avatarUrl = await uploadAvatar(user.id)
      } else if (user.user_metadata?.avatar_url) {
        // Use Google avatar URL if no file was uploaded
        avatarUrl = user.user_metadata.avatar_url
      }

      // Update profile
      const { error: profileError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("profiles")
        .upsert({
          id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: user.email || "",
          avatar_url: avatarUrl,
          job_title: jobTitle,
          company: company,
          what_do_you_do: whatDoYouDo,
          linkedin_url: linkedinUrl,
          mbti: mbti,
          enneagram: enneagram,
          networking_goals: customNetworkingGoal.trim() 
            ? [...networkingGoals, customNetworkingGoal.trim()]
            : networkingGoals,
          consent: true
        })

      if (profileError) {
        console.error("Profile update error:", profileError)
        toast.error("Failed to update profile. Please try again.")
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

      // Add expertise tags (both suggested and custom)
      const allExpertiseTags = [...expertiseTags, ...customExpertiseTags]
      if (allExpertiseTags.length > 0) {
        // First, get or create expertise tags
        const tagInserts = await Promise.all(
          allExpertiseTags.map(async (tag) => {
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

      // Save event-specific networking goals if coming from event join
      if (fromEventJoin && eventId) {
        const allNetworkingGoals = customNetworkingGoal.trim() 
          ? [...networkingGoals, customNetworkingGoal.trim()]
          : networkingGoals

        if (allNetworkingGoals.length > 0) {
          const { error: eventNetworkingError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
            .from("event_networking_goals")
            .upsert({
              event_id: eventId,
              user_id: user.id,
              networking_goals: allNetworkingGoals
            })

          if (eventNetworkingError) {
            console.error("Event networking goals error:", eventNetworkingError)
            toast.error("Failed to save networking goals for this event")
            return
          }
        }
      }

      toast.success("Onboarding completed!")
      
      // Show loading screen while redirecting
      setIsRedirecting(true)
      setTimeout(() => {
        if (fromEventJoin) {
          // If coming from event join, go directly to home (event already joined)
          router.push("/home")
        } else {
          // If not coming from event join, redirect to join event page (step 2)
          router.push("/event/join")
        }
      }, 1000) // Small delay to let user see the success message
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

          {/* Name Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName" className="text-sm font-medium text-foreground">
                First Name *
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. John"
                className="mt-1 rounded-xl"
                required
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-sm font-medium text-foreground">
                Last Name *
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Doe"
                className="mt-1 rounded-xl"
                required
              />
            </div>
          </div>

          {/* Personality Types */}
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

          {/* Hobbies & Interests */}
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
        </div>
      )
    },
    {
      id: "professional",
      title: "Professional Information",
      description: "Tell us about your work and expertise",
      component: (
        <div className="space-y-6">
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

          {/* What do you do */}
          <div>
            <Label htmlFor="whatDoYouDo" className="text-sm font-medium text-foreground">
              What do you do? (Optional)
            </Label>
            <Textarea
              id="whatDoYouDo"
              value={whatDoYouDo}
              onChange={(e) => setWhatDoYouDo(e.target.value)}
              placeholder="Briefly describe your role and responsibilities..."
              className="mt-1 rounded-xl"
              rows={3}
            />
          </div>

          {/* Areas of Expertise with AI suggestions */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Areas of Expertise
            </Label>
            
            {/* Custom input field first */}
            <div className="mb-4">
              <div className="flex space-x-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add your own expertise area"
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
            </div>

            {/* Suggested tags below custom input */}
            {jobTitle && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2">Suggested based on your job title:</p>
                <div className="flex flex-wrap gap-2">
                  {generateExpertiseSuggestions(jobTitle).map((suggestion) => {
                    const isSelected = expertiseTags.includes(suggestion)
                    return (
                      <button
                        key={suggestion}
                        onClick={() => {
                          if (isSelected) {
                            removeExpertiseTag(suggestion)
                          } else {
                            setExpertiseTags([...expertiseTags, suggestion])
                          }
                        }}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm border transition-colors ${
                          isSelected
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'bg-muted/50 text-foreground border-border hover:bg-primary/10 hover:border-primary/20'
                        }`}
                      >
                        {isSelected ? '✓' : '+'} {suggestion}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Custom tags displayed below suggested tags */}
            {customExpertiseTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customExpertiseTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20"
                  >
                    {tag}
                    <button
                      onClick={() => removeCustomExpertiseTag(tag)}
                      className="ml-2 hover:text-destructive"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* LinkedIn URL */}
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
        </div>
      )
    },
    {
      id: "networking-goals",
      title: "Networking Goals",
      description: "What are you looking to network about?",
      component: (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              "Advice & Guidance",
              "Business Development",
              "Career Advancement",
              "Collaboration Opportunities",
              "Friends & Connections",
              "Industry Insights",
              "Mentorship",
              "Peer Relationships",
              "Professional Growth",
              "Skill Enhancement"
            ].map((goal) => (
              <div key={goal} className="flex items-center space-x-3 rounded-xl p-3 transition-colors">
                <Checkbox
                  id={`networking-${goal}`}
                  checked={networkingGoals.includes(goal)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setNetworkingGoals([...networkingGoals, goal])
                    } else {
                      setNetworkingGoals(networkingGoals.filter(g => g !== goal))
                    }
                  }}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label
                  htmlFor={`networking-${goal}`}
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  {goal}
                </label>
              </div>
            ))}
          </div>
          
          {/* Custom networking goal input */}
          <div>
            <Label htmlFor="customNetworkingGoal" className="text-sm font-medium text-foreground">
              Other (tell us what type of people you hope to meet)
            </Label>
            <Textarea
              id="customNetworkingGoal"
              value={customNetworkingGoal}
              onChange={(e) => setCustomNetworkingGoal(e.target.value)}
              placeholder="e.g., I'm looking to meet startup founders in the fintech space..."
              className="mt-1 rounded-xl"
              rows={3}
            />
          </div>
        </div>
      )
    }
  ]

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  }

  // Determine which steps to show based on how user arrived
  // If coming from event join: show only step 2 (networking goals) since profile is already complete
  // If not coming from event join: show only 2 steps (profile, professional), then redirect to /event/join
  const visibleSteps = fromEventJoin ? steps.slice(2) : steps.slice(0, 2)
  const currentStepData = visibleSteps[currentStep]
  const isLastStep = currentStep === visibleSteps.length - 1

  // Safety check - if currentStepData is undefined, reset to a valid step
  if (!currentStepData && visibleSteps.length > 0) {
    console.error('Invalid currentStep:', currentStep, 'visibleSteps length:', visibleSteps.length)
    // Reset to first step if we're in an invalid state
    if (currentStep >= visibleSteps.length) {
      setCurrentStep(0)
    }
  }

  // Show loading state if we don't have valid step data
  if (!currentStepData || visibleSteps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Full-screen loading overlay */}
      {(isLoading || isRedirecting) && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-8 text-center shadow-elevation">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {isRedirecting ? "Redirecting to your dashboard..." : "Setting up your profile..."}
            </h3>
            <p className="text-muted-foreground">
              {isRedirecting 
                ? "Taking you to your personalized homepage." 
                : "This may take a few moments. Please don't close this window."
              }
            </p>
          </div>
        </div>
      )}
      
      <div className="w-full max-w-2xl">
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
              {/* Only show back button if not on step 3 (networking goals) */}
              {!isLastStep && (
                <GradientButton
                  variant="outline"
                  onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                  disabled={currentStep === 0}
                >
                  Back
                </GradientButton>
              )}
              
              {/* Center the button if no back button */}
              <div className={isLastStep ? "w-full flex justify-center" : ""}>
                {isLastStep ? (
                  <GradientButton
                    onClick={handleCompleteOnboarding}
                    disabled={isLoading || (fromEventJoin ? false : (!firstName || !lastName || !jobTitle || !company))}
                  >
                    {isLoading ? "Completing..." : (fromEventJoin ? "Find Matches" : "Join Event")}
                  </GradientButton>
                ) : (
                  <GradientButton
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={
                      (currentStep === 0 && (!firstName || !lastName)) ||
                      (currentStep === 1 && (!jobTitle || !company))
                    }
                  >
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </GradientButton>
                )}
              </div>
            </div>
          </CardContent>
          
          {/* Progress Bar at Bottom - only show for non-final steps */}
          {!isLastStep && (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  Step {currentStep + 1} of {visibleSteps.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(((currentStep + 1) / visibleSteps.length) * 100)}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="gradient-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / visibleSteps.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
