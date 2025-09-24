"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Plus, X } from "lucide-react"

interface Hobby {
  id: number
  label: string
}

interface CustomHobby {
  id: string
  label: string
  details?: string
}

interface HobbiesGridNewProps {
  hobbies: Hobby[]
  selectedHobbies: number[]
  customHobbies: CustomHobby[]
  hobbyDetails: Record<number, string>
  onHobbyChange: (hobbyId: number, checked: boolean) => void
  onHobbyDetailsChange: (hobbyId: number, details: string) => void
  onCustomHobbyAdd: (label: string) => void
  onCustomHobbyRemove: (id: string) => void
  onCustomHobbyDetailsChange: (id: string, details: string) => void
  className?: string
}

const hobbyPrompts: Record<string, string> = {
  '🎨 Arts & Music': 'What kind of art or music do you enjoy?',
  '🎭 Comedy': 'What type of comedy do you like?',
  '👔 Entrepreneurship': 'What kind of business interests you?',
  '🍳 Food & Drink': 'What are your favorite foods or drinks?',
  '🎬 Films': 'What genres or types of films do you enjoy?',
  '🎮 Gaming': 'What types of games do you play?',
  '🏞 Outdoors & Travel': 'Outdoors—hikes, camping, national parks?',
  '🐾 Pets & Animals': 'What pets do you have?',
  '👨‍👩‍👧 Family & Parenting': 'Tell us about your family life',
  '🧘 Wellness & Health': 'What wellness activities do you enjoy?'
}

export function HobbiesGridNew({ 
  hobbies, 
  selectedHobbies, 
  customHobbies,
  hobbyDetails,
  onHobbyChange, 
  onHobbyDetailsChange,
  onCustomHobbyAdd,
  onCustomHobbyRemove,
  onCustomHobbyDetailsChange,
  className
}: HobbiesGridNewProps) {
  const [newCustomHobby, setNewCustomHobby] = React.useState("")
  const [showCustomInput, setShowCustomInput] = React.useState(false)

  const isSelected = (hobbyId: number) => selectedHobbies.includes(hobbyId)

  const handleAddCustomHobby = () => {
    if (newCustomHobby.trim()) {
      onCustomHobbyAdd(newCustomHobby.trim())
      setNewCustomHobby("")
      setShowCustomInput(false)
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main hobbies grid */}
      <div className="space-y-3">
        {hobbies.map((hobby) => {
          const isHobbySelected = isSelected(hobby.id)
          const prompt = hobbyPrompts[hobby.label]
          
          return (
            <div key={hobby.id} className="space-y-2">
              <div className="flex items-center space-x-3 rounded-xl p-3 transition-colors hover:bg-muted/50">
                <Checkbox
                  id={`hobby-${hobby.id}`}
                  checked={isHobbySelected}
                  onCheckedChange={(checked) => onHobbyChange(hobby.id, checked as boolean)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label
                  htmlFor={`hobby-${hobby.id}`}
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  {hobby.label}
                </label>
              </div>
              
              {/* Optional details input */}
              {isHobbySelected && prompt && (
                <div className="ml-6">
                  <Input
                    placeholder={prompt}
                    value={hobbyDetails[hobby.id] || ""}
                    onChange={(e) => onHobbyDetailsChange(hobby.id, e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Custom hobbies */}
      {customHobbies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Your Custom Interests</h4>
          <div className="space-y-2">
            {customHobbies.map((hobby) => (
              <div key={hobby.id} className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg">
                <span className="text-sm font-medium flex-1">{hobby.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCustomHobbyRemove(hobby.id)}
                  className="h-6 w-6 p-0 hover:bg-destructive/10"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add custom hobby */}
      {!showCustomInput ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCustomInput(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add another hobby
        </Button>
      ) : (
        <div className="flex space-x-2">
          <Input
            placeholder="Add custom hobby"
            value={newCustomHobby}
            onChange={(e) => setNewCustomHobby(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddCustomHobby()
              } else if (e.key === 'Escape') {
                setShowCustomInput(false)
                setNewCustomHobby("")
              }
            }}
            className="flex-1"
            autoFocus
          />
          <Button onClick={handleAddCustomHobby} size="sm">
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
