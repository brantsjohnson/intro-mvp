"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Checkbox } from "@/components/ui/checkbox"
import { HobbiesGridNew } from "@/components/ui/hobbies-grid-new"
import { ImageCropModal } from "@/components/ui/image-crop-modal"
import { PersonalitySelect } from "@/components/ui/personality-select"
import { ExpertiseSuggestions } from "@/components/ui/expertise-suggestions"
import { NetworkingGoalsNew } from "@/components/ui/networking-goals-new"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { User, Hobby } from "@/lib/types"
import { useAutoSave } from "@/lib/use-autosave"
import { toast } from "sonner"
import { Camera, ArrowRight, Upload, Settings } from "lucide-react"


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
  const [networkingGoals, setNetworkingGoals] = useState<string[]>([])
  const [networkingGoalDetails, setNetworkingGoalDetails] = useState<Record<string, string>>({})
  const [customNetworkingGoal, setCustomNetworkingGoal] = useState("")
  const [isJoiningEvent, setIsJoiningEvent] = useState(false)
  
  // Profile data
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [careerGoals, setCareerGoals] = useState("")
  const [mbti, setMbti] = useState("")
  const [enneagram, setEnneagram] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [hobbyDetails, setHobbyDetails] = useState<Record<number, string>>({})
  const [customHobbies, setCustomHobbies] = useState<Array<{ id: string; label: string; details?: string }>>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Auto-save functionality
  useAutoSave({
    userId: user?.id || null,
    user: user,
    data: {
      firstName,
      lastName,
      mbti,
      enneagram,
      selectedHobbies,
      hobbyDetails,
      customHobbies,
      jobTitle,
      company,
      careerGoals,
      expertiseTags,
      customExpertiseTags,
      networkingGoals,
      networkingGoalDetails,
      customNetworkingGoal
    },
    enabled: !!user && (firstName || lastName) // Only auto-save if user exists and has basic info
  })


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
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be smaller than 5MB")
        return
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error("Please select an image file")
        return
      }
      
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        setTempImageUrl(result)
        setShowCropModal(true)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleTakePhoto = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()
      
      // Create a canvas to capture the photo
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      
      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context?.drawImage(video, 0, 0)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
            setAvatarFile(file)
            const url = URL.createObjectURL(blob)
            setTempImageUrl(url)
            setShowCropModal(true)
          }
          
          // Stop the camera
          stream.getTracks().forEach(track => track.stop())
        }, 'image/jpeg', 0.9)
      })
    } catch (error) {
      console.error('Camera error:', error)
      toast.error("Camera access denied. Please use upload instead.")
    }
  }

  const handleCropSave = (croppedImageUrl: string) => {
    setAvatarPreview(croppedImageUrl)
    setShowCropModal(false)
    setTempImageUrl(null)
  }

  const handleCropCancel = () => {
    setShowCropModal(false)
    setTempImageUrl(null)
    setAvatarFile(null)
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


  const handleCustomHobbyAdd = (label: string) => {
    const newHobby = {
      id: crypto.randomUUID(),
      label,
      details: ''
    }
    setCustomHobbies([...customHobbies, newHobby])
  }

  const handleCustomHobbyRemove = (id: string) => {
    setCustomHobbies(customHobbies.filter(hobby => hobby.id !== id))
  }

  const handleCustomHobbyDetailsChange = (id: string, details: string) => {
    setCustomHobbies(customHobbies.map(hobby => 
      hobby.id === id ? { ...hobby, details } : hobby
    ))
  }

  const handleHobbyDetailsChange = (hobbyId: number, details: string) => {
    setHobbyDetails(prev => ({
      ...prev,
      [hobbyId]: details
    }))
  }

  const handleNetworkingGoalChange = (goalId: string, checked: boolean) => {
    if (checked) {
      setNetworkingGoals([...networkingGoals, goalId])
    } else {
      setNetworkingGoals(networkingGoals.filter(id => id !== goalId))
      // Clear details when goal is unchecked
      setNetworkingGoalDetails(prev => {
        const newDetails = { ...prev }
        delete newDetails[goalId]
        return newDetails
      })
    }
  }

  const handleNetworkingGoalDetailChange = (goalId: string, detail: string) => {
    setNetworkingGoalDetails(prev => ({
      ...prev,
      [goalId]: detail
    }))
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

  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    if (!firstName.trim()) {
      errors.firstName = "Please add your first name"
    }
    if (!lastName.trim()) {
      errors.lastName = "Please add your last name"
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateProfessionalForm = () => {
    const errors: Record<string, string> = {}
    
    if (!jobTitle.trim()) {
      errors.jobTitle = "Please enter your job title"
    }
    if (!company.trim()) {
      errors.company = "Please enter your company"
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCompleteOnboarding = async () => {
    if (!user) return

    // Validate required fields
    if (!validateForm()) {
      toast.error("Please complete the required fields")
      return
    }

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

      // Build hobbies array from all hobby data
      const hobbiesArray: string[] = []
      
      // Add selected hobbies with details
      selectedHobbies.forEach(hobbyId => {
        const hobby = hobbies.find(h => h.id === hobbyId)
        if (hobby) {
          const details = hobbyDetails[hobbyId]
          if (details && details.trim()) {
            hobbiesArray.push(`${hobby.label}: ${details.trim()}`)
          } else {
            hobbiesArray.push(hobby.label)
          }
        }
      })
      
      // Add custom hobbies with details
      customHobbies.forEach(customHobby => {
        if (customHobby.details && customHobby.details.trim()) {
          hobbiesArray.push(`${customHobby.label}: ${customHobby.details.trim()}`)
        } else {
          hobbiesArray.push(customHobby.label)
        }
      })

      // Build expertise array
      const expertiseArray = [
        ...(expertiseTags || []),
        ...(customExpertiseTags || [])
      ]

      // Debug: Log the data being saved
      console.log('Saving profile data:', {
        hobbiesArray,
        expertiseArray,
        selectedHobbies,
        customHobbies,
        expertiseTags,
        customExpertiseTags
      })

      // Update profile - use explicit update instead of upsert to ensure all fields are updated
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          email: user.email || "",
          avatar_url: avatarUrl,
          job_title: jobTitle,
          company: company,
          what_do_you_do: careerGoals,
          mbti: mbti,
          enneagram: enneagram,
          networking_goals: customNetworkingGoal.trim() 
            ? [...networkingGoals, customNetworkingGoal.trim()]
            : networkingGoals,
          hobbies: hobbiesArray,
          expertise_tags: expertiseArray,
          consent: true
        })
        .eq("id", user.id)

      // If update fails (profile doesn't exist), create it
      if (profileError && profileError.code === 'PGRST116') {
        console.log('Profile not found, creating new profile...')
        const { error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            first_name: firstName,
            last_name: lastName,
            email: user.email || "",
            avatar_url: avatarUrl,
            job_title: jobTitle,
            company: company,
            what_do_you_do: careerGoals,
            mbti: mbti,
            enneagram: enneagram,
            networking_goals: customNetworkingGoal.trim() 
              ? [...networkingGoals, customNetworkingGoal.trim()]
              : networkingGoals,
            hobbies: hobbiesArray,
            expertise_tags: expertiseArray,
            consent: true
          })
        
        if (insertError) {
          console.error("Profile insert error:", insertError)
          toast.error("Failed to create profile. Please try again.")
          return
        }
      } else if (profileError) {
        console.error("Profile update error:", profileError)
        toast.error("Failed to update profile. Please try again.")
        return
      }

      // All hobby and expertise data is now stored in the profiles table
      // No need for separate table operations

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
                ) : firstName && lastName ? (
                  <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-lg">
                    {firstName[0]}{lastName[0]}
                  </div>
                ) : (
                  <Camera className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    id="avatar-upload"
                  />
                  <Label htmlFor="avatar-upload" className="cursor-pointer">
                    <GradientButton variant="outline" size="sm" asChild>
                      <span className="flex items-center">
                        <Upload className="h-4 w-4 mr-1" />
                        {avatarPreview ? 'Change Photo' : 'Upload Photo'}
                      </span>
                    </GradientButton>
                  </Label>
                  <GradientButton variant="outline" size="sm" onClick={handleTakePhoto}>
                    <Camera className="h-4 w-4 mr-1" />
                    Take Photo
                  </GradientButton>
                </div>
                <p className="text-xs text-muted-foreground">
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
                onChange={(e) => {
                  setFirstName(e.target.value)
                  if (validationErrors.firstName) {
                    setValidationErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.firstName
                      return newErrors
                    })
                  }
                }}
                placeholder="e.g. John"
                className={`mt-1 rounded-xl ${validationErrors.firstName ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.firstName && (
                <p className="text-xs text-destructive mt-1">{validationErrors.firstName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName" className="text-sm font-medium text-foreground">
                Last Name *
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value)
                  if (validationErrors.lastName) {
                    setValidationErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.lastName
                      return newErrors
                    })
                  }
                }}
                placeholder="e.g. Doe"
                className={`mt-1 rounded-xl ${validationErrors.lastName ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.lastName && (
                <p className="text-xs text-destructive mt-1">{validationErrors.lastName}</p>
              )}
            </div>
          </div>

          {/* Personality Types */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PersonalitySelect
              value={mbti}
              onChange={setMbti}
              type="mbti"
            />
            <PersonalitySelect
              value={enneagram}
              onChange={setEnneagram}
              type="enneagram"
            />
          </div>

          {/* Hobbies & Interests */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Hobbies & Interests
            </Label>
            <HobbiesGridNew
              hobbies={hobbies}
              selectedHobbies={selectedHobbies}
              customHobbies={customHobbies}
              hobbyDetails={hobbyDetails}
              onHobbyChange={(hobbyId, checked) => {
                if (checked) {
                  setSelectedHobbies([...selectedHobbies, hobbyId])
                } else {
                  setSelectedHobbies(selectedHobbies.filter(id => id !== hobbyId))
                  // Remove details when hobby is unchecked
                  setHobbyDetails(prev => {
                    const newDetails = { ...prev }
                    delete newDetails[hobbyId]
                    return newDetails
                  })
                }
              }}
              onHobbyDetailsChange={handleHobbyDetailsChange}
              onCustomHobbyAdd={handleCustomHobbyAdd}
              onCustomHobbyRemove={handleCustomHobbyRemove}
              onCustomHobbyDetailsChange={handleCustomHobbyDetailsChange}
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
                onChange={(e) => {
                  setJobTitle(e.target.value)
                  if (validationErrors.jobTitle) {
                    setValidationErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.jobTitle
                      return newErrors
                    })
                  }
                }}
                placeholder="e.g. Software Engineer"
                className={`mt-1 rounded-xl ${validationErrors.jobTitle ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.jobTitle && (
                <p className="text-xs text-destructive mt-1">{validationErrors.jobTitle}</p>
              )}
            </div>
            <div>
              <Label htmlFor="company" className="text-sm font-medium text-foreground">
                Company *
              </Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value)
                  if (validationErrors.company) {
                    setValidationErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.company
                      return newErrors
                    })
                  }
                }}
                placeholder="e.g. Tech Corp"
                className={`mt-1 rounded-xl ${validationErrors.company ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.company && (
                <p className="text-xs text-destructive mt-1">{validationErrors.company}</p>
              )}
            </div>
          </div>

          {/* Career Goals */}
          <div>
            <Label htmlFor="careerGoals" className="text-sm font-medium text-foreground">
              What are your career goals? (Optional)
            </Label>
            <Textarea
              id="careerGoals"
              value={careerGoals}
              onChange={(e) => setCareerGoals(e.target.value)}
              placeholder="e.g., Move into product leadership, learn fundraising, expand into international markets."
              className="mt-1 rounded-xl"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This helps us connect you with people who share your professional interests or can help you grow.
            </p>
          </div>

          {/* Areas of Expertise with AI suggestions */}
          <ExpertiseSuggestions
            jobTitle={jobTitle}
            company={company}
            careerGoals={careerGoals}
            selectedExpertise={expertiseTags}
            customExpertise={customExpertiseTags}
            onExpertiseChange={setExpertiseTags}
            onCustomExpertiseChange={setCustomExpertiseTags}
          />
        </div>
      )
    },
    {
      id: "networking-goals",
      title: "Networking Goals",
      description: "What are you hoping to get out of this event?",
      component: (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Your goals help us connect you with the right people.
          </p>
          
          <NetworkingGoalsNew
            selectedGoals={networkingGoals}
            goalDetails={networkingGoalDetails}
            customGoal={customNetworkingGoal}
            onGoalChange={handleNetworkingGoalChange}
            onGoalDetailChange={handleNetworkingGoalDetailChange}
            onCustomGoalChange={setCustomNetworkingGoal}
          />
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
                    disabled={isLoading || (fromEventJoin ? (networkingGoals.length === 0 && !customNetworkingGoal.trim()) : (!firstName || !lastName || !jobTitle || !company))}
                  >
                    {isLoading ? "Completing..." : (fromEventJoin ? "Find Matches" : "Join Event")}
                  </GradientButton>
                ) : (
                  <GradientButton
                    onClick={() => {
                      if (currentStep === 0) {
                        if (!validateForm()) {
                          toast.error("Please complete the required fields")
                          return
                        }
                      } else if (currentStep === 1) {
                        if (!validateProfessionalForm()) {
                          toast.error("Please complete the required fields")
                          return
                        }
                      }
                      setCurrentStep(currentStep + 1)
                    }}
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
      
      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={showCropModal}
        onClose={handleCropCancel}
        onSave={handleCropSave}
        imageUrl={tempImageUrl || ''}
      />
    </div>
  )
}
