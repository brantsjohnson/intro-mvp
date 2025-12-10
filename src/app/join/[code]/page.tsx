"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase"
import { decryptEventCode } from "@/lib/event-code-encryption"

export default function JoinEventPage() {
  const router = useRouter()
  const params = useParams()
  const encryptedCode = params?.code as string
  const [isProcessing, setIsProcessing] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const handleJoin = async () => {
      try {
        // Decrypt the event code
        const eventCode = decryptEventCode(encryptedCode)
        
        if (!eventCode) {
          console.error('Invalid encrypted event code')
          router.push('/event/join')
          return
        }

        // Check authentication status
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          // Not authenticated - redirect to auth with encrypted code
          router.push(`/auth?code=${encryptedCode}`)
          return
        }

        // Check if user has completed profile
        const { data: person } = await supabase
          .from("users")
          .select("first_name, last_name, career_title, company_name")
          .eq("user_id", user.id)
          .single()

        const hasProfile = person && person.first_name && person.last_name && 
                          person.career_title && person.company_name

        if (!hasProfile) {
          // No profile - redirect to onboarding with encrypted code
          router.push(`/onboarding?code=${encryptedCode}`)
          return
        }

        // Has profile - redirect to home with encrypted code for auto-join
        router.push(`/home?code=${encryptedCode}`)
      } catch (error) {
        console.error('Error processing join link:', error)
        router.push('/event/join')
      } finally {
        setIsProcessing(false)
      }
    }

    if (encryptedCode) {
      handleJoin()
    } else {
      router.push('/event/join')
    }
  }, [encryptedCode, router, supabase])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}
