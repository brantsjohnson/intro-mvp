"use client"

import { Suspense } from "react"
import { AuthForm } from "@/components/auth/auth-form"
import { Changa_One } from "next/font/google"

const changaOne = Changa_One({ weight: "400", subsets: ["latin"] })

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top hero section to match main site */}
      <div className="px-4 pt-6 sm:pt-8 lg:pt-10 pb-2 sm:pb-3 lg:pb-4 relative overflow-hidden">
        <div 
          className="absolute inset-0 animate-gradient"
          style={{ 
            background: 'linear-gradient(45deg, #EC874E, #BF341E, #EC874E, #D2691E, #EC874E)',
            backgroundSize: '400% 400%',
            animation: 'gradientShift 8s ease infinite'
          }}
        />
        <div className="relative z-10 text-center">
          <p className="text-sm sm:text-base font-medium mb-2 sm:mb-3" style={{ color: '#242424' }}>
            The Best Way to Network
          </p>
          <div className="flex justify-center items-center mb-0 sm:mb-1">
            <div className="relative inline-block leading-none">
              <span
                aria-hidden
                className={`${changaOne.className} block absolute left-0 top-[6px] text-[#BF341E] text-[64px] sm:text-[80px] md:text-[96px] lg:text-[120px] xl:text-[144px]`}
              >
                INTRO
              </span>
              <span
                className={`${changaOne.className} relative block text-[#242424] text-[64px] sm:text-[80px] md:text-[96px] lg:text-[120px] xl:text-[144px]`}
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
          <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
            <AuthForm />
          </Suspense>
        </div>
      </div>

      {/* Contact section */}
      <div className="text-center px-4 py-2">
        <p className="text-muted-foreground text-sm">
          <span className="text-primary hover:underline cursor-pointer">Contact us</span> if you want to use INTRO at your event.
        </p>
      </div>
    </div>
  )
}
