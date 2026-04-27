"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight, Eye, LogOut, Monitor, Sparkles, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemoMode } from "@/lib/demo-mode"

type DemoRole = "attendee" | "organizer" | "sponsor"

interface DemoTarget {
  id: DemoRole
  label: string
  blurb: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  matchers: (path: string) => boolean
}

const TARGETS: DemoTarget[] = [
  {
    id: "attendee",
    label: "Attendee",
    blurb: "Sign-up -> onboarding -> home",
    href: "/auth?demo=1",
    icon: Users,
    matchers: (path) =>
      path.startsWith("/auth") ||
      path.startsWith("/onboarding") ||
      path.startsWith("/home"),
  },
  {
    id: "organizer",
    label: "Organizer",
    blurb: "Organizer dashboard",
    href: "/organizer-demo",
    icon: Monitor,
    matchers: (path) => path.startsWith("/organizer-demo"),
  },
  {
    id: "sponsor",
    label: "Sponsor",
    blurb: "Sponsor recommendations",
    href: "/sponsor/event/organizer-demo?demo=1",
    icon: Sparkles,
    matchers: (path) => path.startsWith("/sponsor"),
  },
]

export function DemoSwitcher() {
  const isDemo = useDemoMode()
  const pathname = usePathname() || ""
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isDemo && isOpen) setIsOpen(false)
  }, [isDemo, isOpen])

  if (!isDemo) return null

  const activeId = TARGETS.find((t) => t.matchers(pathname))?.id ?? null

  const go = (href: string) => {
    setIsOpen(false)
    router.push(href)
  }

  const exitDemo = () => {
    setIsOpen(false)
    router.push("/auth")
  }

  return (
    <div className="fixed right-0 top-1/2 z-[200] -translate-y-1/2 flex items-start">
      {isOpen ? (
        <div className="relative mr-0 w-72 rounded-l-2xl border border-r-0 border-border bg-background/95 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Collapse demo switcher"
            className="absolute -left-7 top-1/2 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-border bg-background/95 text-muted-foreground shadow-lg hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Demo
            </span>
            <p className="text-xs text-muted-foreground">Fictional data</p>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {TARGETS.map((target) => {
              const Icon = target.icon
              const active = activeId === target.id
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => go(target.href)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/60 hover:bg-primary/5",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{target.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {target.blurb}
                    </p>
                  </div>
                </button>
              )
            })}
            <button
              type="button"
              onClick={exitDemo}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Exit demo
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open demo switcher"
          className="flex flex-col items-center gap-1 rounded-l-xl border border-r-0 border-border bg-background/95 px-2 py-3 text-muted-foreground shadow-lg hover:text-foreground"
        >
          <Eye className="h-4 w-4" />
          <span className="text-[10px] font-medium uppercase tracking-wider [writing-mode:vertical-rl] [transform:rotate(180deg)]">
            Demo
          </span>
        </button>
      )}
    </div>
  )
}

export default DemoSwitcher
