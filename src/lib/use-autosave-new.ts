"use client"

import { useEffect, useRef } from "react"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"

interface AutoSaveData {
  firstName?: string
  lastName?: string
  mbti?: string
  enneagram?: string
  selectedHobbies?: number[]
  hobbyDetails?: Record<number, string>
  customHobbies?: Array<{ id: string; label: string; details?: string }>
  jobTitle?: string
  company?: string
  careerGoals?: string
  expertiseTags?: string[]
  customExpertiseTags?: string[]
  networkingGoals?: string[]
  networkingGoalDetails?: Record<string, string>
  customNetworkingGoal?: string
}

interface UseAutoSaveOptions {
  userId: string | null
  user?: any
  data: AutoSaveData
  enabled?: boolean
  debounceMs?: number
}

// Helper function to build hobbies array from all hobby data
function buildHobbiesArray(
  selectedHobbies: number[] = [],
  hobbyDetails: Record<number, string> = {},
  customHobbies: Array<{ id: string; label: string; details?: string }> = [],
  allHobbies: Array<{ id: number; label: string }> = []
): string[] {
  const hobbies: string[] = []
  
  // Add selected hobbies with details
  selectedHobbies.forEach(hobbyId => {
    const hobby = allHobbies.find(h => h.id === hobbyId)
    if (hobby) {
      const details = hobbyDetails[hobbyId]
      if (details && details.trim()) {
        hobbies.push(`${hobby.label}: ${details.trim()}`)
      } else {
        hobbies.push(hobby.label)
      }
    }
  })
  
  // Add custom hobbies with details
  customHobbies.forEach(customHobby => {
    if (customHobby.details && customHobby.details.trim()) {
      hobbies.push(`${customHobby.label}: ${customHobby.details.trim()}`)
    } else {
      hobbies.push(customHobby.label)
    }
  })
  
  return hobbies
}

export function useAutoSave({ userId, user, data, enabled = true, debounceMs = 1000 }: UseAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<string>("")
  const supabase = createClientComponentClient()

  useEffect(() => {
    if (!enabled || !userId) return

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Create a hash of the current data to avoid unnecessary saves
    const currentDataHash = JSON.stringify(data)
    if (currentDataHash === lastSavedRef.current) return

    // Set new timeout
    timeoutRef.current = setTimeout(async () => {
      try {
        // Build hobbies array from all hobby data
        const hobbiesArray = buildHobbiesArray(
          data.selectedHobbies,
          data.hobbyDetails,
          data.customHobbies
        )

        // Build expertise array from all expertise data
        const expertiseArray = [
          ...(data.expertiseTags || []),
          ...(data.customExpertiseTags || [])
        ]

        // Save profile data
        const { error: profileError } = await (supabase as any)
          .from("profiles")
          .upsert({
            id: userId,
            first_name: data.firstName || "",
            last_name: data.lastName || "",
            email: user?.email || "", // Use user's email from auth
            mbti: data.mbti || null,
            enneagram: data.enneagram || null,
            job_title: data.jobTitle || null,
            company: data.company || null,
            career_goals: data.careerGoals || null,
            networking_goals: data.customNetworkingGoal?.trim() 
              ? [...(data.networkingGoals || []), data.customNetworkingGoal.trim()]
              : data.networkingGoals || [],
            hobbies: hobbiesArray,
            expertise_tags: expertiseArray
          })

        if (profileError) {
          console.error("Profile auto-save error:", profileError)
          return
        }

        // All hobby and expertise data is now stored in the profiles table
        // No need for separate table operations

        lastSavedRef.current = currentDataHash
      } catch (error) {
        console.error("Auto-save error:", error)
        // Don't show toast for auto-save errors to avoid being annoying
      }
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [userId, data, enabled, debounceMs, supabase])

  return {
    isSaving: false, // We don't track saving state for auto-save
    save: async () => {
      // Manual save trigger - could be implemented if needed
      console.log("Manual save not implemented for auto-save hook")
    }
  }
}
