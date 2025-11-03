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
import { ExpertiseSuggestions } from "@/components/ui/expertise-suggestions"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { User, Hobby } from "@/lib/types"
import { toast } from "sonner"
import { Camera, ArrowRight, Upload, Select as SelectIcon, ArrowLeft } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface OnboardingStep {
  id: string
  title: string
  description: string
  component: React.ReactNode
}

// Connection type options
const connectionTypes = [
  { id: "general", label: "General Connections" },
  { id: "business-opportunities", label: "Discover Business Opportunities" },
  { id: "find-mentor", label: "Find a Mentor" },
  { id: "be-mentor", label: "Be a Mentor" },
  { id: "find-job", label: "Find a Job" },
  { id: "recruit", label: "Recruit" },
  { id: "other", label: "Other" }
]

// Years of experience options
const experienceOptions = [
  "0-1 years",
  "2-5 years",
  "6-10 years",
  "11-15 years",
  "16-20 years",
  "21+ years"
]

export function NewOnboardingFlow() {
  const searchParams = useSearchParams()
  const eventCode = searchParams.get('code')
  const eventId = searchParams.get('eventId')
  const fromEventJoin = searchParams.get('from') === 'event-join'
  
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [profileCompleted, setProfileCompleted] = useState(false)
  const [profileExists, setProfileExists] = useState(false)
  
  // Profile data (one-time)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [yearsExperience, setYearsExperience] = useState("")
  const [areasOfExpertise, setAreasOfExpertise] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  
  // Hobbies data
  const [hobbies, setHobbies] = useState<Hobby[]>([])
  const [selectedHobbies, setSelectedHobbies] = useState<number[]>([])
  const [hobbyDetails, setHobbyDetails] = useState<Record<number, string>>({})
  const [customHobbies, setCustomHobbies] = useState<Array<{ id: string; label: string; details?: string }>>([])
  
  // Expertise data
  const [expertiseTags, setExpertiseTags] = useState<string[]>([])
  const [customExpertiseTags, setCustomExpertiseTags] = useState<string[]>([])
  
  // Event-specific data
  const [whyAttending, setWhyAttending] = useState("")
  const [connectionTypesSelected, setConnectionTypesSelected] = useState<string[]>([])
  const [followUpResponses, setFollowUpResponses] = useState<Record<string, string>>({})
  const [businessNeed, setBusinessNeed] = useState("")
  
  // Adaptive questions
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<any[]>([])
  const [adaptiveResponses, setAdaptiveResponses] = useState<Record<string, any>>({})
  const [currentAdaptiveQuestionIndex, setCurrentAdaptiveQuestionIndex] = useState(0)
  const [showAdaptiveQuestions, setShowAdaptiveQuestions] = useState(false)
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Check if user has completed profile
  useEffect(() => {
    const checkProfileStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        
        // Pre-fill from Google OAuth
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
        
        // Check if profile exists and is complete
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, job_title, company, avatar_url")
          .eq("id", user.id)
          .single()
        
        if (profile) {
          setProfileExists(true)
          setFirstName(profile.first_name || "")
          setLastName(profile.last_name || "")
          setJobTitle(profile.job_title || "")
          setCompany(profile.company || "")
          setAvatarPreview(profile.avatar_url || null)
          
          // Profile is complete if has required fields
          const isComplete = profile.first_name && profile.last_name && profile.job_title && profile.company
          setProfileCompleted(isComplete)
          
          if (isComplete) {
            // Skip profile steps if complete
            if (fromEventJoin) {
              // Jump to event-specific questions
              setCurrentStep(0) // Will be adjusted based on visible steps
            } else {
              // User wants to join an event
              setCurrentStep(0) // Will show event code entry
            }
          }
        }
      } else {
        // No user, redirect to auth
        setTimeout(() => {
          router.push("/auth")
        }, 1000)
      }
    }
    
    checkProfileStatus()
  }, [router, supabase, fromEventJoin])

  useEffect(() => {
    const fetchHobbies = async () => {
      const { data, error } = await (supabase as any)
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
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be smaller than 5MB")
        return
      }
      
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

    const { error: uploadError } = await (supabase as any).storage
      .from('avatars')
      .upload(filePath, avatarFile)

    if (uploadError) {
      throw uploadError
    }

    const { data } = (supabase as any).storage
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

  const handleHobbyDetailsChange = (hobbyId: number, details: string) => {
    setHobbyDetails(prev => ({
      ...prev,
      [hobbyId]: details
    }))
  }

  const handleConnectionTypeChange = (typeId: string, checked: boolean) => {
    if (checked) {
      setConnectionTypesSelected([...connectionTypesSelected, typeId])
    } else {
      setConnectionTypesSelected(connectionTypesSelected.filter(id => id !== typeId))
      setFollowUpResponses(prev => {
        const newResponses = { ...prev }
        delete newResponses[typeId]
        return newResponses
      })
    }
  }

  const handleJoinEvent = async (eventCode: string) => {
    if (!user) {
      toast.error("You must be logged in to join an event")
      return
    }

    setIsLoading(true)
    try {
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id, name")
        .eq("code", eventCode.toUpperCase())
        .single()

      if (eventError || !eventData) {
        toast.error("Event not found. Please check the code and try again.")
        return
      }

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

      // Update URL and move to next step
      router.push(`/onboarding?from=event-join&eventId=${eventData.id}`)
    } catch (error) {
      console.error("Error joining event:", error)
      toast.error("An error occurred while joining the event")
    } finally {
      setIsLoading(false)
    }
  }

  const getFollowUpQuestion = (typeId: string): string => {
    switch (typeId) {
      case "find-mentor":
        return "What type of mentorship are you looking for?"
      case "be-mentor":
        return "What industries have you worked in or topics you know about?"
      case "business-opportunities":
        return "What opportunities are you looking for?"
      case "general":
        return "What are your hobbies and interests?"
      case "other":
        return "What are your career goals?"
      case "find-job":
        return "What type of job are you looking for?"
      case "recruit":
        return "What roles are you recruiting for?"
      default:
        return ""
    }
  }

  const shouldShowBusinessNeed = () => {
    return connectionTypesSelected.length > 0 && !connectionTypesSelected.includes("find-job")
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
    if (!yearsExperience) {
      errors.yearsExperience = "Please select years of experience"
    }
    if (!areasOfExpertise.trim()) {
      errors.areasOfExpertise = "Please enter areas of expertise"
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCompleteProfile = async () => {
    if (!user) return

    if (!validateProfessionalForm()) {
      toast.error("Please complete all required fields")
      return
    }

    setIsLoading(true)
    try {
      let avatarUrl = null
      if (avatarFile) {
        avatarUrl = await uploadAvatar(user.id)
      } else if (user.user_metadata?.avatar_url) {
        avatarUrl = user.user_metadata.avatar_url
      }

      const hobbiesArray: string[] = []
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
      customHobbies.forEach(customHobby => {
        if (customHobby.details && customHobby.details.trim()) {
          hobbiesArray.push(`${customHobby.label}: ${customHobby.details.trim()}`)
        } else {
          hobbiesArray.push(customHobby.label)
        }
      })

      const expertiseArray = [
        areasOfExpertise,
        ...(expertiseTags || []),
        ...(customExpertiseTags || [])
      ]

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: user.email || "",
          avatar_url: avatarUrl,
          job_title: jobTitle,
          company: company,
          expertise_tags: expertiseArray,
          hobbies: hobbiesArray,
          consent: true
        }, {
          onConflict: 'id'
        })

      if (profileError) {
        console.error("Profile upsert error:", profileError)
        toast.error("Failed to save profile. Please try again.")
        return
      }

      toast.success("Profile completed!")
      setProfileCompleted(true)
      
      // If event code exists, move to event questions
      if (eventCode) {
        await handleJoinEvent(eventCode)
      } else if (!fromEventJoin) {
        // Otherwise, go to event join page
        router.push("/event/join")
      } else {
        // Already in event join flow, move to next step
        setCurrentStep(0) // Will show event questions
      }
    } catch (error) {
      console.error("Error completing profile:", error)
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCompleteEventOnboarding = async () => {
    if (!user || !eventId) return

    if (!whyAttending.trim()) {
      toast.error("Please tell us why you're attending this event")
      return
    }

    if (connectionTypesSelected.length === 0) {
      toast.error("Please select at least one connection type")
      return
    }

    setIsLoading(true)
    try {
      // For now, just save the connection types to event_networking_goals
      // Note: We may need to create a separate table for full event onboarding data
      const { error } = await (supabase as any)
        .from("event_networking_goals")
        .upsert({
          event_id: eventId,
          user_id: user.id,
          networking_goals: connectionTypesSelected
        })

      if (error) {
        console.error("Event onboarding error:", error)
        toast.error("Failed to save your responses. Please try again.")
        return
      }

      toast.success("Event onboarding completed!")
      
      setIsRedirecting(true)
      setTimeout(() => {
        router.push("/home")
      }, 1500)
    } catch (error) {
      console.error("Error completing event onboarding:", error)
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  // Define steps based on whether profile is completed
  const profileSteps: OnboardingStep[] = [
    {
      id: "profile",
      title: "Complete Your Profile",
      description: "Tell us about yourself",
      component: (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">
              Profile Photo
            </Label>
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
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
              </div>
            </div>
          </div>

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
        </div>
      )
    },
    {
      id: "professional",
      title: "Professional Information",
      description: "Tell us about your work and expertise",
      component: (
        <div className="space-y-6">
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

          <div>
            <Label htmlFor="yearsExperience" className="text-sm font-medium text-foreground">
              Years of Experience *
            </Label>
            <Select
              value={yearsExperience}
              onValueChange={(value) => {
                setYearsExperience(value)
                if (validationErrors.yearsExperience) {
                  setValidationErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.yearsExperience
                    return newErrors
                  })
                }
              }}
            >
              <SelectTrigger className={`mt-1 rounded-xl ${validationErrors.yearsExperience ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Select years of experience" />
              </SelectTrigger>
              <SelectContent>
                {experienceOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.yearsExperience && (
              <p className="text-xs text-destructive mt-1">{validationErrors.yearsExperience}</p>
            )}
          </div>

          <div>
            <Label htmlFor="areasOfExpertise" className="text-sm font-medium text-foreground">
              Areas of Expertise *
            </Label>
            <Input
              id="areasOfExpertise"
              value={areasOfExpertise}
              onChange={(e) => {
                setAreasOfExpertise(e.target.value)
                if (validationErrors.areasOfExpertise) {
                  setValidationErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.areasOfExpertise
                    return newErrors
                  })
                }
              }}
              placeholder="e.g. AI, Software Development, Product Design"
              className={`mt-1 rounded-xl ${validationErrors.areasOfExpertise ? 'border-destructive' : ''}`}
              required
            />
            {validationErrors.areasOfExpertise && (
              <p className="text-xs text-destructive mt-1">{validationErrors.areasOfExpertise}</p>
            )}
          </div>

          <ExpertiseSuggestions
            jobTitle={jobTitle}
            company={company}
            selectedExpertise={expertiseTags}
            customExpertise={customExpertiseTags}
            onExpertiseChange={setExpertiseTags}
            onCustomExpertiseChange={setCustomExpertiseTags}
          />
        </div>
      )
    },
    {
      id: "hobbies",
      title: "Hobbies & Interests",
      description: "What are you passionate about?",
      component: (
        <div className="space-y-6">
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
            onCustomHobbyDetailsChange={(id, details) => {
              setCustomHobbies(customHobbies.map(hobby => 
                hobby.id === id ? { ...hobby, details } : hobby
              ))
            }}
          />
        </div>
      )
    }
  ]

  const eventSteps: OnboardingStep[] = [
    {
      id: "why-attending",
      title: "Why are you attending?",
      description: "Help us understand your goals for this event",
      component: (
        <div className="space-y-4">
          <Textarea
            value={whyAttending}
            onChange={(e) => setWhyAttending(e.target.value)}
            placeholder="Tell us why you chose to attend this event..."
            className="rounded-xl min-h-[120px]"
            rows={5}
          />
        </div>
      )
    },
    {
      id: "connection-types",
      title: "Connection Types",
      description: "What types of connections would you be ok with?",
      component: (
        <div className="space-y-4">
          {connectionTypes.map((type) => (
            <div key={type.id} className="flex items-center space-x-3 rounded-xl p-4 transition-colors hover:bg-muted/50">
              <Checkbox
                id={`connection-${type.id}`}
                checked={connectionTypesSelected.includes(type.id)}
                onCheckedChange={(checked) => handleConnectionTypeChange(type.id, checked as boolean)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <label
                htmlFor={`connection-${type.id}`}
                className="text-sm font-medium cursor-pointer flex-1"
              >
                {type.label}
              </label>
            </div>
          ))}
        </div>
      )
    },
    {
      id: "follow-ups",
      title: "Tell us more",
      description: "Help us find the right connections",
      component: (
        <div className="space-y-4">
          {connectionTypesSelected.map((typeId) => {
            const question = getFollowUpQuestion(typeId)
            if (!question) return null
            
            return (
              <div key={typeId}>
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  {question}
                </Label>
                <Textarea
                  value={followUpResponses[typeId] || ""}
                  onChange={(e) => setFollowUpResponses(prev => ({
                    ...prev,
                    [typeId]: e.target.value
                  }))}
                  placeholder={question}
                  className="rounded-xl min-h-[100px]"
                  rows={4}
                />
              </div>
            )
          })}
        </div>
      )
    },
    ...(shouldShowBusinessNeed() ? [{
      id: "business-need",
      title: "Business Need",
      description: "What is your business looking for?",
      component: (
        <div className="space-y-4">
          <Textarea
            value={businessNeed}
            onChange={(e) => setBusinessNeed(e.target.value)}
            placeholder="What is something your business is in need of right now?"
            className="rounded-xl min-h-[120px]"
            rows={5}
          />
        </div>
      )
    }] : [])
  ]

  const visibleSteps = profileCompleted ? eventSteps : profileSteps
  const currentStepData = visibleSteps[currentStep]
  const isLastStep = currentStep === visibleSteps.length - 1

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!currentStepData) {
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
      {(isLoading || isRedirecting) && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-8 text-center shadow-elevation">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {isRedirecting ? "Redirecting to your dashboard..." : "Saving your information..."}
            </h3>
            <p className="text-muted-foreground">
              {isRedirecting 
                ? "Taking you to your personalized homepage." 
                : "This may take a few moments."
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
              <GradientButton
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </GradientButton>
              
              <div className="flex-1" />
              
              {isLastStep ? (
                <GradientButton
                  onClick={profileCompleted ? handleCompleteEventOnboarding : handleCompleteProfile}
                  disabled={isLoading}
                >
                  {isLoading ? "Completing..." : "Complete"}
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
                        toast.error("Please complete all required fields")
                        return
                      }
                    }
                    setCurrentStep(currentStep + 1)
                  }}
                  disabled={
                    (currentStep === 0 && (!firstName || !lastName)) ||
                    (currentStep === 1 && (!jobTitle || !company || !yearsExperience || !areasOfExpertise))
                  }
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </GradientButton>
              )}
            </div>
          </CardContent>
          
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
      
      <ImageCropModal
        isOpen={showCropModal}
        onClose={handleCropCancel}
        onSave={handleCropSave}
        imageUrl={tempImageUrl || ''}
      />
    </div>
  )
}

