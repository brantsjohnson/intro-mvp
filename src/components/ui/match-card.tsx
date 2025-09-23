import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

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
  className 
}: MatchCardProps) {
  const getMatchBasisColor = (basis: string) => {
    switch (basis) {
      case 'career':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'personality':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'interests':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const formatMatchBases = (bases: string[]) => {
    return bases.map(basis => 
      basis.charAt(0).toUpperCase() + basis.slice(1)
    ).join(' / ')
  }

  return (
    <Card 
      className={cn(
        "bg-card border-border shadow-elevation cursor-pointer hover:shadow-lg transition-shadow",
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
              <h3 className="font-medium text-foreground truncate pr-2">
                {name}
              </h3>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </div>
            
            {/* Job Title and Company - Allow wrapping */}
            <div className="mb-2 pr-7">
              <p className="text-sm text-muted-foreground break-words">
                {jobTitle}
                {company && ` at ${company}`}
              </p>
            </div>
            
            {/* Match Badge */}
            <div className="mb-2">
              <span className={cn(
                "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border",
                getMatchBasisColor(matchBases[0])
              )}>
                Matches: {formatMatchBases(matchBases)}
              </span>
            </div>
            
            {/* Summary - Ensure full visibility */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {summary}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
