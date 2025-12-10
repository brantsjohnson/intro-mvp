"use client"

import { use, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Star } from "lucide-react"

const DEFAULT_FIXED_QUESTIONS = [
  "How useful is this app in helping you build your network?",
  "How likely are you to do business with the interactions it suggested?",
]

const DEFAULT_OPEN_QUESTION = "Who was your most beneficial connection you made at the event?"

type SurveyConfig = {
  eventName: string
  customQuestion: string
  fixedQuestions: string[]
  openQuestion: string
}

type SurveyStatus = "loading" | "ready" | "submitting" | "submitted" | "error"

export default function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [config, setConfig] = useState<SurveyConfig | null>(null)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState("")
  const [status, setStatus] = useState<SurveyStatus>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchConfig = async () => {
      setStatus("loading")
      setError(null)
      try {
        const response = await fetch(`/api/survey/${token}`)
        const data = await response.json()
        if (!response.ok) {
          if (!isMounted) return
          setError(data?.error || "Unable to load survey")
          setStatus("error")
          return
        }

        if (!isMounted) return
        setConfig({
          eventName: data.eventName,
          customQuestion: data.customQuestion,
          fixedQuestions: data.fixedQuestions ?? DEFAULT_FIXED_QUESTIONS,
          openQuestion: data.openQuestion ?? DEFAULT_OPEN_QUESTION,
        })
        setStatus("ready")
      } catch (err) {
        console.error("Failed to load survey config:", err)
        if (!isMounted) return
        setError("Unable to load survey right now. Please try again.")
        setStatus("error")
      }
    }

    fetchConfig()
    return () => {
      isMounted = false
    }
  }, [token])

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

  const handleSubmit = async () => {
    if (!config) return
    setError(null)

    if (!validateRatings()) return

    setStatus("submitting")
    try {
      const response = await fetch(`/api/survey/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ratingCustom: ratings["custom"],
          ratingUseful: ratings["useful"],
          ratingBusiness: ratings["business"],
          openAnswer: feedback,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data?.error || "Unable to submit survey.")
        setStatus("ready")
        return
      }

      setStatus("submitted")
    } catch (err) {
      console.error("Failed to submit survey:", err)
      setError("Unable to submit survey right now. Please try again.")
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
          <p className="text-muted-foreground">Loading survey...</p>
        </div>
      )
    }

    if (status === "error") {
      return (
        <div className="text-center text-muted-foreground py-12">
          {error || "Unable to load this survey link."}
        </div>
      )
    }

    if (status === "submitted") {
      return (
        <div className="text-center space-y-3 py-10">
          <h2 className="text-xl font-bold text-foreground uppercase" style={{ letterSpacing: '0.02em' }}>Thanks for your feedback!</h2>
          <p className="text-muted-foreground">
            Your responses were recorded. We hope you enjoyed {config?.eventName || "the event"}.
          </p>
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
          <Textarea
            placeholder="Share your thoughts..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[8rem] bg-input border-border resize-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={status === "submitting"}
          className="w-full h-12 rounded-concave"
        >
          {status === "submitting" ? "Submitting..." : "Submit survey"}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground uppercase" style={{ letterSpacing: '0.02em' }}>
            Thank you so much for coming to {config?.eventName || "the event"}
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

