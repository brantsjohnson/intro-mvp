import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <GradientButton variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </GradientButton>
            </Link>
            
            <h1 className="text-lg font-semibold text-foreground">
              Terms of Service
            </h1>

            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">
                Intro Terms of Service
              </CardTitle>
              <p className="text-muted-foreground">
                Last updated: 22 September 2025
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <p>
                Welcome to Intro. These Terms of Service ("Terms") govern your use of our platform ("Service"). By creating an account or using Intro, you agree to these Terms. If you do not agree, please do not use the Service.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Eligibility</h2>
              <p>
                You must be at least 18 years old and an invited attendee of a participating conference or event to use Intro. By signing up, you represent that the information you provide is accurate and that you have the right to share it.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Account Registration</h2>
              <p>You can register for Intro using:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Email authentication (manual sign-up or Google sign-in)</li>
                <li>LinkedIn sign-in</li>
              </ul>
              <p>
                When registering, you must provide accurate information including your name, email, job title, company, and (if applicable) LinkedIn profile. You are responsible for maintaining the confidentiality of your login credentials.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Use of the Service</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>Intro is designed solely for professional networking at specific conferences.</li>
                <li>Your profile (name, job title, company, photo, and LinkedIn if provided) is only visible to attendees of your event.</li>
                <li>Free-response answers are not directly shown, but may be summarized in matchmaking descriptions.</li>
                <li>You agree to use the Service respectfully and not to harass, misuse, or exploit other attendees' information.</li>
              </ul>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">4. Data & Privacy</h2>
              <p>
                Your information is handled in accordance with our{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                . In short:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>We collect your name, email, job title, company, LinkedIn (if provided), and free responses.</li>
                <li>Your information is only visible to attendees of your event.</li>
                <li>We use OpenAI and other trusted providers for matchmaking services.</li>
                <li>We never sell your data.</li>
              </ul>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">5. Intellectual Property</h2>
              <p>
                Intro and its content (other than user profiles) are owned by us or our licensors. You may not copy, modify, or distribute any part of the Service without our written consent.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">6. Limitations of Liability</h2>
              <p>
                Intro is provided "as is." We do not guarantee uninterrupted service or specific networking outcomes. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the Service.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">7. Termination</h2>
              <p>
                We may suspend or terminate your access if you violate these Terms or misuse the platform. You may delete your account at any time by contacting us.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">8. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. Continued use of Intro after updates means you accept the revised Terms.
              </p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">9. Contact Us</h2>
              <p>If you have questions about these Terms, please contact us at:</p>
              <p>
                <a 
                  href="mailto:brantshanonjohnson@gmail.com" 
                  className="text-primary hover:underline"
                >
                  brantshanonjohnson@gmail.com
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
