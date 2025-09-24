"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface PersonalitySelectProps {
  value: string
  onChange: (value: string) => void
  type: "mbti" | "enneagram"
  className?: string
}

const mbtiTypes = [
  { value: "ISTJ", label: "ISTJ – Logistician" },
  { value: "ISFJ", label: "ISFJ – Defender" },
  { value: "INFJ", label: "INFJ – Advocate" },
  { value: "INTJ", label: "INTJ – Architect" },
  { value: "ISTP", label: "ISTP – Virtuoso" },
  { value: "ISFP", label: "ISFP – Adventurer" },
  { value: "INFP", label: "INFP – Mediator" },
  { value: "INTP", label: "INTP – Logician" },
  { value: "ESTP", label: "ESTP – Entrepreneur" },
  { value: "ESFP", label: "ESFP – Entertainer" },
  { value: "ENFP", label: "ENFP – Campaigner" },
  { value: "ENTP", label: "ENTP – Debater" },
  { value: "ESTJ", label: "ESTJ – Executive" },
  { value: "ESFJ", label: "ESFJ – Consul" },
  { value: "ENFJ", label: "ENFJ – Protagonist" },
  { value: "ENTJ", label: "ENTJ – Commander" }
]

const enneagramTypes = [
  { value: "1", label: "1 - Reformer" },
  { value: "2", label: "2 - Helper" },
  { value: "3", label: "3 - Achiever" },
  { value: "4", label: "4 - Individualist" },
  { value: "5", label: "5 - Investigator" },
  { value: "6", label: "6 - Loyalist" },
  { value: "7", label: "7 - Enthusiast" },
  { value: "8", label: "8 - Challenger" },
  { value: "9", label: "9 - Peacemaker" }
]

export function PersonalitySelect({ value, onChange, type, className }: PersonalitySelectProps) {
  const options = type === "mbti" ? mbtiTypes : enneagramTypes
  const placeholder = type === "mbti" ? "e.g., ENFP - Campaigner" : "e.g., 8 - Challenger"
  const label = type === "mbti" ? "Myers-Briggs Type (Optional)" : "Enneagram Type (Optional)"

  return (
    <div className={className}>
      <Label className="text-sm font-medium text-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 rounded-xl">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
