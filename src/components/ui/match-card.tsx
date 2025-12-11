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
        "bg-card border-border shadow-elevation cursor-pointer hover:shadow-[0px_4px_6px_rgba(0,0,0,0.2)] transition-shadow",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <PresenceAvatar
            src={avatarUrl || undefined}
            fallback={name.split(' ').map(n => n[0]).join('')}
            isPresent={isPresent}
            size="md"
            className="flex-shrink-0"
          />
          
          <div className="flex-1 min-w-0">
            {/* Name Row */}
            <div className="mb-1">
              <div className="flex flex-col flex-1 min-w-0 sm:flex-row sm:items-center sm:gap-2">
                <h3 className="font-bold text-sm md:text-base text-foreground truncate">
                  {name}
                </h3>
                {jobTitle && (
                  <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">·</span>
                )}
                <span className="text-xs md:text-sm text-muted-foreground truncate">
                  {jobTitle}
                  {company && ` at ${company}`}
                </span>
              </div>
            </div>
            
            {/* Simple summary format */}
            <div className="mb-2">
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {summary}
              </p>
            </div>
          </div>
          
          {/* Arrow vertically centered */}
          <div className="flex items-center flex-shrink-0">
            <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
