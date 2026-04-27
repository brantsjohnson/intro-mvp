"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Check, ChevronLeft, Loader2 } from "lucide-react"
import { GradientButton } from "@/components/ui/gradient-button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { haptics } from "@/lib/haptics"
import {
  NEED_DEMO_SCRIPT,
  OFFER_DEMO_SCRIPT,
  getDemoAdvanceResponse,
  getDemoRewriteSummary,
  type DemoAdvanceResponse,
} from "@/lib/onboarding/demo-script"

const DEMO_FAKE_LATENCY_MS = 350

interface OptionShape {
  id: string
  label: string
}

function optionIsOther(opt: OptionShape): boolean {
  return opt.label.trim().toLowerCase() === "other"
}

function buildOfferMultiAnswer(
  opts: OptionShape[],
  selectedIds: string[],
  otherText: string,
): string | null {
  if (selectedIds.length === 0) return null
  const selected = new Set(selectedIds)
  const otherOpt = opts.find(optionIsOther)
  if (otherOpt && selected.has(otherOpt.id) && !otherText.trim()) return null
  const parts: string[] = []
  for (const o of opts) {
    if (!selected.has(o.id)) continue
    parts.push(optionIsOther(o) ? `Other: ${otherText.trim()}` : o.label)
  }
  return parts.length ? parts.join("; ") : null
}

type Phase =
  | "loading"
  | "question"
  | "confirm_need"
  | "tweak_need"
  | "confirm_offer"
  | "tweak_offer"
  | "done"
  | "error"

interface ApiAdvanceResponse {
  phase: "question" | "confirm" | "done"
  nodeId: string | null
  question: string | null
  options: OptionShape[] | null
  freeResponse: boolean
  draftSummary: string | null
  error?: string
}

interface ApiRewriteResponse {
  draftSummary?: string
  error?: string
}

interface EventBranchingOnboardingProps {
  eventId: string
  userId: string
  eventName: string | null
  onComplete: () => void
  /**
   * When true, the component drives itself from `demo-script.ts` instead of
   * calling `/api/onboarding/*`. No Supabase writes, no OpenAI calls.
   */
  demo?: boolean
}

// Shared card shell keeps visual parity with the profile onboarding card.
function CardShell({
  title,
  subtitle,
  progress,
  children,
  footer,
}: {
  title: string
  subtitle?: string | null
  progress: number
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      <div className="fixed top-0 left-0 right-0 bg-[#EDEBE6] border-b border-border shadow-sm z-30 safe-area-top">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <p className="text-xs md:text-sm text-center text-muted-foreground leading-relaxed">
            This information is used to match you with the most relevant people. It may be visible to users.
            <br />
            This information is not used for marketing.
          </p>
        </div>
      </div>

      <div className="fixed left-0 right-0 z-20" style={{ top: "52px" }}>
        <div className="w-full h-[2px] bg-[#EDEBE6]">
          <div
            className="gradient-progress h-[2px] transition-all duration-300 ease-out"
            style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
          />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 md:px-6 overflow-hidden" style={{ paddingTop: "52px" }}>
        <div
          className="w-full max-w-lg transition-all duration-300 animate-fade-up rounded-concave bg-[#EDEBE6] double-border p-8 md:p-10 mb-24 max-h-[calc(100vh-10rem)] overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#72A557 transparent" }}
        >
          <div className="space-y-6 md:space-y-8">
            <div>
              <h2
                className="text-lg md:text-xl font-title text-foreground mb-4 md:mb-6 leading-tight"
                style={{ textTransform: "none" }}
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="text-sm md:text-base text-muted-foreground font-body">{subtitle}</p>
              ) : null}
            </div>
            <div className="space-y-4 md:space-y-6">{children}</div>
          </div>
        </div>
      </div>

      {footer ? (
        <div className="fixed bottom-0 left-0 right-0 bg-[#EDEBE6] border-t border-border shadow-2xl px-4 md:px-6 z-[100] py-3 md:py-4 safe-area-bottom">
          <div className="max-w-lg mx-auto">{footer}</div>
        </div>
      ) : null}
    </div>
  )
}

