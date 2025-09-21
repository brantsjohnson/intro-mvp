import * as React from "react"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { cn } from "@/lib/utils"

interface ProfileHeaderProps {
  name: string
  jobTitle: string
  company?: string
  location?: string
  avatarUrl?: string
  isPresent?: boolean
  className?: string
}

export function ProfileHeader({ 
  name, 
  jobTitle, 
  company,
  location,
  avatarUrl, 
  isPresent = false,
  className 
}: ProfileHeaderProps) {
  return (
    <div className={cn("flex items-start space-x-4", className)}>
      <PresenceAvatar
        src={avatarUrl}
        fallback={name.split(' ').map(n => n[0]).join('')}
        isPresent={isPresent}
        size="lg"
      />
      
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          {name}
        </h1>
        <p className="text-lg text-muted-foreground mb-1">
          {jobTitle}
          {company && ` at ${company}`}
        </p>
        {location && (
          <p className="text-sm text-muted-foreground">
            {location}
          </p>
        )}
      </div>
    </div>
  )
}
