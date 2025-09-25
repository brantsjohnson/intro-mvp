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
  user?: any // User object from auth
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
            what_do_you_do: data.careerGoals || null,
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

        // Save hobbies
        if (data.selectedHobbies) {
          // First, remove existing hobbies
          await supabase
            .from("profile_hobbies")
            .delete()
            .eq("user_id", userId)

          // Then add new ones
          if (data.selectedHobbies.length > 0) {
            const hobbyInserts = data.selectedHobbies.map(hobbyId => ({
              user_id: userId,
              hobby_id: hobbyId
            }))

            const { error: hobbiesError } = await (supabase as any)
              .from("profile_hobbies")
              .insert(hobbyInserts)

            if (hobbiesError) {
              console.error("Hobbies auto-save error:", hobbiesError)
            }
          }
        }

        // Save custom hobbies
        if (data.customHobbies && data.customHobbies.length > 0) {
          // First, remove existing custom hobbies
          const { error: deleteError } = await supabase
            .from("profile_custom_hobbies")
            .delete()
            .eq("user_id", userId)

          if (deleteError) {
            console.error("Error deleting custom hobbies:", deleteError)
          }

          // Then add new ones
          for (const customHobby of data.customHobbies) {
            if (!customHobby.id || !customHobby.label) {
              console.warn("Skipping invalid custom hobby:", customHobby)
              continue
            }

            try {
              // Insert or update custom hobby
              const { data: hobbyData, error: hobbyError } = await (supabase as any)
                .from("custom_hobbies")
                .upsert({
                  id: customHobby.id,
                  user_id: userId,
                  label: customHobby.label
                })
                .select()
                .single()

              if (hobbyError) {
                console.error("Custom hobby error:", hobbyError)
                continue
              }

              // Link to profile
              const { error: linkError } = await (supabase as any)
                .from("profile_custom_hobbies")
                .insert({
                  user_id: userId,
                  custom_hobby_id: hobbyData.id,
                  details: customHobby.details || null
                })

              if (linkError) {
                console.error("Custom hobby link error:", linkError)
              }
            } catch (error) {
              console.error("Error processing custom hobby:", error)
            }
          }
        }

        // Save expertise tags
        if (data.expertiseTags || data.customExpertiseTags) {
          // First, remove existing expertise tags
          const { error: deleteError } = await supabase
            .from("profile_expertise")
            .delete()
            .eq("user_id", userId)

          if (deleteError) {
            console.error("Error deleting expertise tags:", deleteError)
          }

          // Combine all expertise tags
          const allExpertiseTags = [...(data.expertiseTags || []), ...(data.customExpertiseTags || [])]
          
          if (allExpertiseTags.length > 0) {
            try {
              // Get or create expertise tags
              const tagInserts = await Promise.all(
                allExpertiseTags.map(async (tag) => {
                  if (!tag || typeof tag !== 'string') {
                    console.warn("Skipping invalid expertise tag:", tag)
                    return null
                  }

                  try {
                    const { data: existingTag } = await (supabase as any)
                      .from("expertise_tags")
                      .select("id")
                      .eq("label", tag)
                      .single()

                    if (existingTag) {
                      return { user_id: userId, tag_id: existingTag.id }
                    } else {
                      const { data: newTag, error: insertError } = await (supabase as any)
                        .from("expertise_tags")
                        .insert({ label: tag })
                        .select("id")
                        .single()

                      if (insertError) {
                        console.error("Error creating expertise tag:", insertError)
                        return null
                      }

                      return { user_id: userId, tag_id: newTag?.id }
                    }
                  } catch (error) {
                    console.error("Error processing expertise tag:", error)
                    return null
                  }
                })
              )

              // Filter out null values
              const validTagInserts = tagInserts.filter(insert => insert !== null)

              if (validTagInserts.length > 0) {
                const { error: expertiseError } = await (supabase as any)
                  .from("profile_expertise")
                  .insert(validTagInserts)

                if (expertiseError) {
                  console.error("Expertise auto-save error:", expertiseError)
                }
              }
            } catch (error) {
              console.error("Error processing expertise tags:", error)
            }
          }
        }

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
}
