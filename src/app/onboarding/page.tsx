import { Suspense } from "react"
import { NewOnboardingFlow } from "@/components/onboarding/new-onboarding-flow"

// Force dynamic rendering since this page uses client-side state
export const dynamic = 'force-dynamic'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>}>
        <NewOnboardingFlow />
      </Suspense>
    </div>
  )
}
