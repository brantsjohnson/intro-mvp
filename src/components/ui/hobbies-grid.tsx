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
  className?: string
}

export function HobbiesGrid({ 
  hobbies, 
  selectedHobbies, 
  onHobbyChange, 
  mode = "select",
  mutualHobbies = [],
  className 
}: HobbiesGridProps) {
  const isMutual = (hobbyId: number) => mutualHobbies.includes(hobbyId)
  const isSelected = (hobbyId: number) => selectedHobbies.includes(hobbyId)

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {hobbies.map((hobby) => {
        const isMutualHobby = isMutual(hobby.id)
        const isHobbySelected = isSelected(hobby.id)
        
        return (
          <div
            key={hobby.id}
            className={cn(
              "flex items-center space-x-3 rounded-xl p-3 transition-colors",
              mode === "display" && isMutualHobby && "bg-primary/10 border border-primary/20",
              mode === "display" && !isMutualHobby && "bg-muted/50"
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
                mode === "display" && !isMutualHobby && "text-muted-foreground"
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
