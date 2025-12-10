import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// Debug logging (can be disabled in production)
const DEBUG_AVATAR = process.env.NODE_ENV === 'development'

interface PresenceAvatarProps {
  src?: string
  alt?: string
  fallback?: string
  isPresent?: boolean
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10", 
  lg: "h-12 w-12",
  xl: "h-16 w-16"
}

const presenceDotSizes = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-3 w-3",
  xl: "h-4 w-4"
}

export function PresenceAvatar({ 
  src, 
  alt, 
  fallback, 
  isPresent = false, 
  size = "md",
  className 
}: PresenceAvatarProps) {
  // Prioritize profile picture URL: always use it if available, even if it might fail to load
  // Radix Avatar will automatically show fallback only if image fails to load or src is invalid
  // This ensures we always try to display the profile picture from Supabase first
  let validSrc: string | undefined = undefined
  
  if (src) {
    // Ensure src is a string and not a string representation of null/undefined
    if (typeof src === 'string') {
      const trimmed = src.trim()
      if (trimmed && trimmed !== 'null' && trimmed !== 'undefined' && trimmed.length > 0) {
        validSrc = trimmed
      } else if (DEBUG_AVATAR) {
        console.log('[PresenceAvatar] Filtered out invalid src:', { src, trimmed, reason: 'empty or null string' })
      }
    } else if (DEBUG_AVATAR) {
      console.log('[PresenceAvatar] src is not a string:', { src, type: typeof src })
    }
  } else if (DEBUG_AVATAR) {
    console.log('[PresenceAvatar] No src provided, using fallback:', { fallback })
  }
  
  // Log when validSrc is set (for debugging)
  React.useEffect(() => {
    if (DEBUG_AVATAR && validSrc) {
      console.log('[PresenceAvatar] Using image URL:', { validSrc, fallback })
    }
  }, [validSrc, fallback])
  
  return (
    <div className={cn("relative", className)}>
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={validSrc} alt={alt} />
        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
          {fallback}
        </AvatarFallback>
      </Avatar>
      {isPresent && (
        <div 
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full bg-primary border-2 border-background",
            presenceDotSizes[size]
          )}
        />
      )}
    </div>
  )
}
