"use client"

import { usePathname } from "next/navigation"
import { Toaster } from "@/components/ui/sonner"

export function ConditionalToaster() {
  const pathname = usePathname()
  
  // Don't show toaster on auth page
  if (pathname === "/auth") {
    return null
  }
  
  return <Toaster />
}


