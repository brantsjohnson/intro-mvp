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
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUser(user)
          // Check if user has completed onboarding by looking for required fields in users
          try {
            const { data: person, error: userError } = await supabase
              .from("users")
              .select("user_id, first_name, last_name, career_title, company_name")
              .eq("user_id", user.id)
              .single()
            
            if (userError) {
              console.warn("User row not found yet; route to onboarding", userError)
              router.push("/onboarding")
            } else if (person && person.first_name && person.last_name && person.career_title && person.company_name) {
              router.push("/home")
            } else {
              router.push("/onboarding")
            }
          } catch (dbError) {
            console.error("Database error:", dbError)
            // Gracefully keep user on landing if something is wrong
            router.push("/home")
          }
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error("Error checking auth:", error)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        // Check onboarding status and redirect
        checkAuth()
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [router, supabase])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>
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
      <div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/background.jpg')" }}>
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
