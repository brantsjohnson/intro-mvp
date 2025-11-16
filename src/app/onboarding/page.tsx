import { Suspense } from "react"
import { NewOnboardingFlow } from "@/components/onboarding/new-onboarding-flow"

// Force dynamic rendering since this page uses client-side state
export const dynamic = 'force-dynamic'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/background.jpg')" }}>
      <Suspense fallback={<div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>Loading...</div>}>
        <NewOnboardingFlow />
      </Suspense>
    </div>
  )
}
