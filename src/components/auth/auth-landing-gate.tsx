"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

/**
 * For /auth only: if already signed in, send to /home or /onboarding; otherwise show children (login UI).
 */
export function AuthLandingGate({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    let isMounted = true
    let checkTimeout: NodeJS.Timeout | null = null

    const checkOnboardingStatus = async (userId: string) => {
      try {
        const queryPromise = supabase
          .from("users")
          .select("first_name, last_name, career_title, company_name")
          .eq("user_id", userId)
          .single()

        const timeoutPromise = new Promise((_, reject) => {
          checkTimeout = setTimeout(() => reject(new Error("Query timeout")), 5000)
        })

        const { data: person, error: userError } = (await Promise.race([
          queryPromise,
          timeoutPromise,
        ])) as { data: unknown; error: unknown }

        if (checkTimeout) {
          clearTimeout(checkTimeout)
          checkTimeout = null
        }

        if (userError) {
          console.warn("User row not found yet; route to onboarding", userError)
          if (isMounted) router.push("/onboarding")
        } else if (
          person &&
          typeof person === "object" &&
          "first_name" in person &&
          "last_name" in person &&
          "career_title" in person &&
          "company_name" in person &&
          person.first_name &&
          person.last_name &&
          person.career_title &&
          person.company_name
        ) {
          if (isMounted) router.push("/home")
        } else {
          if (isMounted) router.push("/onboarding")
        }
      } catch (dbError) {
        if (checkTimeout) {
          clearTimeout(checkTimeout)
          checkTimeout = null
        }
        console.error("Database error:", dbError)
        if (isMounted) router.push("/home")
      }
    }

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          if (isMounted) {
            setUser(user)
            await checkOnboardingStatus(user.id)
          }
        } else if (isMounted) {
          setUser(null)
        }
      } catch (error) {
        console.error("Error checking auth:", error)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return

      if (session?.user) {
        setUser(session.user)
        if (event === "SIGNED_IN") {
          checkOnboardingStatus(session.user.id)
        }
      } else {
        setUser(null)
      }
    })

    return () => {
      isMounted = false
      if (checkTimeout) clearTimeout(checkTimeout)
      subscription.unsubscribe()
    }
  }, [router, supabase])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
          <p className="text-xs text-muted-foreground mt-2">Do not refresh this page. Could take 30 seconds.</p>
        </div>
      </div>
    )
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
