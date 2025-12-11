"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { getAvatarUrl } from "@/lib/utils"
import { Star, Search } from "lucide-react"

const DEFAULT_FIXED_QUESTIONS = [
  "How useful is this app in helping you build your network?",
  "How likely are you to do business with the interactions it suggested?",
]

const DEFAULT_OPEN_QUESTION = "Who was your most beneficial connection you made at the event?"

type Attendee = {
  userId: string
  firstName: string
  lastName: string
  photoUrl: string | null
  isConnected: boolean
}

type SurveyConfig = {
  eventName: string
  customQuestion: string
  fixedQuestions: string[]
  openQuestion: string
  attendees: Attendee[]
}

type SurveyStatus = "loading" | "ready" | "submitting" | "submitted" | "error"

export default function TestSurveyPage() {
  const router = useRouter()
  const [config, setConfig] = useState<SurveyConfig | null>(null)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [status, setStatus] = useState<SurveyStatus>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchConfig = async () => {
      setStatus("loading")
      setError(null)
      try {
        const response = await fetch(`/api/survey/test`)
        const data = await response.json()
        if (!response.ok) {
          if (!isMounted) return
          setError(data?.error || "Unable to load test survey")
          setStatus("error")
          return
        }

        if (!isMounted) return
        
        // Log debug info to browser console
        if (data._debug) {
          console.log('[Survey Test] Debug info:', data._debug)
          console.log(`[Survey Test] Found ${data._debug.totalConnectionsFound} total connections`)
          console.log(`[Survey Test] Found ${data._debug.userAddedConnections} user-added connections`)
          console.log(`[Survey Test] Connected user IDs:`, data._debug.connectedUserIds)
          console.log(`[Survey Test] Connection details:`, data._debug.connectionDetails)
        }
        
        setConfig({
          eventName: data.eventName,
          customQuestion: data.customQuestion,
          fixedQuestions: data.fixedQuestions ?? DEFAULT_FIXED_QUESTIONS,
          openQuestion: data.openQuestion ?? DEFAULT_OPEN_QUESTION,
          attendees: data.attendees ?? [],
        })
        
        // Log attendees info
        const connectedCount = (data.attendees ?? []).filter((a: any) => a.isConnected).length
        console.log(`[Survey Test] Loaded ${data.attendees?.length || 0} attendees, ${connectedCount} marked as connected`)
        
        setStatus("ready")
      } catch (err) {
        console.error("Failed to load test survey config:", err)
        if (!isMounted) return
        setError("Unable to load test survey right now. Please try again.")
        setStatus("error")
      }
    }

    fetchConfig()
    return () => {
      isMounted = false
    }
  }, [])

  const questions = useMemo(() => {
    if (!config) return []
    return [
      { key: "custom", text: config.customQuestion },
      { key: "useful", text: config.fixedQuestions?.[0] ?? DEFAULT_FIXED_QUESTIONS[0] },
      { key: "business", text: config.fixedQuestions?.[1] ?? DEFAULT_FIXED_QUESTIONS[1] },
    ]
  }, [config])

  const handleStarClick = (questionKey: string, rating: number) => {
    setRatings((prev) => ({
      ...prev,
      [questionKey]: rating,
    }))
  }

  const validateRatings = () => {
    const missing = questions.find((q) => !ratings[q.key])
    if (missing) {
      setError("Please rate each question before submitting.")
      return false
    }
    return true
  }

  const filteredAttendees = useMemo(() => {
    if (!config?.attendees) return []
    if (!searchQuery.trim()) return config.attendees
    
    const query = searchQuery.toLowerCase()
    return config.attendees.filter(attendee => {
      const fullName = `${attendee.firstName} ${attendee.lastName}`.toLowerCase()
      return fullName.includes(query)
    })
  }, [config?.attendees, searchQuery])

  const handleSubmit = async () => {
    if (!config) return
    setError(null)

    if (!validateRatings()) return

    setStatus("submitting")
    try {
      // For test page, just simulate submission
      await new Promise(resolve => setTimeout(resolve, 1000))
      setStatus("submitted")
      console.log("Test survey submission:", {
        ratings,
        selectedConnections: Array.from(selectedConnections),
      })
      
      // Redirect to recap page after a brief delay
      setTimeout(() => {
        router.push('/survey/test/recap')
      }, 1000)
    } catch (err) {
      console.error("Failed to submit test survey:", err)
      setError("Unable to submit test survey right now. Please try again.")
      setStatus("ready")
    }
  }

  const StarRating = ({ questionKey }: { questionKey: string }) => {
    const currentRating = ratings[questionKey] || 0

    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleStarClick(questionKey, star)}
            className="transition-transform hover:scale-110 focus:outline-none"
            aria-label={`Rate ${star} stars`}
          >
            <Star
              className="h-6 w-6 cursor-pointer transition-colors"
              fill={star <= currentRating ? "currentColor" : "none"}
              stroke={star <= currentRating ? "currentColor" : "currentColor"}
              style={{
                color: star <= currentRating ? "#72A557" : "#7D7A73",
              }}
            />
          </button>
        ))}
      </div>
    )
  }

  const renderBody = () => {
    if (status === "loading") {
      return (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading test survey...</p>
        </div>
      )
    }

    if (status === "error") {
      return (
        <div className="text-center text-muted-foreground py-12">
          <p className="mb-2">{error || "Unable to load this test survey."}</p>
          <p className="text-sm">Make sure event TEST12 exists and has connections.</p>
        </div>
      )
    }

    if (status === "submitted") {
      return (
        <div className="text-center space-y-3 py-6">
          <h2 className="text-xl font-bold text-foreground uppercase" style={{ letterSpacing: '0.02em' }}>Redirecting to your recap</h2>
        </div>
      )
    }

    return (
      <div className="space-y-8">
        {questions.map((question) => (
          <div key={question.key} className="space-y-3">
            <p className="text-base font-medium text-foreground">{question.text}</p>
            <StarRating questionKey={question.key} />
          </div>
        ))}

        <div className="space-y-3 pt-2">
          <p className="text-base font-medium text-foreground">
            {config?.openQuestion || DEFAULT_OPEN_QUESTION}
          </p>
          
          {config?.attendees && config.attendees.length > 0 ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search attendees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2 border border-border rounded-lg p-2">
                {filteredAttendees.length > 0 ? (
                  filteredAttendees.map((attendee, index) => {
                    // Show a divider after the last connected attendee
                    const prevAttendee = index > 0 ? filteredAttendees[index - 1] : null
                    const showDivider = prevAttendee?.isConnected && !attendee.isConnected
                    const fullName = `${attendee.firstName} ${attendee.lastName}`.trim()
                    const initials = fullName
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()
                    const isSelected = selectedConnections.has(attendee.userId)
                    const avatarUrl = getAvatarUrl(attendee.photoUrl)
                    
                    return (
                      <div key={attendee.userId}>
                        {showDivider && (
                          <div className="my-2 border-t border-border"></div>
                        )}
                        <label
                          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                            attendee.isConnected ? 'bg-muted/30' : ''
                          }`}
                        >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedConnections(prev => new Set(prev).add(attendee.userId))
                            } else {
                              setSelectedConnections(prev => {
                                const next = new Set(prev)
                                next.delete(attendee.userId)
                                return next
                              })
                            }
                          }}
                          className="flex-shrink-0 border-2 border-border bg-background size-5"
                        />
                        <PresenceAvatar
                          src={avatarUrl || undefined}
                          fallback={initials}
                          isPresent={false}
                          size="md"
                          className="flex-shrink-0"
                        />
                        <span className="text-sm font-medium text-foreground flex-1">
                          {fullName}
                        </span>
                        {attendee.isConnected && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            Connected
                          </span>
                        )}
                        </label>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No attendees found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No attendees found for this event. Make sure event TEST12 has attendees.
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={status === "submitting"}
          className="w-full h-12 rounded-concave"
        >
          {status === "submitting" ? "Submitting..." : "Submit survey (test)"}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="text-center mb-8">
          <div className="mb-2">
            <span className="inline-block px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded">
              TEST MODE
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground uppercase" style={{ letterSpacing: '0.02em' }}>
            Thank you for attending {config?.eventName || "the event"}
          </h1>
        </div>

        <Card className="bg-card border-border shadow-elevation">
          <CardContent className="p-8">
            {renderBody()}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
