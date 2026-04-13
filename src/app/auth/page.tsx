"use client"

import { Suspense } from "react"
import { AuthForm } from "@/components/auth/auth-form"
import { AuthLandingGate } from "@/components/auth/auth-landing-gate"
import { Changa_One } from "next/font/google"

const changaOne = Changa_One({ weight: "400", subsets: ["latin"] })

function AuthPageInner() {
  return (
    <AuthLandingGate>
      <div className="min-h-screen">
        <div className="px-4 pt-6 sm:pt-8 lg:pt-10 pb-2 sm:pb-3 lg:pb-4 relative">
          <div className="relative z-10 text-center">
            <p className="text-sm sm:text-base font-medium mb-2 sm:mb-3 text-foreground">
              The Best Way to Network
            </p>
            <div className="flex flex-col justify-center items-center mb-0 sm:mb-1">
              <div
                className={`inline-flex items-center gap-2 sm:gap-3 text-foreground leading-none ${changaOne.className}`}
                style={{ letterSpacing: "0.02em" }}
              >
                <img
                  src="/marketing/Intro%20Logo%20-%20Transparent.png"
                  alt=""
                  width={56}
                  height={56}
                  decoding="async"
                  className="h-11 w-auto sm:h-14 md:h-16 lg:h-[4.25rem] shrink-0 object-contain"
                  aria-hidden
                />
                <span className="font-normal text-[2.35rem] sm:text-[3rem] md:text-[3.75rem] lg:text-[4.25rem] xl:text-[4.75rem]">
                  Intro
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="max-w-md mx-auto">
            <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
              <AuthForm />
            </Suspense>
          </div>
        </div>

        <div className="text-center px-4 py-2">
          <p className="text-muted-foreground text-sm">
            <a
              href="https://www.linkedin.com/in/brantshanonjohnson/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline cursor-pointer"
            >
              Contact us
            </a>{" "}
            if you want to use INTRO at your event.
          </p>
        </div>
      </div>
    </AuthLandingGate>
  )
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>
      }
    >
      <AuthPageInner />
    </Suspense>
  )
}
