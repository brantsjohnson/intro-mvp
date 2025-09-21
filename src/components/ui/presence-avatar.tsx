import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface PresenceAvatarProps {
  src?: string
  alt?: string
  fallback?: string
  isPresent?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10", 
  lg: "h-12 w-12"
}

const presenceDotSizes = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-3 w-3"
}

export function PresenceAvatar({ 
  src, 
  alt, 
  fallback, 
  isPresent = false, 
  size = "md",
  className 
}: PresenceAvatarProps) {
  return (
    <div className={cn("relative", className)}>
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={src} alt={alt} />
        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
          {fallback}
        </AvatarFallback>
      </Avatar>
      {isPresent && (
        <div 
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full gradient-success border-2 border-background",
            presenceDotSizes[size]
          )}
        />
      )}
    </div>
  )
}
