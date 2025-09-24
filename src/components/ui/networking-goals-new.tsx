"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface NetworkingGoal {
  id: string
  label: string
  description: string
  prompt: string
}

interface NetworkingGoalsNewProps {
  selectedGoals: string[]
  goalDetails: Record<string, string>
  customGoal: string
  onGoalChange: (goalId: string, checked: boolean) => void
  onGoalDetailChange: (goalId: string, detail: string) => void
  onCustomGoalChange: (goal: string) => void
  className?: string
}

const networkingGoals: NetworkingGoal[] = [
  {
    id: "career-mentorship",
    label: "Career Mentorship",
    description: "Guidance from experienced professionals.",
    prompt: "What kind of mentorship are you looking for?"
  },
  {
    id: "business-opportunities",
    label: "Business Opportunities",
    description: "Explore partnerships or collaborations.",
    prompt: "What type of opportunities interest you?"
  },
  {
    id: "clients",
    label: "Clients",
    description: "Find potential customers for your work.",
    prompt: "What type of clients would you like to meet?"
  },
  {
    id: "friends-connections",
    label: "Friends & Connections",
    description: "Meet peers and expand your circle.",
    prompt: "What kinds of people do you want to connect with?"
  }
]

export function NetworkingGoalsNew({
  selectedGoals,
  goalDetails,
  customGoal,
  onGoalChange,
  onGoalDetailChange,
  onCustomGoalChange,
  className
}: NetworkingGoalsNewProps) {
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())

  const handleGoalToggle = (goalId: string, checked: boolean) => {
    onGoalChange(goalId, checked)
    
    if (checked) {
      setExpandedGoals(prev => new Set(prev).add(goalId))
    } else {
      setExpandedGoals(prev => {
        const newSet = new Set(prev)
        newSet.delete(goalId)
        return newSet
      })
      // Clear the detail when unchecked
      onGoalDetailChange(goalId, "")
    }
  }

  const isGoalSelected = (goalId: string) => selectedGoals.includes(goalId)
  const isGoalExpanded = (goalId: string) => expandedGoals.has(goalId)

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main networking goals */}
      <div className="space-y-4">
        {networkingGoals.map((goal) => {
          const isSelected = isGoalSelected(goal.id)
          const isExpanded = isGoalExpanded(goal.id)
          
          return (
            <div key={goal.id} className="space-y-2">
              <div className="flex items-start space-x-3 rounded-xl p-4 transition-colors hover:bg-muted/50">
                <Checkbox
                  id={`goal-${goal.id}`}
                  checked={isSelected}
                  onCheckedChange={(checked) => handleGoalToggle(goal.id, checked as boolean)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary mt-1"
                />
                <div className="flex-1">
                  <label
                    htmlFor={`goal-${goal.id}`}
                    className="text-sm font-medium cursor-pointer block"
                  >
                    {goal.label}
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {goal.description}
                  </p>
                </div>
              </div>
              
              {/* Optional detail input */}
              {isSelected && isExpanded && (
                <div className="ml-8">
                  <Textarea
                    placeholder={goal.prompt}
                    value={goalDetails[goal.id] || ""}
                    onChange={(e) => onGoalDetailChange(goal.id, e.target.value)}
                    className="text-sm h-20 resize-none"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Custom goal section */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">
          Other
        </Label>
        <p className="text-xs text-muted-foreground">
          e.g., Looking to meet fintech founders, local investors, etc.
        </p>
        <Textarea
          value={customGoal}
          onChange={(e) => onCustomGoalChange(e.target.value)}
          placeholder="Tell us what type of people you hope to meet..."
          className="rounded-xl"
          rows={3}
        />
      </div>

      {/* Validation message */}
      {selectedGoals.length === 0 && !customGoal.trim() && (
        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
          Pick at least one goal or tell us your own to continue.
        </div>
      )}
    </div>
  )
}