export function EventBranchingOnboarding({
  eventId,
  userId,
  eventName,
  onComplete,
  demo = false,
}: EventBranchingOnboardingProps) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [question, setQuestion] = useState<string>("")
  const [options, setOptions] = useState<OptionShape[] | null>(null)
  const [isFreeResponse, setIsFreeResponse] = useState(false)
  const [freeText, setFreeText] = useState("")
  const [otherMode, setOtherMode] = useState(false)
  const [draftSummary, setDraftSummary] = useState<string>("")
  const [tweakText, setTweakText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [offerStarted, setOfferStarted] = useState(false)
  const [totalStepsEstimate, setTotalStepsEstimate] = useState(5)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  /** Offer flow only: multi-select MC + inline Other (see `buildOfferMultiAnswer`). */
  const [offerMultiSelectedIds, setOfferMultiSelectedIds] = useState<string[]>([])
  const [offerOtherInline, setOfferOtherInline] = useState("")

  const composedOfferAnswer = useMemo(
    () => buildOfferMultiAnswer(options || [], offerMultiSelectedIds, offerOtherInline),
    [options, offerMultiSelectedIds, offerOtherInline],
  )

  const hasFetchedEntryRef = useRef(false)

  // ---- Demo mode state (only used when `demo` is true) ----
  const demoNeedIndexRef = useRef(0)
  const demoOfferIndexRef = useRef(0)

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

  const advanceDemo = useCallback(
    async (kind: "need" | "offer"): Promise<DemoAdvanceResponse> => {
      await sleep(DEMO_FAKE_LATENCY_MS)
      if (kind === "need") {
        const idx = demoNeedIndexRef.current
        demoNeedIndexRef.current = idx + 1
        return getDemoAdvanceResponse(NEED_DEMO_SCRIPT, idx)
      }
      const idx = demoOfferIndexRef.current
      demoOfferIndexRef.current = idx + 1
      return getDemoAdvanceResponse(OFFER_DEMO_SCRIPT, idx)
    },
    [],
  )

  // Demo mode "back": rewind the script index by one and re-emit the previous step.
  const backDemo = useCallback(
    async (kind: "need" | "offer"): Promise<DemoAdvanceResponse> => {
      await sleep(DEMO_FAKE_LATENCY_MS)
      const ref = kind === "need" ? demoNeedIndexRef : demoOfferIndexRef
      const script = kind === "need" ? NEED_DEMO_SCRIPT : OFFER_DEMO_SCRIPT
      // ref.current is "next index to emit". Currently displayed step was ref.current - 1.
      // To go back one step, re-emit (ref.current - 2) and set ref to (ref.current - 1).
      const prevIdx = Math.max(0, ref.current - 2)
      ref.current = prevIdx + 1
      return getDemoAdvanceResponse(script, prevIdx)
    },
    [],
  )

  // ---- Refresh / back-button guard ----
  useEffect(() => {
    if (phase === "done") return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
      return ""
    }
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href)
    }
    window.history.pushState(null, "", window.location.href)
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [phase])

  // ---- API helpers ----
  const callAdvance = useCallback(
    async (
      kind: "need" | "offer",
      body: { currentNodeId: string | null; answer: string | null },
    ): Promise<ApiAdvanceResponse> => {
      if (demo) {
        const result = await advanceDemo(kind)
        return {
          phase: result.phase,
          nodeId: result.nodeId,
          question: result.question,
          options: result.options,
          freeResponse: result.freeResponse,
          draftSummary: result.draftSummary,
        }
      }
      const response = await fetch(`/api/onboarding/${kind}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId, ...body }),
      })
      const data = (await response.json()) as ApiAdvanceResponse
      if (!response.ok) throw new Error(data.error || "advance_failed")
      return data
    },
    [eventId, userId, demo, advanceDemo],
  )

  const callRewrite = useCallback(
    async (kind: "need" | "offer", correction: string) => {
      if (demo) {
        await sleep(DEMO_FAKE_LATENCY_MS)
        return getDemoRewriteSummary(
          kind === "need" ? NEED_DEMO_SCRIPT : OFFER_DEMO_SCRIPT,
        )
      }
      const response = await fetch(`/api/onboarding/${kind}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId, correction }),
      })
      const data = (await response.json()) as ApiRewriteResponse
      if (!response.ok) throw new Error(data.error || "rewrite_failed")
      return data.draftSummary || ""
    },
    [eventId, userId, demo],
  )

  const callConfirm = useCallback(
    async (kind: "need" | "offer") => {
      if (demo) {
        await sleep(DEMO_FAKE_LATENCY_MS)
        return
      }
      const response = await fetch(`/api/onboarding/${kind}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || "confirm_failed")
    },
    [eventId, userId, demo],
  )

  const callBack = useCallback(
    async (kind: "need" | "offer"): Promise<ApiAdvanceResponse> => {
      if (demo) {
        const result = await backDemo(kind)
        return {
          phase: result.phase,
          nodeId: result.nodeId,
          question: result.question,
          options: result.options,
          freeResponse: result.freeResponse,
          draftSummary: result.draftSummary,
        }
      }
      const response = await fetch(`/api/onboarding/${kind}/back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId }),
      })
      const data = (await response.json()) as ApiAdvanceResponse
      if (!response.ok) throw new Error(data.error || "back_failed")
      return data
    },
    [eventId, userId, demo, backDemo],
  )

  // ---- State transitions ----
  const applyAdvanceResponse = useCallback(
    (data: ApiAdvanceResponse, kind: "need" | "offer") => {
      if (data.phase === "question") {
        setPhase("question")
        setCurrentNodeId(data.nodeId)
        setQuestion(data.question || "")
        setOptions(data.options || null)
        setIsFreeResponse(!!data.freeResponse)
        setFreeText("")
        setOtherMode(false)
        setSelectedOptionId(null)
        setOfferMultiSelectedIds([])
        setOfferOtherInline("")
        setStepIndex((prev) => prev + 1)
        setTotalStepsEstimate((prev) => Math.max(prev, stepIndex + 3))
      } else if (data.phase === "confirm") {
        setDraftSummary(data.draftSummary || "")
        setPhase(kind === "need" ? "confirm_need" : "confirm_offer")
      } else {
        setPhase("done")
      }
    },
    [stepIndex],
  )

  // Going back is similar to advancing but should *decrement* the step counter
  // so the progress bar mirrors the user's actual position in the flow.
  const applyBackResponse = useCallback(
    (data: ApiAdvanceResponse) => {
      if (data.phase !== "question") return
      setPhase("question")
      setCurrentNodeId(data.nodeId)
      setQuestion(data.question || "")
      setOptions(data.options || null)
      setIsFreeResponse(!!data.freeResponse)
      setFreeText("")
      setOtherMode(false)
      setSelectedOptionId(null)
      setOfferMultiSelectedIds([])
      setOfferOtherInline("")
      setStepIndex((prev) => Math.max(1, prev - 1))
    },
    [],
  )

  const beginNeedFlow = useCallback(async () => {
    try {
      const data = await callAdvance("need", { currentNodeId: null, answer: null })
      applyAdvanceResponse(data, "need")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong")
      setPhase("error")
    }
  }, [applyAdvanceResponse, callAdvance])

  const beginOfferFlow = useCallback(async () => {
    try {
      setOfferStarted(true)
      setPhase("loading")
      setStepIndex(0)
      setTotalStepsEstimate(4)
      demoOfferIndexRef.current = 0
      const data = await callAdvance("offer", { currentNodeId: null, answer: null })
      applyAdvanceResponse(data, "offer")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong")
      setPhase("error")
    }
  }, [applyAdvanceResponse, callAdvance])

  // Initial load.
  useEffect(() => {
    if (hasFetchedEntryRef.current) return
    hasFetchedEntryRef.current = true
    beginNeedFlow()
  }, [beginNeedFlow])

  const currentKind: "need" | "offer" = offerStarted ? "offer" : "need"

  // ---- Submit handlers ----
  const submitAnswer = async (answer: string) => {
    if (!answer.trim()) return
    setIsSubmitting(true)
    haptics.light()
    try {
      const data = await callAdvance(currentKind, { currentNodeId, answer })
      applyAdvanceResponse(data, currentKind)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong")
      setPhase("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const onPickOption = (option: OptionShape) => {
    if (isSubmitting) return
    // Offer questions use multi-select + Continue (handled separately).
    if (offerStarted) return
    if (option.label.trim().toLowerCase() === "other") {
      setOtherMode(true)
      setFreeText("")
      return
    }
    setSelectedOptionId(option.id)
    submitAnswer(option.label)
  }

  const toggleOfferMultiOption = (opt: OptionShape) => {
    if (isSubmitting) return
    haptics.light()
    setOfferMultiSelectedIds((prev) => {
      const has = prev.includes(opt.id)
      if (has) {
        if (optionIsOther(opt)) setOfferOtherInline("")
        return prev.filter((id) => id !== opt.id)
      }
      return [...prev, opt.id]
    })
  }

  const onGoBack = async () => {
    if (isSubmitting) return
    // In "other" mode, "back" cancels the free-text entry and returns to options.
    if (otherMode) {
      setOtherMode(false)
      setFreeText("")
      return
    }
    // Otherwise go back to the previous question via the server (or demo script).
    if (stepIndex <= 1) return
    setIsSubmitting(true)
    haptics.light()
    try {
      const data = await callBack(currentKind)
      applyBackResponse(data)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong")
      setPhase("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSubmitFreeResponse = () => {
    const v = freeText.trim()
    if (!v) return
    submitAnswer(v)
  }

  const onSubmitOtherText = () => {
    const v = freeText.trim()
    if (!v) return
    submitAnswer(`Other: ${v}`)
  }

  const onConfirmSummary = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      if (phase === "confirm_need") {
        await callConfirm("need")
        await beginOfferFlow()
      } else if (phase === "confirm_offer") {
        await callConfirm("offer")
        setPhase("done")
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong")
      setPhase("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const onRequestTweak = () => {
    setTweakText("")
    setPhase(phase === "confirm_need" ? "tweak_need" : "tweak_offer")
  }

  const onSubmitTweak = async () => {
    const v = tweakText.trim()
    if (!v || isSubmitting) return
    setIsSubmitting(true)
    try {
      const kind = phase === "tweak_need" ? "need" : "offer"
      const revised = await callRewrite(kind, v)
      setDraftSummary(revised)
      setPhase(kind === "need" ? "confirm_need" : "confirm_offer")
      setTweakText("")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong")
      setPhase("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  // When done, redirect after short delay.
  useEffect(() => {
    if (phase !== "done") return
    const t = window.setTimeout(() => {
      onComplete()
    }, 1200)
    return () => window.clearTimeout(t)
  }, [phase, onComplete])

  // ---- Rendering ----
  const progress = useMemo(() => {
    if (phase === "done") return 100
    if (phase === "confirm_offer" || phase === "tweak_offer") return 92
    if (phase === "confirm_need" || phase === "tweak_need") return 55
    if (offerStarted) return 60 + Math.min(25, stepIndex * 10)
    return Math.min(50, (stepIndex / Math.max(1, totalStepsEstimate)) * 50)
  }, [phase, stepIndex, totalStepsEstimate, offerStarted])

  if (phase === "loading") {
    return (
      <CardShell title={eventName ? `Let's get you set up for ${eventName}.` : "Let's get you set up."} progress={4}>
        <div className="flex flex-col items-center gap-4 py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-muted-foreground font-body text-sm">Loading your first question…</p>
        </div>
      </CardShell>
    )
  }

  if (phase === "error") {
    return (
      <CardShell title="Something went wrong." progress={progress}>
        <p className="text-sm text-muted-foreground font-body">{errorMessage || "Please try again."}</p>
        <GradientButton
          onClick={() => {
            setErrorMessage(null)
            hasFetchedEntryRef.current = false
            setOfferStarted(false)
            setStepIndex(0)
            demoNeedIndexRef.current = 0
            demoOfferIndexRef.current = 0
            beginNeedFlow()
          }}
          className="mt-4 h-12 px-6 rounded-2xl"
        >
          Try again
        </GradientButton>
      </CardShell>
    )
  }

  if (phase === "done") {
    return (
      <CardShell title="You're all set." subtitle="Finding the best people for you now." progress={100}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </CardShell>
    )
  }

  if (phase === "confirm_need" || phase === "confirm_offer") {
    const isNeed = phase === "confirm_need"
    const title = isNeed
      ? "Here's what I heard. Does this match what you're looking for?"
      : "Is this the skillset we can assume about you based on your answers?"
    return (
      <CardShell title={title} progress={progress}>
        <div className="rounded-concave border border-border bg-white/60 p-4 md:p-5">
          <p className="text-sm md:text-base text-foreground font-body leading-relaxed whitespace-pre-wrap">
            {draftSummary}
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-2">
          <GradientButton
            onClick={onConfirmSummary}
            disabled={isSubmitting}
            className="w-full h-12 md:h-14 rounded-2xl bg-primary text-white"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center justify-center">
                Yes, that's right
                <ArrowRight className="h-4 w-4 ml-2" />
              </span>
            )}
          </GradientButton>
          <GradientButton
            variant="outline"
            onClick={onRequestTweak}
            disabled={isSubmitting}
            className="w-full h-12 md:h-14 rounded-2xl border-2 border-primary"
          >
            Not quite — let me tweak it
          </GradientButton>
        </div>
      </CardShell>
    )
  }

  if (phase === "tweak_need" || phase === "tweak_offer") {
    return (
      <CardShell title="What would you like to change?" progress={progress}>
        <Textarea
          value={tweakText}
          onChange={(e) => {
            setTweakText(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSubmitTweak()
            }
          }}
          placeholder="e.g. I'm actually more focused on partnerships, not hiring."
          className="mt-1 resize-none overflow-hidden"
          rows={3}
          style={{ minHeight: "80px", maxHeight: "200px" }}
          autoFocus
        />
        <div className="flex gap-3 pt-2">
          <GradientButton
            variant="outline"
            onClick={() => setPhase(phase === "tweak_need" ? "confirm_need" : "confirm_offer")}
            disabled={isSubmitting}
            className="h-12 px-5 rounded-2xl border-2 border-primary"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </GradientButton>
          <GradientButton
            onClick={onSubmitTweak}
            disabled={isSubmitting || !tweakText.trim()}
            className="flex-1 h-12 rounded-2xl bg-primary text-white"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating…
              </span>
            ) : (
              "Update summary"
            )}
          </GradientButton>
        </div>
      </CardShell>
    )
  }

  // phase === "question"
  // Back is allowed from any question after the first one. In "other" mode the
  // existing inline back button cancels the free-text entry; we still surface the
  // global back button so users can step back through earlier questions too.
  const canStepBack = stepIndex > 1
  const isOfferMcQuestion = offerStarted && !isFreeResponse

  const backButton = (
    <GradientButton
      variant="outline"
      onClick={onGoBack}
      disabled={isSubmitting || (!otherMode && !canStepBack)}
      className="h-12 md:h-16 px-4 md:px-5 rounded-2xl border-2 border-primary shrink-0"
    >
      <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
    </GradientButton>
  )

  return (
    <CardShell
      title={question || "One quick question…"}
      subtitle={isOfferMcQuestion ? "Select all that apply." : null}
      progress={progress}
      footer={
        isFreeResponse ? (
          <div className="flex gap-3 items-center">
            {backButton}
            <GradientButton
              onClick={onSubmitFreeResponse}
              disabled={isSubmitting || !freeText.trim()}
              className="flex-1 h-12 md:h-16 rounded-2xl text-base md:text-lg font-body bg-primary text-white"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </span>
              )}
            </GradientButton>
          </div>
        ) : isOfferMcQuestion ? (
          <div className="flex gap-3 items-center">
            {backButton}
            <GradientButton
              onClick={() => {
                if (!composedOfferAnswer) return
                void submitAnswer(composedOfferAnswer)
              }}
              disabled={isSubmitting || !composedOfferAnswer}
              className="flex-1 h-12 md:h-16 rounded-2xl text-base md:text-lg font-body bg-primary text-white"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </span>
              )}
            </GradientButton>
          </div>
        ) : otherMode ? (
          <div className="flex gap-3 items-center">
            <GradientButton
              variant="outline"
              onClick={() => {
                setOtherMode(false)
                setFreeText("")
              }}
              disabled={isSubmitting}
              className="h-12 px-5 rounded-2xl border-2 border-primary"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </GradientButton>
            <GradientButton
              onClick={onSubmitOtherText}
              disabled={isSubmitting || !freeText.trim()}
              className="flex-1 h-12 md:h-16 rounded-2xl text-base md:text-lg font-body bg-primary text-white"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </span>
              )}
            </GradientButton>
          </div>
        ) : (
          <div className="flex justify-start">{backButton}</div>
        )
      }
    >
      {isFreeResponse ? (
        <Textarea
          value={freeText}
          onChange={(e) => {
            setFreeText(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = Math.min(e.target.scrollHeight, 240) + "px"
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSubmitFreeResponse()
            }
          }}
          placeholder="Type your answer here…"
          className="mt-1 resize-none overflow-hidden"
          rows={3}
          style={{ minHeight: "80px", maxHeight: "240px" }}
          autoFocus
        />
      ) : isOfferMcQuestion ? (
        <div className="space-y-2 md:space-y-3">
          {(options || []).map((opt) => {
            const isChecked = offerMultiSelectedIds.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                role="checkbox"
                aria-checked={isChecked}
                onClick={() => toggleOfferMultiOption(opt)}
                disabled={isSubmitting}
                className={`w-full p-3 md:p-4 rounded-concave border transition-colors disabled:opacity-60 flex items-center justify-between gap-3 ${
                  isChecked
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary hover:bg-primary/5 bg-[#EDEBE6]"
                }`}
              >
                <span className="text-sm md:text-base text-foreground font-body text-left flex-1">
                  {opt.label}
                </span>
                <span
                  className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-[4px] border-2 flex items-center justify-center transition-colors ${
                    isChecked ? "border-primary bg-primary text-white" : "border-border bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {isChecked ? <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[3]" /> : null}
                </span>
              </button>
            )
          })}
          {(() => {
            const otherOpt = (options || []).find(optionIsOther)
            if (!otherOpt || !offerMultiSelectedIds.includes(otherOpt.id)) return null
            return (
              <Input
                value={offerOtherInline}
                onChange={(e) => setOfferOtherInline(e.target.value)}
                placeholder="Describe what else you can offer…"
                className="mt-1 h-11 md:h-12 rounded-concave border-border bg-white/80 text-sm md:text-base"
                autoFocus
              />
            )
          })()}
        </div>
      ) : otherMode ? (
        <Textarea
          value={freeText}
          onChange={(e) => {
            setFreeText(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = Math.min(e.target.scrollHeight, 240) + "px"
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSubmitOtherText()
            }
          }}
          placeholder="Tell us a bit more…"
          className="mt-1 resize-none overflow-hidden"
          rows={3}
          style={{ minHeight: "80px", maxHeight: "240px" }}
          autoFocus
        />
      ) : (
        <div className="space-y-2 md:space-y-3">
          {(options || []).map((opt) => {
            const isSelected = selectedOptionId === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPickOption(opt)}
                disabled={isSubmitting}
                className={`w-full p-3 md:p-4 rounded-concave border transition-colors disabled:opacity-60 flex items-center justify-between gap-3 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary hover:bg-primary/5 bg-[#EDEBE6]"
                }`}
                aria-pressed={isSelected}
              >
                <span className="text-sm md:text-base text-foreground font-body text-left flex-1">
                  {opt.label}
                </span>
                <span
                  className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? "border-primary bg-primary" : "border-border bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected ? (
                    <span className="block w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-white" />
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </CardShell>
  )
}

export default EventBranchingOnboarding
