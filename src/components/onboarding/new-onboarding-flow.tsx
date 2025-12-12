"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Checkbox } from "@/components/ui/checkbox"
import { createClientComponentClient } from "@/lib/supabase"
import { haptics } from "@/lib/haptics"
import { User } from "@/lib/types"
import { ArrowRight, ChevronLeft, Loader2, Camera, X, Upload } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageCropModal } from "@/components/ui/image-crop-modal"
import { CameraCapture } from "@/components/ui/camera-capture"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

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

// Helper function to convert text to Sentence Case (only first letter capitalized)
function toSentenceCase(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

export function NewOnboardingFlow() {
  const searchParams = useSearchParams()
  const eventCode = searchParams.get('code') // Can be encrypted code or legacy eventCode
  const encryptedCode = eventCode // For encrypted codes
  const eventId = searchParams.get('eventId')
  const fromEventJoin = searchParams.get('from') === 'event-join'
  const fromAutoJoin = searchParams.get('from') === 'auto-join'
  
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [profileCompleted, setProfileCompleted] = useState(false)
  const [profileExists, setProfileExists] = useState(false)
  const [eventName, setEventName] = useState<string>("")
  
  // Profile data (one-time)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [company, setCompany] = useState("")
  const [yearsExperience, setYearsExperience] = useState("")
  const [areasOfExpertise, setAreasOfExpertise] = useState<string[]>([])
  const [expertiseInput, setExpertiseInput] = useState("")
  const [suggestedExpertise, setSuggestedExpertise] = useState<string[]>([])
  const [additionalSuggestions, setAdditionalSuggestions] = useState<string[]>([]) // Additional suggestions after 2 selected
  const [customExpertise, setCustomExpertise] = useState<string[]>([]) // Track custom-added expertise separately
  const [companyName, setCompanyName] = useState("")
  const [companySummary, setCompanySummary] = useState<string | null>(null)
  const [isEnrichingCompany, setIsEnrichingCompany] = useState(false)
  const [companyUrlTouched, setCompanyUrlTouched] = useState(false)
  const [companyUrlError, setCompanyUrlError] = useState("")
  const expertiseInputRef = useRef<HTMLInputElement>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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
  const handleNextRef = useRef<(() => void) | null>(null)
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Check if user has completed profile
  useEffect(() => {
    const checkProfileStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        
        // Pre-fill from OAuth (Google/LinkedIn)
        if (user.user_metadata) {
          const metadata = user.user_metadata
          if (metadata.first_name) setFirstName(metadata.first_name)
          if (metadata.last_name) setLastName(metadata.last_name)
          if (metadata.given_name && !metadata.first_name) setFirstName(metadata.given_name)
          if (metadata.family_name && !metadata.last_name) setLastName(metadata.family_name)
          if (metadata.full_name) {
            const nameParts = metadata.full_name.split(' ')
            if (nameParts.length >= 2) {
              if (!firstName) setFirstName(nameParts[0])
              if (!lastName) setLastName(nameParts.slice(1).join(' '))
            }
          }
          // Pre-fill photo from OAuth
          const oauthPhoto = metadata.avatar_url || metadata.picture || null
          if (oauthPhoto) setPhotoUrl(oauthPhoto)
        }
        
        // Load event name if eventId is present
        if (eventId) {
          const { data: eventData } = await supabase
            .from("events")
            .select("event_name")
            .eq("event_id", eventId)
            .single()
          
          if (eventData?.event_name) {
            setEventName(eventData.event_name)
          }
        }
        
        // Check if profile exists and is complete
        const { data: person } = await supabase
          .from("users")
          .select("first_name, last_name, career_title, company_name, company_url, photo_url, expertise_summary")
          .eq("user_id", user.id)
          .single()
        
        if (person) {
          setProfileExists(true)
          setFirstName(person.first_name || "")
          setLastName(person.last_name || "")
          setJobTitle(person.career_title || "")
          // Load company URL and name from users table
          setCompany((person as any).company_url || "")
          setCompanyName(person.company_name || "")
          if (person.photo_url) setPhotoUrl(person.photo_url)
          
          // Parse expertise summary if exists
          if (person.expertise_summary) {
            const expertiseList = person.expertise_summary.split(',').map(e => e.trim()).filter(Boolean)
            setAreasOfExpertise(expertiseList)
          }
          
          // Extract company from email if not a common email provider and no company URL exists
          // This happens AFTER loading person data so we can check if company_url is already set
          if (user.email && !(person as any).company_url && !person.company_name) {
            const emailDomain = user.email.split('@')[1]?.toLowerCase()
            const commonEmailProviders = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com', 'aol.com']
            
            if (emailDomain && !commonEmailProviders.includes(emailDomain)) {
              // Try to construct company URL
              const companyUrl = `https://${emailDomain}`
              setCompany(companyUrl)
              // Trigger enrichment immediately for email-extracted URLs
              // Use a small delay to ensure state is updated
              setTimeout(() => {
                enrichCompany(companyUrl)
              }, 1000)
            }
          }
          
          // Profile is complete if has required fields (company_name OR company_url)
          const hasCompany = person.company_name || ((person as any).company_url)
          const isComplete = person.first_name && person.last_name && person.career_title && hasCompany
          setProfileCompleted(isComplete)
          
          if (isComplete) {
            // Profile is complete
            // If eventId is present, show event-specific steps
            // If encrypted code is present but no eventId, redirect to home with code for auto-join
            // Otherwise, redirect to home (user can join events from there)
            if (eventId) {
              setCurrentStep(0) // Start with event-specific questions
            } else if (encryptedCode && !eventId) {
              // Has encrypted code but no eventId yet - redirect to home to auto-join
              router.push(`/home?code=${encryptedCode}`)
            } else {
              // No event, redirect to home where they can join an event
              router.push("/home")
            }
          }
        } else {
          // No existing profile - extract company from email for new users
          if (user.email) {
            const emailDomain = user.email.split('@')[1]?.toLowerCase()
            const commonEmailProviders = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com', 'aol.com']
            
            if (emailDomain && !commonEmailProviders.includes(emailDomain)) {
              // Try to construct company URL
              const companyUrl = `https://${emailDomain}`
              setCompany(companyUrl)
              // Trigger enrichment immediately for email-extracted URLs
              setTimeout(() => {
                enrichCompany(companyUrl)
              }, 1000)
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
        } else {
        }
        return
      }

      // Success haptic feedback
      haptics.success()

      // Update URL and move to next step
      router.push(`/onboarding?from=event-join&eventId=${eventData.event_id}`)
    } catch (error) {
      console.error("Error joining event:", error)
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
        return "What types of business opportunities are you looking for?"
      case "general":
        return "What are your hobbies or interests?"
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
    // Hidden for now - always return false
    return false
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string
      setPreviewImageUrl(imageUrl)
      setIsCropModalOpen(true)
    }
    reader.onerror = () => {
    }
    reader.readAsDataURL(file)
  }

  const handleCameraCapture = () => {
    setIsCameraOpen(true)
  }

  const handleCameraPhoto = (imageUrl: string) => {
    // Convert blob URL to file
    fetch(imageUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setPhotoFile(file)
        setPreviewImageUrl(imageUrl)
        setIsCropModalOpen(true)
      })
      .catch(error => {
        console.error('Error processing camera photo:', error)
      })
  }

  const handleCropSave = async (croppedImageUrl: string) => {
    try {
      // Convert data URL to blob
      const response = await fetch(croppedImageUrl)
      const blob = await response.blob()
      // Use the actual blob type (should be image/jpeg from canvas.toBlob)
      const fileType = blob.type || 'image/jpeg'
      const fileExtension = fileType.includes('png') ? 'png' : 'jpg'
      const file = new File([blob], `avatar-${Date.now()}.${fileExtension}`, { type: fileType })
      
      setPhotoFile(file)
      setPhotoUrl(croppedImageUrl)
      setPreviewImageUrl(null)
      setIsCropModalOpen(false)
    } catch (error) {
      console.error('Error processing cropped image:', error)
    }
  }

  const handleRemovePhoto = () => {
    setPhotoUrl(null)
    setPhotoFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Extract company domain from email
  const extractCompanyFromEmail = (email: string): string | null => {
    const emailDomain = email.split('@')[1]?.toLowerCase()
    if (!emailDomain) return null
    
    const commonEmailProviders = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com', 'aol.com']
    if (commonEmailProviders.includes(emailDomain)) return null
    
    return `https://${emailDomain}`
  }

  // Enrich company information (runs silently in background, no loading state)
  // This calls the edge function which analyzes the website and extracts the real company name
  const enrichCompany = async (companyUrl: string) => {
    if (!companyUrl || !/[.]/.test(companyUrl)) return
    
    // Run silently - don't show loading message
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const enrichUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/company-enrich`
      console.log('[enrichCompany] Calling enrichment for:', companyUrl)
      
      const res = await fetch(enrichUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url: companyUrl })
      })
      
      if (res.ok) {
        const enriched = await res.json()
        console.log('[enrichCompany] Enrichment response:', enriched)
        // Use the company name that the edge function extracted from the website
        // This is the real company name from meta tags, JSON-LD, or title tags
        if (enriched.company_name) {
          setCompanyName(enriched.company_name)
        } else {
          // Fallback: if edge function couldn't find a name, use domain as last resort
          const domain = companyUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
          const domainName = domain.split('.')[0]
          if (domainName && domainName.length > 1) {
            setCompanyName(domainName.charAt(0).toUpperCase() + domainName.slice(1))
          }
        }
        // Always update company summary/description when URL changes
        // Check for description in multiple possible field names
        const companyDescription = enriched.company_description || enriched.description || enriched.summary || null
        
        if (companyDescription) {
          console.log('[enrichCompany] Setting summary (length:', companyDescription.length, '):', companyDescription.substring(0, 100) + '...')
          setCompanySummary(companyDescription)
        } else {
          console.log('[enrichCompany] No description in response. Response keys:', Object.keys(enriched))
          console.log('[enrichCompany] Full response:', JSON.stringify(enriched, null, 2))
          // Don't clear summary - preserve existing value
        }
      } else {
        const errorText = await res.text()
        console.error('[enrichCompany] API call failed:', res.status, errorText)
        // If API call fails, fallback to domain name
        const domain = companyUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
        const domainName = domain.split('.')[0]
        if (domainName && domainName.length > 1) {
          setCompanyName(domainName.charAt(0).toUpperCase() + domainName.slice(1))
        }
        // Don't clear summary on error - preserve existing value if available
        console.log('[enrichCompany] Enrichment failed, preserving existing summary if available')
      }
    } catch (e) {
      console.error("[enrichCompany] Error:", e)
      // On error, fallback to domain name
      const domain = companyUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      const domainName = domain.split('.')[0]
      if (domainName && domainName.length > 1) {
        setCompanyName(domainName.charAt(0).toUpperCase() + domainName.slice(1))
      }
      // Don't clear summary on error - preserve existing value if available
      console.log('[enrichCompany] Enrichment error, preserving existing summary if available')
    }
  }

  // Validate URL format
  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return true // Empty is valid (optional)
    // Check if it looks like a URL (has http/https or has a dot)
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/
    return urlPattern.test(url) || /^https?:\/\//.test(url) || /[.]/.test(url)
  }

  // Generate AI-suggested expertise based on job title
  const generateExpertiseSuggestions = async (title: string) => {
    if (!title.trim()) {
      setSuggestedExpertise([])
      return
    }

    try {
      // Simple keyword-based suggestions (can be replaced with AI later)
      const suggestions: Record<string, string[]> = {
        'vp': ['Leadership', 'Strategy', 'Roadmaps', 'Product Vision', 'Team Management', 'Stakeholder Management'],
        'vice president': ['Leadership', 'Strategy', 'Roadmaps', 'Product Vision', 'Team Management', 'Stakeholder Management'],
        'director': ['Leadership', 'Strategy', 'Planning', 'Team Management', 'Execution', 'Cross-functional Collaboration'],
        'professor': ['Research', 'Communication', 'Teaching', 'Academic Writing', 'Curriculum Development', 'Mentoring'],
        'adjunct': ['Research', 'Communication', 'Teaching', 'Academic Writing', 'Curriculum Development', 'Mentoring'],
        'engineer': ['Software Development', 'Problem Solving', 'Code Review', 'System Design', 'Testing', 'Documentation'],
        'developer': ['Software Development', 'Problem Solving', 'Code Review', 'System Design', 'Testing', 'Documentation'],
        'designer': ['User Experience', 'Visual Design', 'Prototyping', 'User Research', 'Design Systems', 'Collaboration'],
        'product': ['Product Management', 'Roadmaps', 'User Research', 'Stakeholder Management', 'Agile', 'Analytics', 'Prioritization', 'Feature Planning', 'User Stories', 'Backlog Management', 'Metrics', 'A/B Testing'],
        'manager': ['Team Leadership', 'Project Management', 'Stakeholder Management', 'Process Improvement', 'Communication', 'Planning'],
        'founder': ['Leadership', 'Strategy', 'Fundraising', 'Product Vision', 'Team Building', 'Business Development'],
        'ceo': ['Leadership', 'Strategy', 'Vision', 'Team Building', 'Fundraising', 'Business Development'],
        'cto': ['Technical Leadership', 'Architecture', 'Team Building', 'Innovation', 'Strategy', 'Engineering'],
        'cfo': ['Financial Planning', 'Analysis', 'Strategy', 'Risk Management', 'Reporting', 'Leadership'],
        'marketing': ['Brand Strategy', 'Content Creation', 'Analytics', 'Campaign Management', 'Social Media', 'SEO'],
        'sales': ['Relationship Building', 'Negotiation', 'CRM', 'Pipeline Management', 'Communication', 'Closing'],
      }

      const titleLower = title.toLowerCase()
      const matchedSuggestions: string[] = []
      
      for (const [key, values] of Object.entries(suggestions)) {
        if (titleLower.includes(key)) {
          matchedSuggestions.push(...values)
          break
        }
      }

      // Default suggestions if no match (need at least 17 for initial 12 + 5 more)
      if (matchedSuggestions.length === 0) {
        matchedSuggestions.push(
          'Communication', 'Problem Solving', 'Collaboration', 'Planning', 'Execution', 'Leadership',
          'Project Management', 'Team Building', 'Strategic Thinking', 'Analytics', 'Innovation',
          'Stakeholder Management', 'Process Improvement', 'Mentoring', 'Research', 'Presentation', 'Negotiation'
        )
      }

      // Show first 12 suggestions initially
      setSuggestedExpertise(matchedSuggestions.slice(0, 12))
      // Store remaining suggestions for later
      setAdditionalSuggestions(matchedSuggestions.slice(12, 17))
    } catch (error) {
      console.error('Error generating expertise suggestions:', error)
      setSuggestedExpertise([])
    }
  }

  // Handle expertise input
  const handleExpertiseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && expertiseInput.trim()) {
      e.preventDefault()
      const newExpertise = expertiseInput.trim()
      if (!areasOfExpertise.includes(newExpertise)) {
        setAreasOfExpertise([...areasOfExpertise, newExpertise])
        // Track as custom if it's not in suggested list
        if (!suggestedExpertise.includes(newExpertise)) {
          setCustomExpertise([...customExpertise, newExpertise])
        }
      }
      setExpertiseInput("")
      // Keep focus on input for next entry
      setTimeout(() => {
        expertiseInputRef.current?.focus()
      }, 0)
    }
  }

  const removeExpertise = (expertise: string) => {
    setAreasOfExpertise(areasOfExpertise.filter(e => e !== expertise))
    // Also remove from custom if it was custom
    setCustomExpertise(customExpertise.filter(e => e !== expertise))
  }

  const addSuggestedExpertise = (expertise: string) => {
    // Toggle: if already selected, remove it; otherwise add it
    if (areasOfExpertise.includes(expertise)) {
      removeExpertise(expertise)
    } else {
      const newSelection = [...areasOfExpertise, expertise]
      setAreasOfExpertise(newSelection)
      
      // Show 5 additional suggestions after 2 are selected
      if (newSelection.length === 2 && additionalSuggestions.length > 0) {
        setSuggestedExpertise([...suggestedExpertise, ...additionalSuggestions])
        setAdditionalSuggestions([]) // Clear so we don't add them again
      }
    }
  }

  const addCustomExpertise = () => {
    if (expertiseInput.trim()) {
      const newExpertise = expertiseInput.trim()
      if (!areasOfExpertise.includes(newExpertise)) {
        setAreasOfExpertise([...areasOfExpertise, newExpertise])
        // Track as custom if it's not in suggested list
        if (!suggestedExpertise.includes(newExpertise)) {
          setCustomExpertise([...customExpertise, newExpertise])
        }
      }
      setExpertiseInput("")
      // Keep focus on input for next entry
      setTimeout(() => {
        expertiseInputRef.current?.focus()
      }, 0)
    }
  }

  // Watch job title changes to generate suggestions
  useEffect(() => {
    if (jobTitle) {
      generateExpertiseSuggestions(jobTitle)
    } else {
      setSuggestedExpertise([])
    }
  }, [jobTitle])

  // Watch company URL changes to enrich (debounced)
  useEffect(() => {
    if (!company || !/[.]/.test(company)) {
      return
    }

    // Debounce: wait 1 second after user stops typing before enriching
    // Run silently in background (no loading message)
    const timeoutId = setTimeout(() => {
      enrichCompany(company)
    }, 1000)

    return () => {
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company])

  const uploadPhotoToStorage = async (): Promise<string | null> => {
    if (!photoFile || !user) return photoUrl

    try {
      // Use the actual file type from the photoFile
      const fileExtension = photoFile.type.includes('png') ? 'png' : 'jpg'
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExtension}`
      
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, photoFile, {
          contentType: photoFile.type || 'image/jpeg',
          upsert: true
        })

      if (error) {
        console.error('Error uploading photo:', error)
        return photoUrl
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      return urlData.publicUrl
    } catch (error) {
      console.error('Error uploading photo to storage:', error)
      return photoUrl
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
    // Company: either company_name OR company URL is required
    if (!companyName.trim() && !company.trim()) {
      errors.company = "Please enter your company name or company website URL"
    }
    if (!yearsExperience) {
      errors.yearsExperience = "Please select years in your career field"
    }
    if (areasOfExpertise.length === 0) {
      errors.areasOfExpertise = "Please select at least one area of expertise"
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCompleteProfile = async () => {
    if (!user) {
      console.error('handleCompleteProfile: No user')
      return
    }

    if (!validateProfessionalForm()) {
      return
    }

    setIsLoading(true)
    try {
      // Upload photo if a new one was selected
      let finalPhotoUrl = photoUrl
      if (photoFile) {
        const uploadedUrl = await uploadPhotoToStorage()
        if (uploadedUrl) {
          finalPhotoUrl = uploadedUrl
        }
      }

      const expertiseArray = areasOfExpertise

      // Parse years of experience to integer
      const yearsExpInt = parseInt(yearsExperience) || null

      // Use the company name from state (which may have been auto-populated or manually edited)
      // If user edited it, use their edited value; otherwise try to enrich if needed
      let companyNameToSave = companyName.trim() || null
      let companySummaryToSave = companySummary || null
      
      // If URL exists, always try to enrich to ensure we have summary
      // This ensures that even if user manually edited the name, we still get the summary
      if (company && /[.]/.test(company)) {
        try {
          const { data: session } = await supabase.auth.getSession()
          const token = session.session?.access_token
          const enrichUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/company-enrich`
          console.log('[handleCompleteProfile] Enriching on submit for:', company)
          console.log('[handleCompleteProfile] Current companySummary state:', companySummary)
          console.log('[handleCompleteProfile] Current companySummaryToSave:', companySummaryToSave)
          
          const res = await fetch(enrichUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ url: company })
          })
          
          if (res.ok) {
            const enriched = await res.json()
            console.log('[handleCompleteProfile] Enrichment response keys:', Object.keys(enriched))
            console.log('[handleCompleteProfile] Full enrichment response:', JSON.stringify(enriched, null, 2))
            
            // Check for company description in multiple possible field names
            const companyDescription = enriched.company_description || enriched.description || enriched.summary || null
            
            // Update company name if we don't have one yet (don't overwrite user's manual entry)
            if (!companyNameToSave && enriched.company_name) {
              companyNameToSave = enriched.company_name
            }
            
            // Always update company summary from enrichment if available (prioritize fresh enrichment)
            if (companyDescription) {
              console.log('[handleCompleteProfile] Setting summary from enrichment (length:', companyDescription.length, ')')
              companySummaryToSave = companyDescription
            } else if (companySummary) {
              // Fallback: use state value if enrichment didn't return description
              console.log('[handleCompleteProfile] No description in enrichment response, using state value (length:', companySummary.length, ')')
              companySummaryToSave = companySummary
            } else {
              console.log('[handleCompleteProfile] No description available from enrichment or state')
            }
          } else {
            const errorText = await res.text()
            console.error('[handleCompleteProfile] Enrichment failed:', res.status, errorText)
            // If enrichment fails, use state value if available
            if (companySummary && !companySummaryToSave) {
              console.log('[handleCompleteProfile] Using state value after enrichment failure')
              companySummaryToSave = companySummary
            }
          }
        } catch (e) {
          console.error("[handleCompleteProfile] Enrichment error (non-blocking):", e)
          // If enrichment errors, use state value if available
          if (companySummary && !companySummaryToSave) {
            console.log('[handleCompleteProfile] Using state value after enrichment error')
            companySummaryToSave = companySummary
        }
        }
      } else if (companySummary && !companySummaryToSave) {
        // If no URL but we have state value, use it
        console.log('[handleCompleteProfile] No URL provided, using state value')
        companySummaryToSave = companySummary
      }

      // Validation: must have either company_name OR company URL
      if (!companyNameToSave && !company) {
        return
      }

      const profileData = {
        user_id: user.id,
        first_name: firstName,
        last_name: lastName,
        // email removed - already set by database trigger, including it causes 409 conflict
        photo_url: finalPhotoUrl,
        career_title: jobTitle,
        company_name: companyNameToSave || null,
        company_url: company || null,
        company_summary: companySummaryToSave || null,
        career_years_experience: yearsExpInt,
        expertise_summary: expertiseArray.join(", "),
      }
      
      console.log("Saving profile data:", {
        ...profileData,
        company_summary_preview: companySummaryToSave ? companySummaryToSave.substring(0, 100) + '...' : null,
        company_summary_length: companySummaryToSave?.length || 0
      })
      
      let savedData = null
      let profileError = null
      
      const { data: initialData, error: initialError } = await supabase
        .from("users")
        .upsert(profileData, {
          onConflict: 'user_id'
        })
        .select()

      if (initialError) {
        console.error("Profile upsert error:", initialError)
        console.error("Error details:", {
          code: initialError.code,
          message: initialError.message,
          details: initialError.details,
          hint: initialError.hint
        })
        
        // Handle 409 conflict specifically (duplicate email constraint)
        if (initialError.code === '23505' && (initialError.message?.includes('email') || initialError.message?.includes('users_email_key'))) {
          console.warn("Email constraint conflict detected. Retrying without email field...")
          
          // Retry without email field (email already set by trigger)
          const retryProfileData = {
            ...profileData,
            // email explicitly omitted - already set by database trigger
          }
          
          const { data: retryData, error: retryError } = await supabase
            .from("users")
            .upsert(retryProfileData, {
              onConflict: 'user_id'
            })
            .select()
          
          if (retryError) {
            console.error("Retry upsert also failed:", retryError)
            alert("Failed to save profile. Please try again or contact support.")
        return
      }
      
          savedData = retryData
          console.log("Profile saved successfully after retry:", savedData)
        } else {
          // Other errors - return early
          alert("Failed to save profile. Please try again.")
          return
        }
      } else {
        savedData = initialData
      console.log("Profile saved successfully:", savedData)
      }

      setProfileCompleted(true)
      
      // Redirect based on whether we have an encrypted code
      // If encrypted code exists, redirect to home with it for auto-join
      setIsRedirecting(true)
      setTimeout(() => {
        if (encryptedCode && !eventId) {
          // Has encrypted code but no eventId yet - redirect to home to auto-join
          router.push(`/home?code=${encryptedCode}`)
        } else {
          router.push("/home")
        }
      }, 1000)
    } catch (error) {
      console.error("Error completing profile:", error)
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
      return
    }

    if (connectionTypesSelected.length === 0) {
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
          onboarding_completed: true // Mark as complete - adaptive Q&A is dormant
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
        return
      }

      console.log("Event onboarding saved successfully:", data)
      
      // Derive attendance data in background (non-blocking)
      // This populates offer_summary, want_summary, embeddings, tags, etc.
      fetch('/api/derive-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, userId: user.id })
      }).catch(error => {
        console.error('Error deriving attendance (background):', error)
        // Don't show error to user, this is background processing
      })
      
      // Skip adaptive Q&A - redirect directly to home
      setIsRedirecting(true)
      setTimeout(() => {
        router.push('/home')
      }, 1000)
      
    } catch (error: any) {
      console.error("Error completing event onboarding:", {
        error,
        message: error?.message,
        stack: error?.stack
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Load next adaptive question
  const loadNextAdaptiveQuestion = async (selectedOption?: { qid: string; choice: string }, allowFallback: boolean = false) => {
    if (!user || !eventId) return false

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
        let error
        try {
          error = await response.json()
        } catch (e) {
          error = { error: 'Failed to load next question', status: response.status }
        }
        console.error('Error loading next question:', error)
        
        // If this is the initial load and fallback is allowed, proceed without adaptive Q&A
        if (allowFallback && !selectedOption) {
          console.log('Adaptive Q&A not available, proceeding without it')
          return false
        }
        
        return false
      }

      const result = await response.json()

      if (result.done) {
        // Questions complete, derive attendance and match
        setAdaptiveQnAComplete(true)
        await completeAdaptiveQnA()
        return true
      } else if (result.question) {
        setCurrentAdaptiveQuestion(result.question)
        return true
      }
      
      return false
    } catch (error: any) {
      console.error('Error loading adaptive question:', error)
      
      // If this is the initial load and fallback is allowed, proceed without adaptive Q&A
      if (allowFallback && !selectedOption) {
        console.log('Adaptive Q&A error, proceeding without it:', error)
        return false
      }
      
      return false
    } finally {
      setIsLoadingQuestion(false)
    }
  }

  // Handle adaptive question answer selection
  const handleAdaptiveAnswer = async (choice: string) => {
    if (!currentAdaptiveQuestion) return

    const selectedOption = {
      qid: currentAdaptiveQuestion.id,
      choice,
      questionText: currentAdaptiveQuestion.text // Store question text for AI context
    }

    // Auto-advance to next question
    await loadNextAdaptiveQuestion(selectedOption)
  }

  // Complete adaptive Q&A flow
  const completeAdaptiveQnA = async () => {
    if (!user || !eventId) return

    setIsLoading(true)
    try {
      // Mark onboarding as complete
      const { error: updateError } = await supabase
        .from('attendance')
        .update({ onboarding_completed: true })
        .eq('event_id', eventId)
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error marking onboarding as complete:', updateError)
        // Continue anyway, as this is not critical
      }

      // Derive attendance AGAIN after adaptive Q&A completes
      // This updates personality data based on Q&A answers
      console.log("Deriving attendance after adaptive Q&A completion...")
      const deriveResponse = await fetch('/api/derive-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, userId: user.id })
      })

      if (deriveResponse.ok) {
        const deriveResult = await deriveResponse.json()
        console.log("Derive-attendance after Q&A completed:", deriveResult)
      } else {
        const error = await deriveResponse.json()
        console.error('Error deriving attendance after Q&A:', error)
        // Don't block progression if this fails
        console.warn('Continuing despite derive-attendance error')
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
      } else {
      }

      // Redirect to home
      setIsRedirecting(true)
      setTimeout(() => {
        router.push('/home')
      }, 2000)

    } catch (error: any) {
      console.error('Error completing adaptive Q&A:', error)
      // Even if there's an error, redirect to home since onboarding data is saved
      setIsRedirecting(true)
      setTimeout(() => {
        router.push('/home')
      }, 1500)
    } finally {
      setIsLoading(false)
    }
  }

  // Define steps based on whether profile is completed
  const profileSteps: OnboardingStep[] = [
    {
      id: "profile",
      title: "Complete Your Profile",
      description: "",
      component: (
        <div className="space-y-6">
          {/* Profile Picture Upload */}
          <div className="flex flex-col items-center space-y-4">
            <Label className="text-sm font-title text-foreground w-full text-left">
              Profile Picture
            </Label>
            <div className="relative">
              <Avatar className="w-24 h-24 border-2 border-border">
                <AvatarImage src={photoUrl || undefined} alt={`${firstName} ${lastName}`} />
                <AvatarFallback className="bg-[#EDEBE6] text-muted-foreground text-xl font-body">
                  {firstName?.[0]?.toUpperCase() || ''}{lastName?.[0]?.toUpperCase() || ''}
                </AvatarFallback>
              </Avatar>
              {photoUrl && (
                <button
                  onClick={handleRemovePhoto}
                  className="absolute -top-2 -right-2 rounded-xl bg-destructive text-white p-1.5 hover:bg-destructive/90 transition-colors"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex flex-col items-center space-y-2 w-full">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
                <GradientButton
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                  type="button"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </GradientButton>
                <GradientButton
                  variant="outline"
                  onClick={handleCameraCapture}
                  className="flex-1"
                  type="button"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Take Photo
                </GradientButton>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Upload a photo or take a picture
              </p>
            </div>
          </div>

          {/* Name Fields - Stacked Vertically */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="firstName" className="text-sm font-title text-foreground">
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
                className={`mt-3 rounded-2xl bg-input ${validationErrors.firstName ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.firstName && (
                <p className="text-xs text-destructive mt-1">{validationErrors.firstName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName" className="text-sm font-title text-foreground">
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
                className={`mt-1 rounded-2xl bg-input ${validationErrors.lastName ? 'border-destructive' : ''}`}
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
          {/* All fields stacked vertically for mobile */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="jobTitle" className="text-sm font-title text-foreground">
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
                className={`mt-3 rounded-2xl bg-input ${validationErrors.jobTitle ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.jobTitle && (
                <p className="text-xs text-destructive mt-1">{validationErrors.jobTitle}</p>
              )}
            </div>

            {/* Years of Experience - Bubble Grid */}
            <div>
              <Label className="text-sm font-title text-foreground">
                Years in your career field *
              </Label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {experienceOptions.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setYearsExperience(option)
                      if (validationErrors.yearsExperience) {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors.yearsExperience
                          return newErrors
                        })
                      }
                    }}
                    className={`px-4 py-2 rounded-concave text-sm font-body transition-colors ${
                      yearsExperience === option
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-[#EDEBE6] text-foreground hover:bg-[#EDEBE6]/80 border border-border'
                    } ${validationErrors.yearsExperience ? 'border-destructive' : ''}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {validationErrors.yearsExperience && (
                <p className="text-xs text-destructive mt-1">{validationErrors.yearsExperience}</p>
              )}
            </div>

            {/* Company URL with auto-fill */}
            <div>
              <Label htmlFor="company" className="text-sm font-title text-foreground">
                Company website (URL)
              </Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => {
                  const value = e.target.value
                  setCompany(value)
                  setCompanyUrlError("")
                  if (validationErrors.company) {
                    setValidationErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.company
                      return newErrors
                    })
                  }
                  // Don't auto-guess here - let the enrichment function handle it
                  // The enrichment will run via useEffect debounce and populate the real company name
                }}
                onBlur={(e) => {
                  setCompanyUrlTouched(true)
                  const value = e.target.value.trim()
                  if (value && !validateUrl(value)) {
                    setCompanyUrlError("URLs only - optional")
                  } else {
                    setCompanyUrlError("")
                  }
                }}
                placeholder="https://company.com"
                className={`mt-3 rounded-2xl bg-input ${companyUrlError ? 'border-destructive' : ''}`}
              />
              {companyUrlError && (
                <p className="text-xs text-destructive mt-1">{companyUrlError}</p>
              )}
              {/* Company Name Input - Only show after URL is entered or invalid input attempted */}
              {(company || companyUrlTouched) && (
                <div className="mt-2">
                  <Label htmlFor="companyName" className="text-sm font-title text-foreground">
                    Company name
                  </Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      if (validationErrors.company) {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors.company
                          return newErrors
                        })
                      }
                    }}
                    placeholder="Company name"
                    className={`mt-3 rounded-2xl bg-input ${validationErrors.company ? 'border-destructive' : ''}`}
                  />
                </div>
              )}
              {validationErrors.company && (
                <p className="text-xs text-destructive mt-1">{validationErrors.company}</p>
              )}
            </div>

            {/* Areas of Expertise - Bubbles */}
            <div>
              <Label htmlFor="areasOfExpertise" className="text-sm font-title text-foreground">
                Areas of Expertise *
              </Label>
              
              {/* Suggested expertise bubbles - show all, highlight selected ones */}
              {suggestedExpertise.length > 0 && (
                <div className="mt-2 mb-3">
                  <p className="text-xs text-muted-foreground mb-2 font-body">Select or add those that apply:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedExpertise.map((expertise) => (
                      <button
                        key={expertise}
                        type="button"
                        onClick={() => addSuggestedExpertise(expertise)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-body transition-colors ${
                          areasOfExpertise.includes(expertise)
                            ? 'bg-primary text-primary-foreground border border-primary'
                            : 'bg-[#EDEBE6] text-foreground hover:bg-[#EDEBE6]/80 border border-border'
                        }`}
                      >
                        {expertise}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom expertise bubbles - only show custom-added ones (not suggested) */}
              {customExpertise.length > 0 && (
                <div className="mt-2 mb-3 flex flex-wrap gap-2">
                  {customExpertise.map((expertise) => (
                    <div
                      key={expertise}
                      className="px-3 py-1.5 rounded-xl text-xs font-body bg-primary text-white flex items-center gap-2"
                    >
                      {expertise}
                      <button
                        type="button"
                        onClick={() => removeExpertise(expertise)}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input for adding custom expertise */}
              <div className="relative">
                <Input
                  ref={expertiseInputRef}
                  id="areasOfExpertise"
                  value={expertiseInput}
                  onChange={(e) => setExpertiseInput(e.target.value)}
                  onKeyDown={handleExpertiseKeyDown}
                  placeholder="Type and press Enter to add expertise"
                  className={`mt-3 rounded-2xl pr-10 bg-input ${validationErrors.areasOfExpertise ? 'border-destructive' : ''}`}
                />
                {expertiseInput.trim() && (
                  <button
                    type="button"
                    onClick={addCustomExpertise}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-concave bg-primary text-primary-foreground text-xs font-title hover:opacity-90"
                  >
                    +
                  </button>
                )}
              </div>
              {validationErrors.areasOfExpertise && (
                <p className="text-xs text-destructive mt-1">{validationErrors.areasOfExpertise}</p>
              )}
            </div>
          </div>
        </div>
      )
    }
  ]

  const followUpQuestions = connectionTypesSelected
    .map((typeId) => {
      const question = getFollowUpQuestion(typeId)
      if (!question) return null
      return { typeId, question }
    })
    .filter((item): item is { typeId: string; question: string } => Boolean(item))

  const followUpSteps: OnboardingStep[] = followUpQuestions.map(({ typeId, question }) => {
    const isHobbiesQuestion = typeId === "general"
    return {
      id: `follow-up-${typeId}`,
      title: question,
      description: "",
      component: (
        <div className="space-y-6">
          <Textarea
            value={followUpResponses[typeId] || ""}
            onChange={(e) => {
              setFollowUpResponses(prev => ({
                ...prev,
                [typeId]: e.target.value
              }))
              // Auto-expand textarea
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
            }}
            onKeyDown={(e) => {
              // If Enter is pressed without Command/Ctrl+Shift, prevent default newline and continue
              if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                e.preventDefault()
                // Only continue if there's content
                if (followUpResponses[typeId]?.trim() && handleNextRef.current) {
                  handleNextRef.current()
                }
              }
              // Command+Shift+Enter or Ctrl+Shift+Enter allows new line (default behavior)
            }}
            placeholder="Type here..."
            className="mt-3 rounded-2xl resize-none overflow-hidden"
            rows={2}
            style={{ minHeight: '60px', maxHeight: '200px' }}
          />
        </div>
      )
    }
  })

  const eventSteps: OnboardingStep[] = [
    {
      id: "why-attending",
      title: eventName ? `Why are you attending ${eventName}?` : "Why are you attending?",
      description: "", // Removed subtitle
      component: (
        <div className="space-y-6">
          <Textarea
            value={whyAttending}
            onChange={(e) => {
              setWhyAttending(e.target.value)
              // Auto-expand textarea
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
            }}
            placeholder="Help us understand your goals for this event"
            className="mt-3 resize-none overflow-hidden"
            rows={2}
            style={{ minHeight: '60px', maxHeight: '200px' }}
          />
        </div>
      )
    },
    {
      id: "connection-types",
      title: "Connection Types",
      description: "What types of connections would you be ok with?",
      component: (
        <div className="space-y-6">
          {connectionTypes.map((type) => (
            <div key={type.id} className="flex items-center space-x-3 rounded-concave p-4 transition-colors hover:bg-[#EDEBE6]/50">
              <Checkbox
                id={`connection-${type.id}`}
                checked={connectionTypesSelected.includes(type.id)}
                onCheckedChange={(checked) => handleConnectionTypeChange(type.id, checked as boolean)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                style={{ borderColor: '#656361' }}
              />
              <label
                htmlFor={`connection-${type.id}`}
                className="text-sm font-body cursor-pointer flex-1"
              >
                {type.label}
              </label>
            </div>
          ))}
        </div>
      )
    },
    ...followUpSteps,
    ...(shouldShowBusinessNeed() ? [{
      id: "business-need",
      title: "What is something your business is in need of right now?",
      description: "",
      component: (
        <div className="space-y-6">
          <Textarea
            value={businessNeed}
            onChange={(e) => {
              setBusinessNeed(e.target.value)
              // Auto-expand textarea
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
            }}
            placeholder="Type your answer here..."
            className="mt-3 resize-none overflow-hidden"
            rows={2}
            style={{ minHeight: '60px', maxHeight: '200px' }}
          />
        </div>
      )
    }] : [])
  ]

  // Determine visible steps:
  // - If eventId is present, only show event-specific steps (skip profile)
  // - If no eventId, show profile steps (user needs to complete profile first)
  const visibleSteps = eventId ? eventSteps : (profileCompleted ? [] : profileSteps)
  const currentStepData = visibleSteps[currentStep]
  const isLastStep = currentStep === visibleSteps.length - 1

  useEffect(() => {
    if (visibleSteps.length === 0) return
    // If current step is out of bounds, reset to last valid step
    if (currentStep >= visibleSteps.length) {
      setCurrentStep(Math.max(visibleSteps.length - 1, 0))
    }
    // If we're on a follow-up step that no longer exists (connection type was deselected),
    // move to the connection-types step
    if (currentStepData?.id.startsWith("follow-up-")) {
      const typeId = currentStepData.id.replace("follow-up-", "")
      if (!connectionTypesSelected.includes(typeId)) {
        // Find the connection-types step index
        const connectionTypesIndex = visibleSteps.findIndex(step => step.id === "connection-types")
        if (connectionTypesIndex >= 0) {
          setCurrentStep(connectionTypesIndex)
        }
      }
    }
  }, [visibleSteps.length, currentStep, currentStepData, connectionTypesSelected])

  // Prevent browser back button navigation during event onboarding
  useEffect(() => {
    // Only prevent navigation if we're in event onboarding (eventId present and not completed)
    const isInEventOnboarding = eventId && !adaptiveQnAComplete
    
    if (!isInEventOnboarding) return

    // Handle beforeunload (page refresh/close)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "You haven't completed the event onboarding questions yet. Are you sure you want to leave?"
      return e.returnValue
    }

    // Handle browser back/forward buttons
    const handlePopState = (e: PopStateEvent) => {
      // Check if we're navigating away from onboarding
      const currentPath = window.location.pathname
      if (!currentPath.includes('/onboarding')) {
        const confirmed = window.confirm(
          "You haven't completed the event onboarding questions yet. Are you sure you want to leave? Your progress will be lost."
        )
        
        if (!confirmed) {
          // Push current state back to prevent navigation
          const currentUrl = `/onboarding?eventId=${eventId}${fromEventJoin ? '&from=event-join' : ''}`
          window.history.pushState(null, '', currentUrl)
          // Force router to stay on current page
          router.replace(currentUrl)
        }
      }
    }

    // Push current state to history to intercept back button
    window.history.pushState(null, '', window.location.pathname + window.location.search)
    
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [eventId, adaptiveQnAComplete, router, fromEventJoin])

  // Show adaptive Q&A if we have a current question or are loading one
  // DISABLED: Adaptive Q&A is dormant for now
  const showAdaptiveQnA = false // currentAdaptiveQuestion || isLoadingQuestion || adaptiveQnAComplete

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
    if (currentStepData.id === "professional") return jobTitle && company && yearsExperience && areasOfExpertise.length > 0
    if (currentStepData.id === "connection-types") return connectionTypesSelected.length > 0
    if (currentStepData.id === "why-attending") return whyAttending.trim().length > 0
    if (currentStepData.id.startsWith("follow-up-")) {
      const typeId = currentStepData.id.replace("follow-up-", "")
      return !!followUpResponses[typeId]?.trim()
    }
    return true
  }

  // Handle next step
  const handleNext = () => {
    if (!currentStepData) return
    
    const stepId = currentStepData.id
    if (stepId === "profile" && !validateForm()) {
      return
    } else if (stepId === "professional" && !validateProfessionalForm()) {
      return
    } else if (stepId === "connection-types") {
      if (connectionTypesSelected.length === 0) {
        return
      }
    } else if (stepId.startsWith("follow-up-")) {
      const typeId = stepId.replace("follow-up-", "")
      if (!followUpResponses[typeId]?.trim()) {
        return
      }
    }
    setCurrentStep(currentStep + 1)
  }

  // Update ref on every render so it always has the latest handleNext
  handleNextRef.current = handleNext

  // Handle back step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground font-body">Loading...</p>
          <p className="text-xs text-muted-foreground font-body mt-2">Do not refresh this page. Could take 30 seconds.</p>
        </div>
      </div>
    )
  }

  if (!currentStepData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground font-body">Loading...</p>
          <p className="text-xs text-muted-foreground font-body mt-2">Do not refresh this page. Could take 30 seconds.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      {/* Loading/Redirecting overlay */}
      {(isLoading || isRedirecting) && (
        <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
          <div className="bg-[#EDEBE6] border border-border rounded-lg p-8 text-center shadow-elevation">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-title text-foreground mb-2" style={{ textTransform: 'none' }}>
              {isRedirecting ? toSentenceCase("Redirecting to your dashboard...") : toSentenceCase("Saving your information...")}
            </h3>
            <p className="text-muted-foreground">
              {isRedirecting 
                ? "Taking you to your personalized homepage." 
                : "This may take a few moments."
              }
            </p>
            <p className="text-xs text-muted-foreground mt-2">Do not refresh this page. Could take 30 seconds.</p>
          </div>
        </div>
      )}

      {/* Informational Top Bar */}
      <div className="fixed top-0 left-0 right-0 bg-[#EDEBE6] border-b border-border shadow-sm z-30 safe-area-top">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <p className="text-xs md:text-sm text-center text-muted-foreground leading-relaxed">
            This information is used to match you with the most relevant people. It may be visible to users.
            <br />
            This information is not used for marketing.
          </p>
        </div>
      </div>

      {/* Fixed Top Progress Bar */}
      {currentStep > 0 && (
        <div className="fixed left-0 right-0 z-20" style={{ top: '52px' }}>
          <div className="w-full h-[2px] bg-[#EDEBE6]">
            <div 
              className="gradient-progress h-[2px] transition-all duration-300 ease-out" 
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Main Content Area - Fixed height to prevent scrolling */}
      <div className="flex-1 flex items-center justify-center px-4 md:px-6 overflow-hidden" style={{ paddingTop: '52px' }}>
        <div className="w-full max-w-lg transition-all duration-300 animate-fade-up rounded-concave bg-[#EDEBE6] double-border p-8 md:p-10 mb-24 max-h-[calc(100vh-10rem)] overflow-y-auto"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#72A557 transparent'
          }}
        >
          {/* Adaptive Q&A Content */}
          {showAdaptiveQnA ? (
            <div className="space-y-6">
              {isLoadingQuestion ? (
                // Skeleton loading shimmer
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-[#EDEBE6] rounded w-3/4"></div>
                  <div className="space-y-3">
                    <div className="h-12 bg-[#EDEBE6] rounded"></div>
                    <div className="h-12 bg-[#EDEBE6] rounded"></div>
                    <div className="h-12 bg-[#EDEBE6] rounded"></div>
                  </div>
                </div>
              ) : currentAdaptiveQuestion ? (
                // Show current question
                <div className="space-y-4 md:space-y-6">
                  <div>
                    <h3 className="text-base md:text-lg font-title text-foreground mb-4 md:mb-6 leading-tight" style={{ textTransform: 'none' }}>
                      {toSentenceCase(currentAdaptiveQuestion.text)}
                    </h3>
                  </div>
                  <div className="space-y-2 md:space-y-3">
                    {currentAdaptiveQuestion.options.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => handleAdaptiveAnswer(option.key)}
                        className="w-full p-3 md:p-4 text-left rounded-concave border border-border hover:border-primary hover:bg-primary/5 transition-colors bg-[#EDEBE6]"
                      >
                        <span className="text-sm md:text-base text-foreground font-body">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : adaptiveQnAComplete ? (
                // Completion state
                <div className="text-center">
                  <p className="text-foreground font-body">Processing your responses...</p>
                </div>
              ) : null}
            </div>
          ) : currentStepData ? (
            // Regular onboarding steps
            <div className="space-y-6 md:space-y-8">
              <div>
                <h2 className="text-lg md:text-xl font-title text-foreground mb-4 md:mb-6 leading-tight" style={{ textTransform: 'none' }}>
                  {toSentenceCase(currentStepData.title)}
                </h2>
                {currentStepData.description && (
                  <p className="text-sm md:text-base text-muted-foreground font-body">
                    {currentStepData.description}
                  </p>
                )}
              </div>
              <div className="space-y-4 md:space-y-6">
                {currentStepData.component}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraCapture
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraPhoto}
      />

      {/* Image Crop Modal - Always available */}
      {previewImageUrl && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          onClose={() => {
            setIsCropModalOpen(false)
            setPreviewImageUrl(null)
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
          }}
          onSave={handleCropSave}
          imageUrl={previewImageUrl}
        />
      )}

      {/* Fixed Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#EDEBE6] border-t border-border shadow-2xl px-4 md:px-6 z-[100] py-3 md:py-4 safe-area-bottom">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-3 md:gap-4 items-center">
            {/* Back Button */}
            <GradientButton 
              variant="outline" 
              onClick={handleBack} 
              disabled={currentStep <= 0} 
              className="flex items-center justify-center w-12 h-12 md:w-16 md:h-16 rounded-2xl border-2 border-primary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-800 dark:text-gray-300 stroke-[2.5]" />
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
              className="flex-1 h-12 md:h-16 rounded-2xl text-base md:text-lg font-body bg-primary text-white hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
            >
              {isLoading || isLoadingQuestion ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                  <span className="text-sm md:text-base">Loading...</span>
                </span>
              ) : isLastStep ? (
                isLoading ? "Completing..." : "Complete"
              ) : (
                <span className="flex items-center justify-center">
                  Continue
                  <ArrowRight className="h-3 w-3 md:h-4 md:w-4 ml-2" />
                </span>
              )}
            </GradientButton>
          </div>
        </div>
      </div>
    </div>
  )
}

