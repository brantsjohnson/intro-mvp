import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"

// Force dynamic rendering since this page uses client-side state
export const dynamic = 'force-dynamic'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen gradient-bg">
      <OnboardingFlow />
    </div>
  )
}
