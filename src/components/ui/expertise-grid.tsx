import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface Expertise {
  id: number
  label: string
}

interface ExpertiseGridProps {
  expertise: Expertise[]
  selectedExpertise: number[]
  onExpertiseChange: (expertiseId: number, checked: boolean) => void
  mode?: "select" | "display"
  mutualExpertise?: number[]
  theirUniqueExpertise?: number[]
  className?: string
  showOnlySelected?: boolean
}

export function ExpertiseGrid({ 
  expertise, 
  selectedExpertise, 
  onExpertiseChange, 
  mode = "select",
  mutualExpertise = [],
  theirUniqueExpertise = [],
  className,
  showOnlySelected = false
}: ExpertiseGridProps) {
  const isMutual = (expertiseId: number) => mutualExpertise.includes(expertiseId)
  const isTheirUnique = (expertiseId: number) => theirUniqueExpertise.includes(expertiseId)
  const isSelected = (expertiseId: number) => selectedExpertise.includes(expertiseId)

  // Filter expertise based on showOnlySelected prop
  const displayExpertise = showOnlySelected 
    ? expertise.filter(expertise => isSelected(expertise.id))
    : expertise

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {displayExpertise.map((expertise) => {
        const isMutualExpertise = isMutual(expertise.id)
        const isTheirUniqueExpertise = isTheirUnique(expertise.id)
        const isExpertiseSelected = isSelected(expertise.id)
        
        return (
          <div
            key={expertise.id}
            className={cn(
              "flex items-center space-x-2 rounded-xl p-2 transition-colors",
              mode === "display" && isMutualExpertise && "bg-primary/10 border border-primary/20",
              mode === "display" && isTheirUniqueExpertise && "bg-muted/50",
              mode === "display" && !isMutualExpertise && !isTheirUniqueExpertise && "opacity-50"
            )}
          >
            {mode === "select" ? (
              <Checkbox
                id={`expertise-${expertise.id}`}
                checked={isExpertiseSelected}
                onCheckedChange={(checked) => onExpertiseChange(expertise.id, checked as boolean)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            ) : (
              <div className={cn(
                "h-4 w-4 rounded border-2 flex items-center justify-center",
                isMutualExpertise 
                  ? "bg-primary border-primary" 
                  : isTheirUniqueExpertise
                  ? "border-muted-foreground/50"
                  : "border-muted-foreground/30"
              )}>
                {isMutualExpertise && (
                  <div className="h-2 w-2 bg-white rounded-full" />
                )}
              </div>
            )}
            <label
              htmlFor={mode === "select" ? `expertise-${expertise.id}` : undefined}
              className={cn(
                "text-sm font-medium cursor-pointer flex-1",
                mode === "display" && isMutualExpertise && "text-primary",
                mode === "display" && isTheirUniqueExpertise && "text-muted-foreground",
                mode === "display" && !isMutualExpertise && !isTheirUniqueExpertise && "text-muted-foreground/50"
              )}
            >
              {expertise.label}
            </label>
          </div>
        )
      })}
    </div>
  )
}
