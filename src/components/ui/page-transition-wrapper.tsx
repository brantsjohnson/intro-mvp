"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { setupScrollAnimations } from "@/lib/animations"

export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    // Initialize scroll animations on mount and route changes
    setupScrollAnimations()
  }, [pathname])

  return <div className="animate-dissolve-in">{children}</div>
}

