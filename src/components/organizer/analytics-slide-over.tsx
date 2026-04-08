"use client"

import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

import { GradientButton } from "@/components/ui/gradient-button"
import { cn } from "@/lib/utils"

export type AnalyticsSlideOverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  children: ReactNode
}

export function AnalyticsSlideOver({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: AnalyticsSlideOverProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close panel"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl",
          "animate-in slide-in-from-right duration-200",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-slide-over-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2
              id="analytics-slide-over-title"
              className="truncate text-base font-semibold leading-tight"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-xs text-muted-foreground leading-snug">
                {subtitle}
              </p>
            ) : null}
          </div>
          <GradientButton
            variant="outline"
            size="icon"
            className="shrink-0"
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </GradientButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  )
}
