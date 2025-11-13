"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Checkbox } from "@/components/ui/checkbox"
import { createClientComponentClient } from "@/lib/supabase"
import { User } from "@/lib/types"
import { toast } from "sonner"
import { ArrowRight, ChevronLeft, Loader2, Camera, X, Upload, Send, ArrowUp } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageCropModal } from "@/components/ui/image-crop-modal"
import { CameraCapture } from "@/components/ui/camera-capture"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

interface OnboardingStep {
  id: string
  title: string
  description: string
  component: React.ReactNode
}

// Unified scroll container for Q&A pairs
interface QAPair {
  id: string
  question: string
  answer: string | null
  type: 'text' | 'checkbox'
  checkboxOptions?: Array<{ id: string; label: string }>
  checkboxSelected?: string[]
}

interface UnifiedScrollContainerProps {
  qaPairs: QAPair[]
  currentQuestionId: string | null
  currentAnswer: string
  setCurrentAnswer: (answer: string) => void
  onAnswerSubmit: (questionId: string, answer: string) => void
  onContinue: () => void
  inputRef: React.RefObject<HTMLTextAreaElement>
  isSubmitting: boolean
  canGoBack: boolean
  onBack: () => void
  // For checkbox questions
  checkboxOptions?: Array<{ id: string; label: string }>
  checkboxSelected?: string[]
  onCheckboxChange?: (id: string, checked: boolean) => void
}

