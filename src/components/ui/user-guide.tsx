"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import confetti from "canvas-confetti"
import { haptics } from "@/lib/haptics"

export interface GuideStep {
  id: string
  targetSelector: string
  title: string
  subtext: string
  position?: "top" | "bottom" | "left" | "right" | "auto"
  pointerDirection?: "up" | "down" | "left" | "right"
  highlightShape?: "rounded" | "pill" | "circle"
}

interface UserGuideProps {
  steps: GuideStep[]
  onComplete?: () => void
  onSkip?: () => void
  storageKey?: string
}

export function UserGuide({ 
  steps, 
  onComplete, 
  onSkip,
  storageKey = "intro-homepage-guide-completed"
}: UserGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null)
  const [actualPosition, setActualPosition] = useState<"top" | "bottom" | "left" | "right">("bottom")
  const [isVisible, setIsVisible] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const currentStepData = steps[currentStep]

  // Check if guide should show
  useEffect(() => {
    if (typeof window === "undefined") return
    
    const hasCompleted = localStorage.getItem(storageKey) === "true"
    if (!hasCompleted) {
      setIsVisible(true)
    }
  }, [storageKey])

  // Calculate target element position and tooltip placement
  useEffect(() => {
    if (!isVisible || !currentStepData) return

    const updatePosition = () => {
      const element = document.querySelector(currentStepData.targetSelector)
      if (!element) {
        // Element not found, skip to next step or close
        if (currentStep < steps.length - 1) {
          setCurrentStep(currentStep + 1)
        } else {
          handleComplete()
        }
        return
      }

      const rect = element.getBoundingClientRect()
      setTargetRect(rect)

      // Calculate tooltip position based on step position preference
      // Since overlay is fixed, use viewport coordinates (no scroll offset needed)
      const preferredPosition = currentStepData.position || "auto"
      const tooltipHeight = 200 // Approximate tooltip height (increased for safety)
      const padding = 8 // Highlight padding
      const arrowHeight = 12
      const spacing = 8 // Additional spacing between highlight and tooltip
      
      let top = 0
      let left = 0
      let actualPosition = preferredPosition

      // Check available space (need room for tooltip + spacing)
      const spaceBelow = window.innerHeight - rect.bottom - padding - spacing
      const spaceAbove = rect.top - padding - spacing

      if (preferredPosition === "auto" || preferredPosition === "bottom" || preferredPosition === "top") {
        // Determine best vertical position based on available space
        if (spaceBelow >= tooltipHeight + spacing) {
          actualPosition = "bottom"
        } else if (spaceAbove >= tooltipHeight + spacing) {
          actualPosition = "top"
        } else {
          // Neither fits well - use whichever has more space
          actualPosition = spaceBelow >= spaceAbove ? "bottom" : "top"
        }
      }

      if (actualPosition === "bottom") {
        // Position below element: element bottom + highlight padding + spacing + arrow height
        top = rect.bottom + padding + spacing + arrowHeight
        left = rect.left + rect.width / 2
      } else if (actualPosition === "top") {
        // Position above element: element top - highlight padding - spacing - arrow height - tooltip height
        top = rect.top - padding - spacing - arrowHeight - tooltipHeight
        left = rect.left + rect.width / 2
      } else if (actualPosition === "right") {
        top = rect.top + rect.height / 2
        left = rect.right + padding + spacing + arrowHeight
      } else if (actualPosition === "left") {
        top = rect.top + rect.height / 2
        left = rect.left - padding - spacing - arrowHeight
      }

      setTooltipPosition({ top, left })
      setActualPosition(actualPosition as "top" | "bottom" | "left" | "right")
    }

    // Initial calculation
    updatePosition()

    // Recalculate on scroll and resize
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)

    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [isVisible, currentStep, currentStepData, steps.length])

  // Scroll element into view if needed
  useEffect(() => {
    if (!isVisible || !currentStepData || !targetRect) return

    const element = document.querySelector(currentStepData.targetSelector)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
    }
  }, [isVisible, currentStep, currentStepData, targetRect])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }, [currentStep, steps.length])

  const handleSkip = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true")
    }
    setIsVisible(false)
    onSkip?.()
  }, [storageKey, onSkip])

  const handleComplete = useCallback(() => {
    // Trigger haptic feedback (celebratory pattern)
    haptics.celebration()

    // Trigger confetti celebration
    const duration = 3000
    const animationEnd = Date.now() + duration
    const defaults = { 
      startVelocity: 30, 
      spread: 360, 
      ticks: 60, 
      zIndex: 10000,
      colors: ['#72A557', '#99424E', '#EDEBE6'] // Green, Plum, Cream
    }

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    const interval: ReturnType<typeof setInterval> = setInterval(function() {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 50 * (timeLeft / duration)
      
      // Fire confetti from multiple origins
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      })
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      })
    }, 250)

    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true")
    }
    setIsVisible(false)
    onComplete?.()
  }, [storageKey, onComplete])

  if (!isVisible || !currentStepData || !targetRect || !tooltipPosition) {
    return null
  }

  // Calculate viewport dimensions
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0

  // Determine pointer direction based on actual position (may have flipped)
  const pointerDir = currentStepData.pointerDirection || 
    (actualPosition === "top" ? "down" : 
     actualPosition === "bottom" ? "up" :
     actualPosition === "left" ? "right" : "left")

  // Add padding around highlighted element
  const padding = 8
  const highlightTop = Math.max(0, targetRect.top - padding)
  const highlightLeft = Math.max(0, targetRect.left - padding)
  const highlightWidth = targetRect.width + padding * 2
  const highlightHeight = targetRect.height + padding * 2

  // Calculate tooltip offset to center it
  const tooltipWidth = 320 // Approximate tooltip width
  const tooltipLeft = tooltipPosition.left
  // Ensure tooltip stays within viewport bounds (use same value as positioning calculation)
  const tooltipHeight = 200
  const tooltipTop = Math.max(16, Math.min(tooltipPosition.top, viewportHeight - tooltipHeight - 16))

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999]"
      aria-label="User guide overlay"
      role="dialog"
      aria-modal="true"
    >
      {/* Dark overlay with spotlight cutout using multiple divs */}
      {/* Top overlay */}
      {highlightTop > 0 && (
        <div
          className="absolute top-0 left-0 right-0 bg-black/70"
          style={{ height: `${highlightTop}px` }}
          onClick={handleNext}
        />
      )}
      
      {/* Bottom overlay */}
      {highlightTop + highlightHeight < viewportHeight && (
        <div
          className="absolute left-0 right-0 bottom-0 bg-black/70"
          style={{ height: `${viewportHeight - (highlightTop + highlightHeight)}px` }}
          onClick={handleNext}
        />
      )}
      
      {/* Left overlay */}
      {highlightLeft > 0 && (
        <div
          className="absolute bg-black/70"
          style={{
            top: `${Math.max(0, highlightTop)}px`,
            left: 0,
            width: `${highlightLeft}px`,
            height: `${highlightHeight}px`,
          }}
          onClick={handleNext}
        />
      )}
      
      {/* Right overlay */}
      {highlightLeft + highlightWidth < viewportWidth && (
        <div
          className="absolute bg-black/70"
          style={{
            top: `${Math.max(0, highlightTop)}px`,
            left: `${highlightLeft + highlightWidth}px`,
            width: `${viewportWidth - (highlightLeft + highlightWidth)}px`,
            height: `${highlightHeight}px`,
          }}
          onClick={handleNext}
        />
      )}

      {/* Rounded border highlight around the target element */}
      <div
        className={cn(
          "absolute pointer-events-none border-2 border-[#EDEBE6]",
          currentStepData.highlightShape === "circle" && "rounded-2xl",
          currentStepData.highlightShape === "pill" && "rounded-2xl",
          (!currentStepData.highlightShape || currentStepData.highlightShape === "rounded") && "rounded-[20px]"
        )}
        style={{
          top: `${highlightTop}px`,
          left: `${highlightLeft}px`,
          width: `${highlightWidth}px`,
          height: `${highlightHeight}px`,
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute double-border rounded-concave p-6 shadow-elevation max-w-sm z-[10000]"
        style={{
          top: `${tooltipTop}px`,
          left: `${Math.max(16, Math.min(tooltipLeft - tooltipWidth / 2, viewportWidth - tooltipWidth - 16))}px`,
          backgroundColor: '#EDEBE6', // Solid cream background for readability
        }}
      >
        {/* Pointer arrow */}
        <div
          className={cn(
            "absolute w-0 h-0",
            pointerDir === "up" && "bottom-full left-1/2 -translate-x-1/2 border-l-[12px] border-r-[12px] border-b-[12px] border-l-transparent border-r-transparent",
            pointerDir === "down" && "top-full left-1/2 -translate-x-1/2 border-l-[12px] border-r-[12px] border-t-[12px] border-l-transparent border-r-transparent",
            pointerDir === "left" && "right-full top-1/2 -translate-y-1/2 border-t-[12px] border-b-[12px] border-l-[12px] border-t-transparent border-b-transparent",
            pointerDir === "right" && "left-full top-1/2 -translate-y-1/2 border-t-[12px] border-b-[12px] border-r-[12px] border-t-transparent border-b-transparent"
          )}
          style={{
            [pointerDir === "up" ? "borderBottomColor" : pointerDir === "down" ? "borderTopColor" : pointerDir === "left" ? "borderLeftColor" : "borderRightColor"]: "#EDEBE6"
          }}
        />

        {/* Title */}
        <h3 className="text-lg font-semibold mb-2" style={{ color: "#99424E" }}>
          {currentStepData.title}
        </h3>

        {/* Subtext */}
        <p className="text-sm text-muted-foreground mb-4">
          {currentStepData.subtext}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {/* Skip all button */}
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip all
          </button>

          {/* Next button with step indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {currentStep + 1}/{steps.length}
            </span>
            <Button
              onClick={handleNext}
              className="bg-primary text-primary-foreground hover:opacity-90"
            >
              {currentStep === steps.length - 1 ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Helper function to restart the guide
export function restartGuide(storageKey: string = "intro-homepage-guide-completed") {
  if (typeof window !== "undefined") {
    localStorage.removeItem(storageKey)
    window.location.reload()
  }
}

