import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface StructuredMatchExplanation {
  connection_type: string
  reason_title: string
  reason_summary: string
  shared_tags: string[]
  helpfulness_bullets: string[]
  suggested_icebreaker: string
}

interface MatchCardProps {
  name: string
  jobTitle: string
  company?: string
  avatarUrl?: string
  matchBases: string[]
  summary: string
  isPresent?: boolean
  onClick: () => void
  className?: string
  structuredExplanation?: StructuredMatchExplanation
  connectionType?: string
}

export function MatchCard({ 
  name, 
  jobTitle, 
  company,
  avatarUrl, 
  matchBases, 
  summary, 
  isPresent = false,
  onClick,
  className,
  structuredExplanation,
  connectionType
}: MatchCardProps) {
  const hasStructuredData = structuredExplanation && structuredExplanation.reason_summary

  return (
    <Card 
      className={cn(
        "bg-card border-border shadow-elevation cursor-pointer hover:shadow-soft transition-shadow",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <PresenceAvatar
            src={avatarUrl}
            fallback={name.split(' ').map(n => n[0]).join('')}
            isPresent={isPresent}
            size="md"
          />
          
          <div className="flex-1 min-w-0">
            {/* Name and Arrow Row */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">
                  {name}
                </h3>
                {jobTitle && (
                  <span className="text-sm text-muted-foreground">·</span>
                )}
                <span className="text-sm text-muted-foreground truncate">
                  {jobTitle}
                  {company && ` at ${company}`}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </div>
            
            {/* Simple summary format */}
            <div className="mb-2 pr-7">
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {summary}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
