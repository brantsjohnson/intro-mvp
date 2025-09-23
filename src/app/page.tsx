"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { AuthForm } from "@/components/auth/auth-form"
import { createClientComponentClient } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

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
          // Check if user has completed onboarding by looking for profile
          try {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("id, first_name, last_name, job_title, company")
              .eq("id", user.id)
              .single()
            
            if (profileError) {
              console.error("Error checking profile:", profileError)
              // If there's an error checking profile, assume user needs onboarding
              router.push("/onboarding")
            } else if (profile && profile.first_name && profile.last_name && profile.job_title && profile.company) {
              // User has completed onboarding (has required fields), redirect to home
              router.push("/home")
            } else {
              // User hasn't completed onboarding, redirect to onboarding
              router.push("/onboarding")
            }
          } catch (dbError) {
            console.error("Database error:", dbError)
            // If database is down, redirect to onboarding as fallback
            router.push("/onboarding")
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
      <div className="min-h-screen bg-background flex items-center justify-center">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top section with animated orange gradient */}
      <div className="px-4 py-8 sm:py-12 lg:py-16 relative overflow-hidden">
        <div 
          className="absolute inset-0 animate-gradient"
          style={{ 
            background: 'linear-gradient(45deg, #EC874E, #BF341E, #EC874E, #D2691E, #EC874E)',
            backgroundSize: '400% 400%',
            animation: 'gradientShift 8s ease infinite'
          }}
        />
        <div className="relative z-10 text-center">
          <p className="text-sm sm:text-base font-medium mb-4 sm:mb-6" style={{ color: '#242424' }}>
            The Best Way to Network
          </p>
          <div className="flex justify-center items-center mb-6 sm:mb-8">
            <Image 
              src="/intro-logo.svg" 
              alt="INTRO" 
              width={200}
              height={80}
              className="h-16 w-auto sm:h-20 md:h-24 lg:h-32 xl:h-40 max-w-full object-contain"
              onError={(e) => {
                // Fallback to text if logo doesn't exist
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <h1 
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold hidden"
              style={{ color: '#242424' }}
            >
              INTRO
            </h1>
          </div>
        </div>
      </div>

      {/* Auth form section */}
      <div className="px-4 py-8">
        <div className="max-w-md mx-auto">
          <AuthForm />
        </div>
      </div>

      {/* Contact section */}
      <div className="text-center px-4 py-4">
        <p className="text-muted-foreground text-sm">
          <span className="text-primary hover:underline cursor-pointer">Contact us</span> if you want to use INTRO at your event.
        </p>
      </div>
    </div>
  );
}
