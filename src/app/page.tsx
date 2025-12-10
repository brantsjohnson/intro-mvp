"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthForm } from "@/components/auth/auth-form"
import { createClientComponentClient } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { Changa_One } from "next/font/google"

const changaOne = Changa_One({ weight: "400", subsets: ["latin"] })

export default function Home() {
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    let isMounted = true
    let checkTimeout: NodeJS.Timeout | null = null

    const checkOnboardingStatus = async (userId: string) => {
      const queryStart = performance.now()
      try {
        // Optimized query: only select the fields we need to check
        // Use a timeout to prevent hanging on slow queries
        const queryPromise = supabase
          .from("users")
          .select("first_name, last_name, career_title, company_name")
          .eq("user_id", userId)
          .single()
        
        const timeoutPromise = new Promise((_, reject) => {
          checkTimeout = setTimeout(() => reject(new Error('Query timeout')), 5000)
        })

        const { data: person, error: userError } = await Promise.race([
          queryPromise,
          timeoutPromise
        ]) as { data: any, error: any }
        
        const queryTime = performance.now() - queryStart
        console.log(`[PERF] Onboarding check query took ${queryTime.toFixed(2)}ms`)

        if (checkTimeout) {
          clearTimeout(checkTimeout)
          checkTimeout = null
        }

        if (userError) {
          console.warn("User row not found yet; route to onboarding", userError)
          if (isMounted) router.push("/onboarding")
        } else if (person && person.first_name && person.last_name && person.career_title && person.company_name) {
          if (isMounted) router.push("/home")
        } else {
          if (isMounted) router.push("/onboarding")
        }
      } catch (dbError: any) {
        if (checkTimeout) {
          clearTimeout(checkTimeout)
          checkTimeout = null
        }
        console.error("Database error:", dbError)
        // Gracefully fallback to home if query fails or times out
        if (isMounted) router.push("/home")
      }
    }

    const checkAuth = async () => {
      const authStart = performance.now()
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const authTime = performance.now() - authStart
        console.log(`[PERF] Auth getUser took ${authTime.toFixed(2)}ms`)
        
        if (user) {
          if (isMounted) {
            setUser(user)
            // Check onboarding status
            await checkOnboardingStatus(user.id)
          }
        } else {
          if (isMounted) setUser(null)
        }
      } catch (error) {
        console.error("Error checking auth:", error)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    // Only check auth on mount, not in listener
    checkAuth()

    // Listen for auth state changes - only update user state, don't re-check
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      
      if (session?.user) {
        setUser(session.user)
        // Only check onboarding if this is a sign-in event (not just session refresh)
        if (event === 'SIGNED_IN') {
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If user is authenticated, don't show the auth form
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Top section */}
      <div className="px-4 pt-6 sm:pt-8 lg:pt-10 pb-2 sm:pb-3 lg:pb-4 relative">
        <div className="relative z-10 text-center">
          <p className="text-sm sm:text-base font-medium mb-2 sm:mb-3 text-foreground">
            The Best Way to Network
          </p>
          <div className="flex justify-center items-center mb-0 sm:mb-1">
            <div className="relative inline-block leading-none">
              <span
                aria-hidden
                className={`${changaOne.className} block absolute left-0 top-[6px] text-accent text-[64px] sm:text-[80px] md:text-[96px] lg:text-[120px] xl:text-[144px]`}
              >
                INTRO
              </span>
              <span
                className={`${changaOne.className} relative block text-foreground text-[64px] sm:text-[80px] md:text-[96px] lg:text-[120px] xl:text-[144px]`}
              >
                INTRO
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Auth form section */}
      <div className="px-4 py-4">
        <div className="max-w-md mx-auto">
          <AuthForm />
        </div>
      </div>

      {/* Contact section */}
      <div className="text-center px-4 py-2">
        <p className="text-muted-foreground text-sm">
          <span className="text-accent hover:underline cursor-pointer">Contact us</span> if you want to use INTRO at your event.
        </p>
      </div>
    </div>
  );
}
