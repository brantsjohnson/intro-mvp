import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface Hobby {
  id: number
  label: string
}

interface HobbiesGridProps {
  hobbies: Hobby[]
  selectedHobbies: number[]
  onHobbyChange: (hobbyId: number, checked: boolean) => void
  mode?: "select" | "display"
  mutualHobbies?: number[]
  theirUniqueHobbies?: number[]
  className?: string
  showOnlySelected?: boolean
}

export function HobbiesGrid({ 
  hobbies, 
  selectedHobbies, 
  onHobbyChange, 
  mode = "select",
  mutualHobbies = [],
  theirUniqueHobbies = [],
  className,
  showOnlySelected = false
}: HobbiesGridProps) {
  const isMutual = (hobbyId: number) => mutualHobbies.includes(hobbyId)
  const isTheirUnique = (hobbyId: number) => theirUniqueHobbies.includes(hobbyId)
  const isSelected = (hobbyId: number) => selectedHobbies.includes(hobbyId)

  // Filter hobbies based on showOnlySelected prop
  const displayHobbies = showOnlySelected 
    ? hobbies.filter(hobby => isSelected(hobby.id))
    : hobbies

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {displayHobbies.map((hobby) => {
        const isMutualHobby = isMutual(hobby.id)
        const isTheirUniqueHobby = isTheirUnique(hobby.id)
        const isHobbySelected = isSelected(hobby.id)
        
        return (
          <div
            key={hobby.id}
            className={cn(
              "flex items-center space-x-2 rounded-xl p-2 transition-colors",
              mode === "display" && isMutualHobby && "bg-primary/10 border border-primary/20",
              mode === "display" && isTheirUniqueHobby && "bg-muted/50",
              mode === "display" && !isMutualHobby && !isTheirUniqueHobby && "opacity-50"
            )}
          >
            {mode === "select" ? (
              <Checkbox
                id={`hobby-${hobby.id}`}
                checked={isHobbySelected}
                onCheckedChange={(checked) => onHobbyChange(hobby.id, checked as boolean)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            ) : (
              <div className={cn(
                "h-4 w-4 rounded border-2 flex items-center justify-center",
                isMutualHobby 
                  ? "bg-primary border-primary" 
                  : isTheirUniqueHobby
                  ? "border-muted-foreground/50"
                  : "border-muted-foreground/30"
              )}>
                {isMutualHobby && (
                  <div className="h-2 w-2 bg-white rounded-full" />
                )}
              </div>
            )}
            <label
              htmlFor={mode === "select" ? `hobby-${hobby.id}` : undefined}
              className={cn(
                "text-sm font-medium cursor-pointer flex-1",
                mode === "display" && isMutualHobby && "text-primary",
                mode === "display" && isTheirUniqueHobby && "text-muted-foreground",
                mode === "display" && !isMutualHobby && !isTheirUniqueHobby && "text-muted-foreground/50"
              )}
            >
              {hobby.label}
            </label>
          </div>
        )
      })}
    </div>
  )
}