function UnifiedScrollContainer({
  qaPairs,
  currentQuestionId,
  currentAnswer,
  setCurrentAnswer,
  onAnswerSubmit,
  onContinue,
  inputRef,
  isSubmitting,
  canGoBack,
  onBack,
  checkboxOptions,
  checkboxSelected = [],
  onCheckboxChange
}: UnifiedScrollContainerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [answerAnimating, setAnswerAnimating] = useState<string | null>(null)
  const [showContinueButton, setShowContinueButton] = useState(false)

  // Smooth auto-scroll to bottom when new content is added
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      })
    }
  }, [qaPairs, currentQuestionId])

  // Auto-focus input when question appears
  useEffect(() => {
    if (currentQuestionId && inputRef.current) {
      // Smooth focus after question animation starts
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [currentQuestionId, inputRef])

  const handleSubmit = () => {
    if (!currentAnswer.trim() || !currentQuestionId) return
    
    setIsAnimating(true)
    setAnswerAnimating(currentQuestionId)
    
    // Smooth answer animation sequence
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Submit the answer
        onAnswerSubmit(currentQuestionId, currentAnswer.trim())
        
        // Smooth scroll to show answer
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
              top: scrollContainerRef.current.scrollHeight,
              behavior: 'smooth'
            })
          }
        })
        
        // After answer appears, smoothly transition to continue button
        setTimeout(() => {
          setAnswerAnimating(null)
          setShowContinueButton(true)
          
          // Smooth scroll up to make room for next question
          setTimeout(() => {
            if (scrollContainerRef.current) {
              const scrollHeight = scrollContainerRef.current.scrollHeight
              const clientHeight = scrollContainerRef.current.clientHeight
              const scrollPosition = scrollHeight - clientHeight - 100
              
              scrollContainerRef.current.scrollTo({
                top: Math.max(0, scrollPosition),
                behavior: 'smooth'
              })
            }
            setIsAnimating(false)
          }, 300)
        }, 400)
      }, 200)
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const currentQuestion = qaPairs.find(qa => qa.id === currentQuestionId)

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-200px)] relative max-w-lg mx-auto w-full">
      {/* Back Button - Top Left - Always visible */}
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className={`absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors ${
          canGoBack 
            ? 'hover:bg-muted/50 cursor-pointer' 
            : 'opacity-30 cursor-not-allowed'
        }`}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* Scroll Container - Holds all Q&A pairs */}
      <div 
        ref={scrollContainerRef}
        data-scroll-container
        className="flex-1 overflow-y-auto px-4 py-8 pt-14 space-y-6 scroll-smooth"
        style={{ 
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain'
        }}
      >
        {qaPairs.map((qa, index) => {
          const isLastAnswered = index === qaPairs.length - 1 && qa.answer
          const isScrollingUp = isLastAnswered && showContinueButton
          const isCurrentUnanswered = qa.id === currentQuestionId && !qa.answer
          
          return (
            <div
              key={qa.id}
              className={`space-y-3 transition-all duration-700 ease-in-out ${
                isScrollingUp 
                  ? 'transform translate-y-[-80px] opacity-40 transition-all duration-1000 ease-in-out' 
                  : isLastAnswered
                  ? 'animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out'
                  : isCurrentUnanswered
                  ? 'animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out'
                  : ''
              }`}
            >
              {/* Question - Show if answered OR if it's the current unanswered question */}
              {(qa.answer || isCurrentUnanswered) && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Question:</p>
                  <p className="text-lg font-medium text-foreground">{qa.question}</p>
                </div>
              )}

              {/* Answer or Checkbox Selection */}
              {qa.answer && (
                <div className={`mt-2 transition-all duration-500 ease-out ${
                  answerAnimating === qa.id
                    ? 'animate-in fade-in slide-in-from-bottom-8 duration-400 ease-out'
                    : 'animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out'
                }`}>
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-primary text-white transition-all duration-300 ease-out">
                    <p className="text-sm whitespace-pre-wrap">{qa.answer}</p>
                  </div>
                </div>
              )}

              {/* Checkbox options for current unanswered checkbox question */}
              {isCurrentUnanswered && qa.type === 'checkbox' && checkboxOptions && (
                <div className="mt-4 space-y-2">
                  {checkboxOptions.map((option) => (
                    <div key={option.id} className="flex items-center space-x-3 rounded-xl p-3 transition-colors hover:bg-muted/50">
                      <Checkbox
                        id={`scroll-checkbox-${option.id}`}
                        checked={checkboxSelected?.includes(option.id) || false}
                        onCheckedChange={(checked) => onCheckboxChange?.(option.id, checked as boolean)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <label
                        htmlFor={`scroll-checkbox-${option.id}`}
                        className="text-sm font-medium cursor-pointer flex-1"
                      >
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {qa.type === 'checkbox' && qa.checkboxSelected && qa.checkboxSelected.length > 0 && !isCurrentUnanswered && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Question:</p>
                    <p className="text-lg font-medium text-foreground">{qa.question}</p>
                  </div>
                  <div className="mt-2 space-y-2">
                    {qa.checkboxSelected.map((selectedId) => {
                      const option = qa.checkboxOptions?.find(opt => opt.id === selectedId)
                      return option ? (
                        <div key={selectedId} className="max-w-[85%] rounded-2xl px-4 py-2 bg-primary/20 text-primary border border-primary/30">
                          <p className="text-sm">{option.label}</p>
                        </div>
                      ) : null
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}

        {/* Current Question - Rising from bottom with enhanced animation (only if not already in qaPairs) */}
        {currentQuestion && !currentQuestion.answer && !qaPairs.some(qa => qa.id === currentQuestionId) && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Question:</p>
              <p className="text-lg font-medium text-foreground">{currentQuestion.question}</p>
            </div>
            
            {/* Checkbox options for connection types */}
            {currentQuestion.type === 'checkbox' && checkboxOptions && (
              <div className="mt-4 space-y-2">
                {checkboxOptions.map((option) => (
                  <div key={option.id} className="flex items-center space-x-3 rounded-xl p-3 transition-colors hover:bg-muted/50">
                    <Checkbox
                      id={`scroll-checkbox-${option.id}`}
                      checked={checkboxSelected?.includes(option.id) || false}
                      onCheckedChange={(checked) => onCheckboxChange?.(option.id, checked as boolean)}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <label
                      htmlFor={`scroll-checkbox-${option.id}`}
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom with transform animation */}
      <div className="pt-4 pb-4 px-4 flex-shrink-0 bg-card mt-auto">
        {currentQuestionId && currentQuestion && !currentQuestion.answer && !showContinueButton ? (
          currentQuestion.type === 'checkbox' ? (
            // For checkbox questions, show Submit button when at least one is selected
            <GradientButton
              onClick={() => {
                // Save checkbox selection as answer
                if (checkboxSelected && checkboxSelected.length > 0) {
                  const selectedLabels = checkboxOptions
                    ?.filter(opt => checkboxSelected.includes(opt.id))
                    .map(opt => opt.label)
                    .join(", ") || ""
                  
                  onAnswerSubmit(currentQuestionId, selectedLabels)
                  
                  setTimeout(() => {
                    setShowContinueButton(true)
                  }, 500)
                }
              }}
              disabled={!checkboxSelected || checkboxSelected.length === 0 || isSubmitting}
              className="w-full h-16 rounded-xl text-lg font-medium"
            >
              Submit
              <ArrowUp className="h-4 w-4 ml-2" />
            </GradientButton>
          ) : (
            <div className={`flex gap-2 items-end transition-all duration-300 ease-in-out ${
              answerAnimating === currentQuestionId ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100 translate-y-0'
            }`}>
              <Textarea
                ref={inputRef}
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your answer..."
                className="flex-1 rounded-xl min-h-[44px] max-h-[120px] resize-none bg-muted/40"
                rows={1}
                autoFocus
              />
              <Button
                onClick={handleSubmit}
                disabled={!currentAnswer.trim() || isSubmitting || isAnimating}
                size="icon"
                className="h-11 w-11 rounded-xl shrink-0"
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            </div>
          )
        ) : (
          <div className={`transition-all duration-500 ${
            showContinueButton ? 'animate-in fade-in slide-in-from-bottom-4' : ''
          }`}>
            <GradientButton
              onClick={() => {
                setShowContinueButton(false)
                setCurrentAnswer("")
                onContinue()
              }}
              disabled={isSubmitting}
              className="w-full h-16 rounded-xl text-lg font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </GradientButton>
          </div>
        )}
      </div>
    </div>
  )
}

interface ChatQuestionInputProps {
  question: string
  answer: string
  setAnswer: (answer: string) => void
  placeholder: string
  inputRef: React.RefObject<HTMLTextAreaElement>
  onComplete?: () => void
  onSend?: () => void
  onBack?: () => void
  canGoBack?: boolean
}

function ChatQuestionInput({
  question,
  answer,
  setAnswer,
  placeholder,
  inputRef,
  onComplete,
  onSend,
  onBack,
  canGoBack = false
}: ChatQuestionInputProps) {
  const [hasAnswered, setHasAnswered] = useState(false)
  const answerContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-focus input after a short delay to trigger mobile keyboard
    setTimeout(() => {
      inputRef.current?.focus()
    }, 300)
  }, [])

  useEffect(() => {
    // Scroll to bottom when answer is added
    if (answerContainerRef.current && hasAnswered) {
      answerContainerRef.current.scrollTop = answerContainerRef.current.scrollHeight
    }
  }, [hasAnswered, answer])

  const handleSend = () => {
    if (!answer.trim()) return
    setHasAnswered(true)
    if (onSend) {
      onSend()
    }
    // Don't auto-call onComplete - wait for user to click Continue button
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-200px)] relative">
      {/* Back Button - Top Left */}
      {onBack && (
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={`absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors ${
            canGoBack 
              ? 'hover:bg-muted/50 cursor-pointer' 
              : 'opacity-30 cursor-not-allowed'
          }`}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {/* Question Label and Text - Left justified */}
      <div className="flex-1 flex flex-col justify-center px-4 pt-14">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-sm text-muted-foreground mb-2">Question:</p>
          <p className="text-lg font-medium text-foreground">{question}</p>
          
          {/* Answer appears under question after submission */}
          {hasAnswered && (
            <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-primary text-white">
                <p className="text-sm whitespace-pre-wrap">{answer}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area - Positioned at very bottom */}
      <div className="pt-4 pb-4 flex-shrink-0">
        <div className="flex gap-2 items-end">
          {!hasAnswered ? (
            <>
              <Textarea
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={placeholder}
                className="flex-1 rounded-xl min-h-[44px] max-h-[120px] resize-none bg-muted/40"
                rows={1}
                autoFocus
              />
              <Button
                onClick={handleSend}
                disabled={!answer.trim()}
                size="icon"
                className="h-11 w-11 rounded-xl shrink-0"
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <GradientButton
              onClick={onComplete}
              className="w-full h-16 rounded-xl text-lg font-medium"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </GradientButton>
          )}
        </div>
      </div>
    </div>
  )
}

interface ChatFollowUpQuestionsProps {
  connectionTypesSelected: string[]
  followUpResponses: Record<string, string>
  setFollowUpResponses: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  getFollowUpQuestion: (typeId: string) => string
  currentFollowUpIndex: number
  setCurrentFollowUpIndex: (index: number) => void
  chatMessages: Array<{ type: 'question' | 'answer', text: string, id: string }>
  setChatMessages: (messages: Array<{ type: 'question' | 'answer', text: string, id: string }>) => void
  currentAnswer: string
  setCurrentAnswer: (answer: string) => void
  followUpInputRef: React.RefObject<HTMLTextAreaElement>
  chatContainerRef: React.RefObject<HTMLDivElement>
  onBack?: () => void
  canGoBack?: boolean
}

function ChatFollowUpQuestions({
  connectionTypesSelected,
  followUpResponses,
  setFollowUpResponses,
  getFollowUpQuestion,
  currentFollowUpIndex,
  setCurrentFollowUpIndex,
  chatMessages,
  setChatMessages,
  currentAnswer,
  setCurrentAnswer,
  followUpInputRef,
  chatContainerRef,
  onBack,
  canGoBack = false
}: ChatFollowUpQuestionsProps) {
  // Get questions that need answers
  const followUpQuestions = connectionTypesSelected
    .map(typeId => ({
      typeId,
      question: getFollowUpQuestion(typeId)
    }))
    .filter(item => item.question)

  const currentQuestion = followUpQuestions[currentFollowUpIndex]
  const isLastQuestion = currentFollowUpIndex >= followUpQuestions.length - 1

  // Initialize chat messages when component mounts or questions change
  useEffect(() => {
    if (followUpQuestions.length > 0 && chatMessages.length === 0 && currentFollowUpIndex === 0) {
      // Add first question
      setChatMessages([{
        type: 'question',
        text: followUpQuestions[0].question,
        id: `q-${Date.now()}`
      }])
      // Auto-focus input after a short delay to trigger mobile keyboard
      setTimeout(() => {
        followUpInputRef.current?.focus()
      }, 300)
    }
  }, [followUpQuestions.length])

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages, currentAnswer])

  const handleSendAnswer = () => {
    if (!currentAnswer.trim() || !currentQuestion) return

    // Save the answer
    setFollowUpResponses(prev => ({
      ...prev,
      [currentQuestion.typeId]: currentAnswer.trim()
    }))

    // Add answer to chat
    const answerId = `a-${Date.now()}`
    setChatMessages(prev => [...prev, {
      type: 'answer',
      text: currentAnswer.trim(),
      id: answerId
    }])

    // Clear input
    setCurrentAnswer("")

    // Move to next question after a short delay
    if (!isLastQuestion) {
      setTimeout(() => {
        const nextIndex = currentFollowUpIndex + 1
        setCurrentFollowUpIndex(nextIndex)
        const nextQuestion = followUpQuestions[nextIndex]
        if (nextQuestion) {
          setChatMessages(prev => [...prev, {
            type: 'question',
            text: nextQuestion.question,
            id: `q-${Date.now()}`
          }])
          // Auto-focus input for next question
          setTimeout(() => {
            followUpInputRef.current?.focus()
          }, 100)
        }
      }, 500) // Delay to show answer animation
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendAnswer()
    }
  }

  if (followUpQuestions.length === 0) {
    return <div className="text-center text-muted-foreground py-8">No follow-up questions needed.</div>
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-200px)] relative">
      {/* Back Button - Top Left */}
      {onBack && (
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={`absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors ${
            canGoBack 
              ? 'hover:bg-muted/50 cursor-pointer' 
              : 'opacity-30 cursor-not-allowed'
          }`}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {/* Chat Messages Container - Only show answers */}
      <div 
        ref={chatContainerRef}
        className="flex-shrink overflow-y-auto space-y-4 pb-4 px-1 flex flex-col justify-end pt-14"
        style={{ scrollBehavior: 'smooth' }}
      >
        {chatMessages.map((message) => (
          message.type === 'answer' && (
            <div
              key={message.id}
              className="flex justify-end animate-in fade-in slide-in-from-bottom-4 duration-700"
            >
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-primary text-white">
                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
              </div>
            </div>
          )
        ))}
      </div>

      {/* Question Label and Text - Left justified */}
      <div className="flex-1 flex flex-col justify-center px-4">
        {currentQuestion && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="text-sm text-muted-foreground mb-2">Question:</p>
            <p className="text-lg font-medium text-foreground">{currentQuestion.question}</p>
          </div>
        )}
      </div>

      {/* Input Area - Positioned at very bottom */}
      <div className="pt-4 pb-4 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={followUpInputRef}
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={currentQuestion?.question || "Type your answer..."}
            className="flex-1 rounded-xl min-h-[44px] max-h-[120px] resize-none bg-muted/40"
            rows={1}
            autoFocus
          />
          <Button
            onClick={handleSendAnswer}
            disabled={!currentAnswer.trim() || !currentQuestion}
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
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
  const [currentFollowUpIndex, setCurrentFollowUpIndex] = useState(0)
  const [chatMessages, setChatMessages] = useState<Array<{ type: 'question' | 'answer', text: string, id: string }>>([])
  const [currentAnswer, setCurrentAnswer] = useState("")
  const followUpInputRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [whyAttendingAnswer, setWhyAttendingAnswer] = useState("")
  const whyAttendingInputRef = useRef<HTMLTextAreaElement>(null)
  const [businessNeed, setBusinessNeed] = useState("")
  
  // Unified scroll container state
  const [qaPairs, setQAPairs] = useState<QAPair[]>([])
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [scrollHistory, setScrollHistory] = useState<number[]>([]) // Track scroll positions for back navigation
  
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
            // Otherwise, redirect to home (user can join events from there)
            if (eventId) {
              setCurrentStep(0) // Start with event-specific questions
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

  // Handle connection types checkbox change for scroll container
  const handleConnectionTypesCheckboxChange = (id: string, checked: boolean) => {
    handleConnectionTypeChange(id, checked)
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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string
      setPreviewImageUrl(imageUrl)
      setIsCropModalOpen(true)
    }
    reader.onerror = () => {
      toast.error("Failed to read image file")
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
        toast.error("Failed to process camera photo")
      })
  }

  const handleCropSave = async (croppedImageUrl: string) => {
    try {
      // Convert data URL to blob
      const response = await fetch(croppedImageUrl)
      const blob = await response.blob()
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' })
      
      setPhotoFile(file)
      setPhotoUrl(croppedImageUrl)
      setPreviewImageUrl(null)
      setIsCropModalOpen(false)
    } catch (error) {
      console.error('Error processing cropped image:', error)
      toast.error("Failed to process image")
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/company-enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url: companyUrl })
      })
      
      if (res.ok) {
        const enriched = await res.json()
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
        setCompanySummary(enriched.company_description || null)
      } else {
        // If API call fails, fallback to domain name
        const domain = companyUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
        const domainName = domain.split('.')[0]
        if (domainName && domainName.length > 1) {
          setCompanyName(domainName.charAt(0).toUpperCase() + domainName.slice(1))
        }
        setCompanySummary(null) // Clear summary if enrichment fails
      }
    } catch (e) {
      console.warn("company_enrich_failed", e)
      // On error, fallback to domain name
      const domain = companyUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      const domainName = domain.split('.')[0]
      if (domainName && domainName.length > 1) {
        setCompanyName(domainName.charAt(0).toUpperCase() + domainName.slice(1))
      }
      setCompanySummary(null) // Clear summary on error
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
      const fileName = `${user.id}/avatar-${Date.now()}.jpg`
      
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, photoFile, {
          contentType: 'image/jpeg',
          upsert: true
        })

      if (error) {
        console.error('Error uploading photo:', error)
        toast.error("Failed to upload photo. Using existing photo.")
        return photoUrl
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      return urlData.publicUrl
    } catch (error) {
      console.error('Error uploading photo to storage:', error)
      toast.error("Failed to upload photo")
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
      toast.error("Please complete all required fields")
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
      let companySummaryToSave = companySummary
      
      // If URL exists, ensure we have the latest company summary for that URL
      // Re-enrich if URL changed or if we don't have a summary yet
      if (company && /[.]/.test(company)) {
        // Always re-enrich to get the latest description for the current URL
        try {
          const { data: session } = await supabase.auth.getSession()
          const token = session.session?.access_token
          const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/company-enrich`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ url: company })
          })
          if (res.ok) {
            const enriched = await res.json()
            // Update company name if we don't have one yet
            if (!companyNameToSave) {
              companyNameToSave = enriched.company_name || null
            }
            // Always update summary to match the current URL
            companySummaryToSave = enriched.company_description || null
          }
        } catch (e) {
          console.warn("company_enrich_failed", e)
        }
      }

      // Validation: must have either company_name OR company URL
      if (!companyNameToSave && !company) {
        toast.error("Please enter your company name or company website URL")
        return
      }

      const { error: profileError } = await supabase
        .from("users")
        .upsert({
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: user.email || "",
          photo_url: finalPhotoUrl,
          career_title: jobTitle,
          company_name: companyNameToSave || null,
          company_url: company || null,
          company_summ: companySummaryToSave || null, // Save company description/summary
          career_years_experience: yearsExpInt,
          expertise_summary: expertiseArray.join(", "),
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
      
      // Always redirect to home page after profile completion
      // User can join events from the home page
      setIsRedirecting(true)
      setTimeout(() => {
        router.push("/home")
      }, 1000)
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
          onboarding_completed: true // Adaptive Q&A is dormant, mark as complete
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
      
      // Derive attendance data immediately after saving event onboarding
      // This populates offer_summary, want_summary, embeddings, tags, etc.
      console.log("Calling derive-attendance to populate all fields...")
      try {
        const deriveResponse = await fetch('/api/derive-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, userId: user.id })
        })

        if (deriveResponse.ok) {
          const deriveResult = await deriveResponse.json()
          console.log("Derive-attendance completed:", deriveResult)
        } else {
          const error = await deriveResponse.json()
          console.error('Error deriving attendance (non-blocking):', error)
          // Don't block - continue with adaptive Q&A
        }
      } catch (deriveError) {
        console.error('Error calling derive-attendance (non-blocking):', deriveError)
        // Don't block - continue with adaptive Q&A
      }
      
      // Adaptive Q&A is dormant for now - skip it and complete onboarding
      // Event questions saved, mark onboarding as complete and redirect to home
      console.log('Skipping adaptive Q&A (dormant), completing onboarding')
      
      // Trigger match refresh for the new user (in background)
      try {
        await fetch('/api/refresh-matches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            eventId: eventId, 
            newUserId: user.id 
          }),
        })
      } catch (error) {
        console.error('Failed to refresh matches for new user:', error)
        // Don't show error to user, this is a background process
      }

      // Trigger incremental matching
      try {
        await fetch('/api/match-incremental', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, userId: user.id })
        })
      } catch (error) {
        console.error('Failed to trigger incremental matching:', error)
        // Don't block - continue anyway
      }

      toast.success('Profile complete! Redirecting to your event...')
      setIsRedirecting(true)
      setTimeout(() => {
        router.push('/home')
      }, 1500)
      
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
        
        toast.error('Failed to load next question')
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
      
      toast.error('An error occurred loading the question')
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
      // Even if there's an error, redirect to home since onboarding data is saved
      toast.success('Profile saved! Redirecting...')
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
            <Label className="text-sm font-medium text-foreground w-full text-left">
              Profile Picture
            </Label>
            <div className="relative">
              <Avatar className="w-24 h-24 border-2 border-border">
                <AvatarImage src={photoUrl || undefined} alt={`${firstName} ${lastName}`} />
                <AvatarFallback className="bg-muted text-muted-foreground text-xl font-medium">
                  {firstName?.[0]?.toUpperCase() || ''}{lastName?.[0]?.toUpperCase() || ''}
                </AvatarFallback>
              </Avatar>
              {photoUrl && (
                <button
                  onClick={handleRemovePhoto}
                  className="absolute -top-2 -right-2 rounded-full bg-destructive text-white p-1.5 hover:bg-destructive/90 transition-colors"
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
                className={`mt-1 rounded-xl bg-muted/40 ${validationErrors.firstName ? 'border-destructive' : ''}`}
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
                className={`mt-1 rounded-xl bg-muted/40 ${validationErrors.lastName ? 'border-destructive' : ''}`}
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
          <div className="space-y-4">
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
                className={`mt-1 rounded-xl bg-muted/40 ${validationErrors.jobTitle ? 'border-destructive' : ''}`}
                required
              />
              {validationErrors.jobTitle && (
                <p className="text-xs text-destructive mt-1">{validationErrors.jobTitle}</p>
              )}
            </div>

            {/* Years of Experience - Bubble Grid */}
            <div>
              <Label className="text-sm font-medium text-foreground">
                Years in your career field *
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
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
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      yearsExperience === option
                        ? 'bg-primary text-white'
                        : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
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
              <Label htmlFor="company" className="text-sm font-medium text-foreground">
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
                className={`mt-1 rounded-xl bg-muted/40 ${companyUrlError ? 'border-destructive' : ''}`}
              />
              {companyUrlError && (
                <p className="text-xs text-destructive mt-1">{companyUrlError}</p>
              )}
              {/* Company Name Input - Only show after URL is entered or invalid input attempted */}
              {(company || companyUrlTouched) && (
                <div className="mt-2">
                  <Label htmlFor="companyName" className="text-sm font-medium text-foreground">
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
                    className={`mt-1 rounded-xl bg-muted/40 ${validationErrors.company ? 'border-destructive' : ''}`}
                  />
                </div>
              )}
              {validationErrors.company && (
                <p className="text-xs text-destructive mt-1">{validationErrors.company}</p>
              )}
            </div>

            {/* Areas of Expertise - Bubbles */}
            <div>
              <Label htmlFor="areasOfExpertise" className="text-sm font-medium text-foreground">
                Areas of Expertise *
              </Label>
              
              {/* Suggested expertise bubbles - show all, highlight selected ones */}
              {suggestedExpertise.length > 0 && (
                <div className="mt-2 mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Select or add those that apply:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedExpertise.map((expertise) => (
                      <button
                        key={expertise}
                        type="button"
                        onClick={() => addSuggestedExpertise(expertise)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          areasOfExpertise.includes(expertise)
                            ? 'bg-primary text-white border border-primary'
                            : 'bg-muted/60 text-foreground hover:bg-muted/80 border border-border'
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
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-white flex items-center gap-2"
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
                  className={`mt-1 rounded-xl pr-10 bg-muted/40 ${validationErrors.areasOfExpertise ? 'border-destructive' : ''}`}
                />
                {expertiseInput.trim() && (
                  <button
                    type="button"
                    onClick={addCustomExpertise}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90"
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

  // Initialize unified scroll container when entering event onboarding
  useEffect(() => {
    if (eventId && currentStep === 0 && !currentQuestionId) {
      // Start with the first question
      setCurrentQuestionId("why-attending")
      setQAPairs([{
        id: "why-attending",
        question: eventName ? `Why are you attending ${eventName}?` : "Why are you attending?",
        answer: null,
        type: 'text'
      }])
    }
  }, [eventId, currentStep, eventName, currentQuestionId])

  // Update question text when eventName becomes available
  useEffect(() => {
    if (eventName && qaPairs.some(qa => qa.id === "why-attending")) {
      setQAPairs(prev => prev.map(qa => 
        qa.id === "why-attending" 
          ? { ...qa, question: `Why are you attending ${eventName}?` }
          : qa
      ))
    }
  }, [eventName, qaPairs.length])
  
  // When "why attending" is answered, add connection types question to scroll
  useEffect(() => {
    if (eventId && whyAttending.trim() && currentStep === 0 && qaPairs.some(qa => qa.id === "why-attending" && qa.answer)) {
      // Move to connection types step
      setCurrentStep(1)
      setCurrentQuestionId("connection-types")
      // Add connection types question to Q&A pairs
      if (!qaPairs.some(qa => qa.id === "connection-types")) {
        setQAPairs(prev => [...prev, {
          id: "connection-types",
          question: "What types of connections would you be ok with?",
          answer: null,
          type: 'checkbox',
          checkboxOptions: [
            { id: "general", label: "General Connections" },
            { id: "business-opportunities", label: "Discover Business Opportunities" },
            { id: "find-mentor", label: "Find a Mentor" },
            { id: "be-mentor", label: "Be a Mentor" },
            { id: "find-job", label: "Find a Job" },
            { id: "recruit", label: "Recruit" },
            { id: "other", label: "Other" }
          ],
          checkboxSelected: []
        }])
      }
    }
  }, [whyAttending, eventId, currentStep, qaPairs])
  
  // When connection types are submitted, add follow-up questions one by one
  useEffect(() => {
    if (eventId && connectionTypesSelected.length > 0 && currentStep === 1) {
      const connectionTypesAnswered = qaPairs.some(qa => qa.id === "connection-types" && qa.checkboxSelected && qa.checkboxSelected.length > 0)
      
      if (connectionTypesAnswered && currentFollowUpIndex === 0) {
        // Get follow-up questions for selected connection types
        const followUpQuestions = connectionTypesSelected
          .map(typeId => ({
            typeId,
            question: getFollowUpQuestion(typeId)
          }))
          .filter(item => item.question)
        
        // Add first follow-up question if not already added
        if (followUpQuestions.length > 0) {
          const firstFollowUp = followUpQuestions[0]
          const followUpId = `follow-up-${firstFollowUp.typeId}`
          
          if (!qaPairs.some(qa => qa.id === followUpId)) {
            setTimeout(() => {
              setCurrentQuestionId(followUpId)
              setQAPairs(prev => [...prev, {
                id: followUpId,
                question: firstFollowUp.question,
                answer: null,
                type: 'text'
              }])
              setCurrentStep(2) // Move to follow-ups step
            }, 1000) // Delay to allow scroll animation
          }
        }
      }
    }
  }, [connectionTypesSelected, eventId, currentStep, qaPairs, currentFollowUpIndex, getFollowUpQuestion])
  
  // Handle follow-up question completion - move to next one
  useEffect(() => {
    if (eventId && currentStep === 2 && currentQuestionId?.startsWith("follow-up-")) {
      const followUpQuestions = connectionTypesSelected
        .map(typeId => ({
          typeId,
          question: getFollowUpQuestion(typeId)
        }))
        .filter(item => item.question)
      
      // Check if current follow-up is answered
      const currentFollowUp = followUpQuestions[currentFollowUpIndex]
      if (currentFollowUp) {
        const followUpId = `follow-up-${currentFollowUp.typeId}`
        const isAnswered = qaPairs.some(qa => qa.id === followUpId && qa.answer)
        
        if (isAnswered && currentFollowUpIndex < followUpQuestions.length - 1) {
          // Move to next follow-up question
          const nextIndex = currentFollowUpIndex + 1
          const nextFollowUp = followUpQuestions[nextIndex]
          
          if (nextFollowUp) {
            const nextFollowUpId = `follow-up-${nextFollowUp.typeId}`
            
            // Add next question if not already added
            if (!qaPairs.some(qa => qa.id === nextFollowUpId)) {
              setTimeout(() => {
                setCurrentFollowUpIndex(nextIndex)
                setCurrentQuestionId(nextFollowUpId)
                setQAPairs(prev => [...prev, {
                  id: nextFollowUpId,
                  question: nextFollowUp.question,
                  answer: null,
                  type: 'text'
                }])
                setCurrentAnswer("")
              }, 1000) // Delay to allow scroll animation
            }
          }
        }
      }
    }
  }, [qaPairs, connectionTypesSelected, currentFollowUpIndex, eventId, currentStep, currentQuestionId, getFollowUpQuestion])

  const handleAnswerSubmit = (questionId: string, answer: string) => {
    setQAPairs(prev => prev.map(qa => 
      qa.id === questionId ? { ...qa, answer } : qa
    ))
    
    // Update the corresponding state
    if (questionId === "why-attending") {
      setWhyAttending(answer)
    } else if (questionId.startsWith("follow-up-")) {
      const typeId = questionId.replace("follow-up-", "")
      setFollowUpResponses(prev => ({ ...prev, [typeId]: answer }))
    }
  }

  const handleScrollContinue = () => {
    // Check if we're in follow-up questions
    if (currentQuestionId?.startsWith("follow-up-")) {
      const followUpQuestions = connectionTypesSelected
        .map(typeId => ({
          typeId,
          question: getFollowUpQuestion(typeId)
        }))
        .filter(item => item.question)
      
      // Check if all follow-ups are answered
      const allAnswered = followUpQuestions.every((item) => {
        const followUpId = `follow-up-${item.typeId}`
        return qaPairs.some(qa => qa.id === followUpId && qa.answer)
      })
      
      if (allAnswered) {
        // All follow-ups answered, move to next step
        setCurrentQuestionId(null)
        handleNext()
      }
      // Otherwise, the useEffect will handle moving to the next follow-up question
    } else {
      // Clear current question and move to next step/question
      setCurrentQuestionId(null)
      handleNext()
    }
  }

  const handleScrollBack = () => {
    if (qaPairs.length > 1) {
      // Save current scroll position before going back
      const scrollContainer = document.querySelector('[data-scroll-container]') as HTMLElement
      if (scrollContainer) {
        setScrollHistory(prev => [...prev, scrollContainer.scrollTop])
      }
      
      // Find the previous question and restore its answer for editing
      const lastQAPair = qaPairs[qaPairs.length - 1]
      const prevQAPair = qaPairs[qaPairs.length - 2]
      
      if (prevQAPair) {
        // Remove the last Q&A pair with reverse animation
        setQAPairs(prev => {
          const newPairs = prev.slice(0, -1)
          return newPairs
        })
        
        // Restore previous question for editing
        setTimeout(() => {
          setCurrentQuestionId(prevQAPair.id)
          
          if (prevQAPair.type === 'text') {
            setCurrentAnswer(prevQAPair.answer || "")
            // Restore state
            if (prevQAPair.id === "why-attending") {
              setWhyAttending(prevQAPair.answer || "")
            }
          } else if (prevQAPair.type === 'checkbox') {
            // Restore checkbox selections
            if (prevQAPair.id === "connection-types" && prevQAPair.checkboxSelected) {
              setConnectionTypesSelected(prevQAPair.checkboxSelected)
            }
          }
          
          // Scroll back down smoothly
          setTimeout(() => {
            const scrollContainer = document.querySelector('[data-scroll-container]') as HTMLElement
            if (scrollContainer) {
              scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: 'smooth'
              })
            }
          }, 300)
        }, 100)
      }
    } else if (qaPairs.length === 1) {
      // Only one Q&A pair, go back to previous step
      setCurrentQuestionId(null)
      setQAPairs([])
      handleBack()
    } else {
      // No Q&A pairs, go back to previous step
      handleBack()
    }
  }

  const eventSteps: OnboardingStep[] = [
    {
      id: "why-attending",
      title: eventName ? `Why are you attending ${eventName}?` : "Why are you attending?",
      description: "", // Removed subtitle
      component: (currentQuestionId === "why-attending" || currentQuestionId === "connection-types" || currentQuestionId?.startsWith("follow-up-")) && qaPairs.length > 0 ? (
        <UnifiedScrollContainer
          qaPairs={qaPairs}
          currentQuestionId={currentQuestionId}
          currentAnswer={
            currentQuestionId === "why-attending" 
              ? whyAttending 
              : currentQuestionId?.startsWith("follow-up-")
              ? currentAnswer
              : ""
          }
          setCurrentAnswer={
            currentQuestionId === "why-attending" 
              ? setWhyAttending 
              : currentQuestionId?.startsWith("follow-up-")
              ? setCurrentAnswer
              : () => {}
          }
          onAnswerSubmit={(questionId, answer) => {
            if (questionId === "connection-types") {
              // Update the Q&A pair with checkbox selections
              setQAPairs(prev => prev.map(qa => 
                qa.id === questionId ? { ...qa, checkboxSelected: connectionTypesSelected } : qa
              ))
            } else {
              handleAnswerSubmit(questionId, answer)
            }
          }}
          onContinue={handleScrollContinue}
          inputRef={whyAttendingInputRef}
          isSubmitting={isLoading}
          canGoBack={currentStep > 0 || qaPairs.length > 1}
          onBack={handleScrollBack}
          checkboxOptions={currentQuestionId === "connection-types" ? [
            { id: "general", label: "General Connections" },
            { id: "business-opportunities", label: "Discover Business Opportunities" },
            { id: "find-mentor", label: "Find a Mentor" },
            { id: "be-mentor", label: "Be a Mentor" },
            { id: "find-job", label: "Find a Job" },
            { id: "recruit", label: "Recruit" },
            { id: "other", label: "Other" }
          ] : undefined}
          checkboxSelected={currentQuestionId === "connection-types" ? connectionTypesSelected : undefined}
          onCheckboxChange={currentQuestionId === "connection-types" ? handleConnectionTypesCheckboxChange : undefined}
        />
      ) : (
        <ChatQuestionInput
          question={eventName ? `Why are you attending ${eventName}?` : "Why are you attending?"}
          answer={whyAttending}
          setAnswer={setWhyAttending}
          placeholder="Help us understand your goals for this event"
          inputRef={whyAttendingInputRef}
          onComplete={() => {
            // Advance to next step after clicking Continue
            if (whyAttending.trim()) {
              handleNext()
            }
          }}
          onBack={handleBack}
          canGoBack={currentStep > 0}
        />
      )
    },
    {
      id: "connection-types",
      title: "Connection Types",
      description: "What types of connections would you be ok with?",
      component: (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 relative pt-14">
          {/* Back Button - Top Left */}
          <button
            onClick={handleBack}
            disabled={currentStep <= 0}
            className={`absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors ${
              currentStep > 0
                ? 'hover:bg-muted/50 cursor-pointer' 
                : 'opacity-30 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
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
        <ChatFollowUpQuestions
          connectionTypesSelected={connectionTypesSelected}
          followUpResponses={followUpResponses}
          setFollowUpResponses={setFollowUpResponses}
          getFollowUpQuestion={getFollowUpQuestion}
          currentFollowUpIndex={currentFollowUpIndex}
          setCurrentFollowUpIndex={setCurrentFollowUpIndex}
          chatMessages={chatMessages}
          setChatMessages={setChatMessages}
          currentAnswer={currentAnswer}
          setCurrentAnswer={setCurrentAnswer}
          followUpInputRef={followUpInputRef}
          chatContainerRef={chatContainerRef}
          onBack={handleBack}
          canGoBack={currentStep > 0}
        />
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

  // Determine visible steps:
  // - If eventId is present, only show event-specific steps (skip profile)
  // - If no eventId, show profile steps (user needs to complete profile first)
  const visibleSteps = eventId ? eventSteps : (profileCompleted ? [] : profileSteps)
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
    if (currentStepData.id === "professional") return jobTitle && company && yearsExperience && areasOfExpertise.length > 0
    if (currentStepData.id === "connection-types") return connectionTypesSelected.length > 0
    if (currentStepData.id === "why-attending") return whyAttending.trim().length > 0
    if (currentStepData.id === "follow-ups") {
      // Check if all follow-up questions have been answered
      const followUpQuestions = connectionTypesSelected
        .map(typeId => ({ typeId, question: getFollowUpQuestion(typeId) }))
        .filter(item => item.question)
      return followUpQuestions.every(item => followUpResponses[item.typeId]?.trim())
    }
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
      // Reset follow-up state when entering follow-ups step
      setCurrentFollowUpIndex(0)
      setChatMessages([])
      setCurrentAnswer("")
    } else if (stepId === "why-attending") {
      // For chat-style questions, handleNext is called automatically after sending
      // This validation is just a safety check
      if (!whyAttending.trim()) {
        toast.error("Please tell us why you're attending")
        return
      }
    } else if (stepId === "follow-ups") {
      // Ensure all follow-up questions are answered
      const followUpQuestions = connectionTypesSelected
        .map(typeId => ({ typeId, question: getFollowUpQuestion(typeId) }))
        .filter(item => item.question)
      const allAnswered = followUpQuestions.every(item => followUpResponses[item.typeId]?.trim())
      if (!allAnswered) {
        toast.error("Please answer all questions before continuing")
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
      <div className={`flex-1 flex items-center justify-center px-6 ${currentStep === 0 ? '' : 'md:items-center items-start pt-8 md:pt-0'} ${currentQuestionId ? 'pb-0' : 'pb-48'}`}>
        <div className={`w-full max-w-lg transition-all duration-300 animate-fade-up ${currentQuestionId ? 'h-full flex flex-col' : ''}`}>
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
              {/* Hide header for chat-style questions */}
              {currentStepData.id !== "why-attending" && currentStepData.id !== "follow-ups" && (
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    {currentStepData.title}
                  </h2>
                  {currentStepData.description && (
                    <p className="text-muted-foreground">
                      {currentStepData.description}
                    </p>
                  )}
                </div>
              )}
              <div className={currentStepData.id === "why-attending" || currentStepData.id === "follow-ups" ? "h-full flex flex-col" : "space-y-6"}>
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
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border shadow-2xl px-6 z-[100] py-4">
        <div className="max-w-lg mx-auto">
          {/* Hide back/continue buttons for chat-style questions and unified scroll container */}
          {currentStepData.id !== "why-attending" && currentStepData.id !== "follow-ups" && !(currentQuestionId === "why-attending" || currentQuestionId === "connection-types" || currentQuestionId?.startsWith("follow-up-")) && (
            <div className="flex gap-4 items-center">
              {/* Back Button */}
              <GradientButton 
                variant="outline" 
                onClick={handleBack} 
                disabled={currentStep <= 0} 
                className="flex items-center justify-center w-16 h-16 rounded-2xl border-2 border-primary disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
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
                className="flex-1 h-16 rounded-2xl text-lg font-medium gradient-primary text-white hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
              >
                {isLoading || isLoadingQuestion ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading...
                  </span>
                ) : isLastStep ? (
                  isLoading ? "Completing..." : "Complete"
                ) : (
                  <span className="flex items-center justify-center">
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </span>
                )}
              </GradientButton>
            </div>
          )}
          
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
    </div>
  )
}

