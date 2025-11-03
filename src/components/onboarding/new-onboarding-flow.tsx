"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Checkbox } from "@/components/ui/checkbox"
import { ImageCropModal } from "@/components/ui/image-crop-modal"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { createClientComponentClient } from "@/lib/supabase"
import { User } from "@/lib/types"
import { toast } from "sonner"
import { Camera, ArrowRight, Upload, Select as SelectIcon, ArrowLeft, ChevronLeft, Loader2 } from "lucide-react"
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
  
  // Event-specific data
  const [whyAttending, setWhyAttending] = useState("")
  const [connectionTypesSelected, setConnectionTypesSelected] = useState<string[]>([])
  const [followUpResponses, setFollowUpResponses] = useState<Record<string, string>>({})
  const [businessNeed, setBusinessNeed] = useState("")
  
  // Adaptive Q&A state
  const [currentAdaptiveQuestion, setCurrentAdaptiveQuestion] = useState<{
    id: string
    text: string
    options: Array<{ key: string; label: string }>
  } | null>(null)
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false)
  const [adaptiveQnAComplete, setAdaptiveQnAComplete] = useState(false)
  
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
        const { data: person } = await supabase
          .from("users")
          .select("first_name, last_name, career_title, company_name, photo_url")
          .eq("user_id", user.id)
          .single()
        
        if (person) {
          setProfileExists(true)
          setFirstName(person.first_name || "")
          setLastName(person.last_name || "")
          setJobTitle(person.career_title || "")
          setCompany(person.company_name || "")
          setAvatarPreview(person.photo_url || null)
          
          // Profile is complete if has required fields
          const isComplete = person.first_name && person.last_name && person.career_title && person.company_name
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

  const handleCropSave = async (croppedImageUrl: string) => {
    console.log('handleCropSave called with URL:', croppedImageUrl)
    try {
      // Convert blob URL to File so it can be uploaded
      console.log('Fetching blob from URL...')
      const response = await fetch(croppedImageUrl)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.statusText}`)
      }
      
      console.log('Converting blob to File...')
      const blob = await response.blob()
      console.log('Blob received, size:', blob.size, 'type:', blob.type)
      
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      console.log('File created:', file.name, file.size, file.type)
      
      setAvatarFile(file)
      setAvatarPreview(croppedImageUrl)
      setShowCropModal(false)
      setTempImageUrl(null)
      
      console.log('Avatar file set successfully')
      toast.success('Photo saved!')
    } catch (error) {
      console.error('Error processing cropped image:', error)
      toast.error('Failed to process image. Please try again.')
    }
  }

  const handleCropCancel = () => {
    setShowCropModal(false)
    setTempImageUrl(null)
    setAvatarFile(null)
  }

  const uploadAvatar = async (userId: string) => {
    if (!avatarFile) {
      console.error('uploadAvatar: No avatar file provided')
      return null
    }

    const fileExt = avatarFile.name.split('.').pop() || 'jpg'
    const fileName = `${userId}.${fileExt}`
    const filePath = `${userId}/${fileName}`

    console.log('Uploading avatar:', {
      userId,
      fileName,
      filePath,
      fileSize: avatarFile.size,
      fileType: avatarFile.type
    })

    try {
      // Check if bucket exists and is accessible
      const { data: buckets, error: bucketsError } = await (supabase as any).storage.listBuckets()
      
      if (bucketsError) {
        console.error('Storage bucket check error:', {
          error: bucketsError,
          message: bucketsError.message,
          code: bucketsError.code
        })
        throw new Error(`Storage access error: ${bucketsError.message || 'Unable to access storage buckets'}`)
      }

      console.log('Available buckets:', buckets?.map((b: any) => b.name))

      const avatarsBucket = buckets?.find((b: any) => b.name === 'avatars')
      if (!avatarsBucket) {
        console.error('avatars bucket not found. Available buckets:', buckets?.map((b: any) => b.name))
        throw new Error('avatars storage bucket does not exist. Please create it in Supabase Storage.')
      }

      console.log('avatars bucket found:', {
        name: avatarsBucket.name,
        public: avatarsBucket.public,
        id: avatarsBucket.id
      })

      // Verify current user matches the path structure (RLS requirement)
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser || currentUser.id !== userId) {
        console.error('User mismatch:', {
          currentUserId: currentUser?.id,
          requestedUserId: userId
        })
        throw new Error('Authentication error: User ID mismatch')
      }

      console.log('Attempting upload to path:', filePath)

      // Upload with upsert to overwrite existing avatars
      const { data: uploadData, error: uploadError } = await (supabase as any).storage
        .from('avatars')
        .upload(filePath, avatarFile, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '3600'
        })

      if (uploadError) {
        console.error('Upload error details:', {
          error: uploadError,
          message: uploadError.message,
          statusCode: uploadError.statusCode,
          errorCode: uploadError.error,
          path: filePath,
          userId: userId
        })
        
        // Provide more helpful error messages
        if (uploadError.message?.includes('new row violates row-level security') || 
            uploadError.message?.includes('row-level security') ||
            uploadError.statusCode === 403) {
          throw new Error('Storage permission error: The avatars bucket RLS policy may not allow this upload. Please check that the RLS policy allows authenticated users to upload to paths matching their user ID.')
        }
        if (uploadError.message?.includes('Bucket not found') || uploadError.statusCode === 404) {
          throw new Error('avatars bucket not found. Please create it in Supabase Storage.')
        }
        throw new Error(`Upload failed: ${uploadError.message || 'Unknown error'}`)
      }

      console.log('Upload successful:', uploadData)

      // Get public URL
      const { data: urlData } = (supabase as any).storage
        .from('avatars')
        .getPublicUrl(filePath)

      console.log('Public URL data:', urlData)

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image')
      }

      console.log('Avatar uploaded successfully, public URL:', urlData.publicUrl)
      return urlData.publicUrl
    } catch (error: any) {
      console.error('Error uploading avatar:', {
        error,
        message: error?.message,
        stack: error?.stack,
        userId,
        filePath
      })
      throw error
    }
  }

  // Map UI connection type IDs to database format
  const mapConnectionTypeToDB = (uiId: string): string => {
    const mapping: Record<string, string> = {
      "business-opportunities": "biz_opps",
      "find-mentor": "find_mentor",
      "be-mentor": "be_mentor",
      "find-job": "find_job",
      "recruit": "recruit",
      "general": "general",
      "other": "other"
    }
    return mapping[uiId] || uiId
  }

  // Map database connection type IDs back to UI format
  const mapConnectionTypeFromDB = (dbId: string): string => {
    const mapping: Record<string, string> = {
      "biz_opps": "business-opportunities",
      "find_mentor": "find-mentor",
      "be_mentor": "be-mentor",
      "find_job": "find-job",
      "recruit": "recruit",
      "general": "general",
      "other": "other"
    }
    return mapping[dbId] || dbId
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
        .select("event_id, event_name")
        .eq("event_code", eventCode.toUpperCase())
        .single()

      if (eventError || !eventData) {
        toast.error("Event not found. Please check the code and try again.")
        return
      }

      const { error: joinError } = await supabase
        .from("attendance")
        .insert({
          event_id: eventData.event_id,
          user_id: user.id,
          checked_in_at: new Date().toISOString()
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
      router.push(`/onboarding?from=event-join&eventId=${eventData.event_id}`)
    } catch (error) {
      console.error("Error joining event:", error)
      toast.error("An error occurred while joining the event")
    } finally {
      setIsLoading(false)
    }
  }

  const getFollowUpQuestion = (typeId: string): string => {
    // Handle both UI format (with hyphens) and DB format (with underscores)
    const normalizedId = typeId.includes('-') ? typeId : mapConnectionTypeFromDB(typeId)
    
    switch (normalizedId) {
      case "find-mentor":
      case "find_mentor":
        return "What type of mentorship are you looking for?"
      case "be-mentor":
      case "be_mentor":
        return "What industries have you worked in or topics you know about?"
      case "business-opportunities":
      case "biz_opps":
        return "What opportunities are you looking for?"
      case "general":
        return "What are your hobbies and interests?"
      case "other":
        return "What are your career goals?"
      case "find-job":
      case "find_job":
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
        try {
          avatarUrl = await uploadAvatar(user.id)
          if (avatarUrl) {
            console.log('Photo uploaded successfully to Supabase Storage:', avatarUrl)
          }
        } catch (uploadError: any) {
          console.error('Failed to upload photo:', uploadError)
          const errorMessage = uploadError?.message || 'Unknown error'
          toast.error(`Photo upload failed: ${errorMessage}. Check console for details.`)
          // Continue with profile save even if photo upload fails
        }
      } else if (user.user_metadata?.avatar_url) {
        // Use Google OAuth photo if available and no manual upload
        avatarUrl = user.user_metadata.avatar_url
      }

      const expertiseArray = [areasOfExpertise]

      const { error: profileError } = await supabase
        .from("users")
        .upsert({
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: user.email || "",
          photo_url: avatarUrl,
          career_title: jobTitle,
          company_name: company,
          expertise_summary: expertiseArray.join(", ")
        }, {
          onConflict: 'user_id'
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
    if (!user || !eventId) {
      console.error("Missing user or eventId", { user: !!user, eventId })
      return
    }

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
      // Map connection types to database format
      const dbConnectionTypes = connectionTypesSelected.map(mapConnectionTypeToDB)
      
      // Map follow-up responses keys to database format
      const dbFollowUpResponses: Record<string, string> = {}
      Object.keys(followUpResponses).forEach(uiKey => {
        const dbKey = mapConnectionTypeToDB(uiKey)
        dbFollowUpResponses[dbKey] = followUpResponses[uiKey]
      })

      console.log("Saving event onboarding:", {
        event_id: eventId,
        user_id: user.id,
        why_attending_text: whyAttending,
        connection_types_selected: dbConnectionTypes,
        connection_followups_json: dbFollowUpResponses,
        business_need_text: businessNeed
      })

      const { data, error } = await (supabase as any)
        .from("attendance")
        .upsert({
          event_id: eventId,
          user_id: user.id,
          why_attending_text: whyAttending,
          connection_types_selected: dbConnectionTypes,
          connection_followups_json: dbFollowUpResponses,
          business_need_text: businessNeed,
          onboarding_completed: false // Will be set to true after adaptive Q&A
        }, { onConflict: 'event_id,user_id' })
        .select()

      if (error) {
        console.error("Event onboarding error details:", {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        toast.error(`Failed to save your responses: ${error.message || 'Please try again.'}`)
        return
      }

      console.log("Event onboarding saved successfully:", data)
      
      // Event questions saved, now start adaptive Q&A
      toast.success("Saved! Let's continue...")
      
      // Load first adaptive question
      await loadNextAdaptiveQuestion()
      
    } catch (error: any) {
      console.error("Error completing event onboarding:", {
        error,
        message: error?.message,
        stack: error?.stack
      })
      toast.error(`An error occurred: ${error?.message || 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Load next adaptive question
  const loadNextAdaptiveQuestion = async (selectedOption?: { qid: string; choice: string }) => {
    if (!user || !eventId) return

    setIsLoadingQuestion(true)
    try {
      const response = await fetch('/api/questions/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          userId: user.id,
          selectedOption
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Error loading next question:', error)
        toast.error('Failed to load next question')
        return
      }

      const result = await response.json()

      if (result.done) {
        // Questions complete, derive attendance and match
        setAdaptiveQnAComplete(true)
        await completeAdaptiveQnA()
      } else if (result.question) {
        setCurrentAdaptiveQuestion(result.question)
      }
    } catch (error: any) {
      console.error('Error loading adaptive question:', error)
      toast.error('An error occurred loading the question')
    } finally {
      setIsLoadingQuestion(false)
    }
  }

  // Handle adaptive question answer selection
  const handleAdaptiveAnswer = async (choice: string) => {
    if (!currentAdaptiveQuestion) return

    const selectedOption = {
      qid: currentAdaptiveQuestion.id,
      choice
    }

    // Auto-advance to next question
    await loadNextAdaptiveQuestion(selectedOption)
  }

  // Complete adaptive Q&A flow
  const completeAdaptiveQnA = async () => {
    if (!user || !eventId) return

    setIsLoading(true)
    try {
      // Derive attendance (generate summary, embedding, tags)
      const deriveResponse = await fetch('/api/derive-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, userId: user.id })
      })

      if (!deriveResponse.ok) {
        const error = await deriveResponse.json()
        console.error('Error deriving attendance:', error)
        toast.error('Failed to process your profile')
        return
      }

      // Trigger incremental matching
      const matchResponse = await fetch('/api/match-incremental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, userId: user.id })
      })

      const matchResult = await matchResponse.json()
      const matchCount = matchResult.match_count || 0

      if (matchCount > 0) {
        // Show confetti and success message
        toast.success(`🎉 Great! We found ${matchCount} ${matchCount === 1 ? 'match' : 'matches'} for you!`)
      } else {
        toast.success('Profile complete!')
      }

      // Redirect to home
      setIsRedirecting(true)
      setTimeout(() => {
        router.push('/home')
      }, 2000)

    } catch (error: any) {
      console.error('Error completing adaptive Q&A:', error)
      toast.error('An error occurred')
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

  // Show adaptive Q&A if we have a current question or are loading one
  const showAdaptiveQnA = currentAdaptiveQuestion || isLoadingQuestion || adaptiveQnAComplete

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (showAdaptiveQnA) {
      // For adaptive Q&A, we don't know total questions, so show 90%+ to indicate near completion
      return adaptiveQnAComplete ? 100 : 90
    }
    return ((currentStep + 1) / visibleSteps.length) * 100
  }

  // Check if step is valid for continue button
  const isStepValid = () => {
    if (!currentStepData) return false
    if (currentStepData.id === "profile") return firstName && lastName
    if (currentStepData.id === "professional") return jobTitle && company && yearsExperience && areasOfExpertise
    if (currentStepData.id === "connection-types") return connectionTypesSelected.length > 0
    if (currentStepData.id === "why-attending") return whyAttending.trim().length > 0
    return true
  }

  // Handle next step
  const handleNext = () => {
    if (!currentStepData) return
    
    const stepId = currentStepData.id
    if (stepId === "profile" && !validateForm()) {
      toast.error("Please complete the required fields")
      return
    } else if (stepId === "professional" && !validateProfessionalForm()) {
      toast.error("Please complete all required fields")
      return
    } else if (stepId === "connection-types") {
      if (connectionTypesSelected.length === 0) {
        toast.error("Please select at least one connection type")
        return
      }
    }
    setCurrentStep(currentStep + 1)
  }

  // Handle back step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

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
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      {/* Loading/Redirecting overlay */}
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

      {/* Fixed Top Progress Bar */}
      {currentStep > 0 && (
        <div className="fixed top-0 left-0 right-0 z-20">
          <div className="w-full h-[2px] bg-muted">
            <div 
              className="gradient-progress h-[2px] transition-all duration-300 ease-out" 
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Main Content Area - Centered with max 512px */}
      <div className={`flex-1 flex items-center justify-center px-6 ${currentStep === 0 ? '' : 'md:items-center items-start pt-8 md:pt-0'} ${currentStep > 0 ? 'pb-48' : ''}`}>
        <div className={`w-full max-w-lg transition-all duration-300 animate-fade-up`}>
          {/* Adaptive Q&A Content */}
          {showAdaptiveQnA ? (
            <div className="space-y-6">
              {isLoadingQuestion ? (
                // Skeleton loading shimmer
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-3/4"></div>
                  <div className="space-y-3">
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                  </div>
                </div>
              ) : currentAdaptiveQuestion ? (
                // Show current question
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-6">
                      {currentAdaptiveQuestion.text}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {currentAdaptiveQuestion.options.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => handleAdaptiveAnswer(option.key)}
                        className="w-full p-4 text-left rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <span className="text-foreground font-medium">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : adaptiveQnAComplete ? (
                // Completion state
                <div className="text-center">
                  <p className="text-foreground">Processing your responses...</p>
                </div>
              ) : null}
            </div>
          ) : currentStepData ? (
            // Regular onboarding steps
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {currentStepData.title}
                </h2>
                <p className="text-muted-foreground">
                  {currentStepData.description}
                </p>
              </div>
              <div className="space-y-6">
                {currentStepData.component}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Fixed Bottom Navigation */}
      {currentStep > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border pb-4 px-6 z-10">
          <div className="max-w-lg mx-auto pt-4">
            <div className="flex gap-4 mb-2">
              {/* Back Button */}
              <GradientButton 
                variant="outline" 
                onClick={handleBack} 
                disabled={currentStep <= 1} 
                className="flex items-center justify-center w-16 h-16 rounded-2xl border-2 border-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-6 h-6" />
              </GradientButton>
              
              {/* Continue Button */}
              <GradientButton 
                onClick={isLastStep 
                  ? (profileCompleted ? handleCompleteEventOnboarding : handleCompleteProfile)
                  : handleNext
                } 
                disabled={isLastStep 
                  ? isLoading 
                  : !isStepValid() || isLoading || isLoadingQuestion
                } 
                className="flex-1 h-16 rounded-2xl text-lg font-medium gradient-primary text-white hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || isLoadingQuestion ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading...
                  </span>
                ) : isLastStep ? (
                  isLoading ? "Completing..." : "Complete"
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </GradientButton>
            </div>
            
            {/* Footer */}
            {currentStep >= 3 && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Service provided by <a href="https://www.linkedin.com/company/intro-event" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">INTRO</a>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      
      <ImageCropModal
        isOpen={showCropModal}
        onClose={handleCropCancel}
        onSave={handleCropSave}
        imageUrl={tempImageUrl || ''}
      />
    </div>
  )
}

