"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { sponsorNavPillActive, sponsorNavPillInactive } from "@/lib/sponsor-ui"

export function SponsorHeaderNav() {
  const pathname = usePathname() ?? ""
  const inSponsorPortal = pathname === "/sponsor" || pathname.startsWith("/sponsor/")

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Sponsor portal">
      <Link
        href="/sponsor"
        className={cn(
          inSponsorPortal ? sponsorNavPillActive : sponsorNavPillInactive,
          "inline-flex items-center gap-1.5",
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All sponsor events
      </Link>
      <Link href="/home" className={sponsorNavPillInactive}>
        Back to app
      </Link>
    </nav>
  )
}
