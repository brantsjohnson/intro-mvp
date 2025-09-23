import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function PrivacyPolicy() {
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
              Privacy Policy
            </h1>

            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-card border-border shadow-elevation">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">
                Intro Privacy Policy
              </CardTitle>
              <p className="text-muted-foreground">
                Last updated: 22 September 2025
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <p>
                At <strong>Intro</strong>, we value your privacy and are committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, and the choices you have regarding your data when you use our platform.
              </p>

              <hr className="my-8" />

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Information We Collect</h2>
              <p>When you sign up for Intro, we collect the following information:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Name</strong> (first and last)</li>
                <li><strong>Email address</strong> (used for login/authentication)</li>
                <li><strong>LinkedIn profile</strong> (optional)</li>
                <li><strong>Job title</strong></li>
                <li><strong>Company name</strong></li>
                <li><strong>Profile photo</strong> (if provided)</li>
                <li><strong>Free-response answers</strong> to optional questions</li>
              </ul>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li><strong>Enable authentication</strong> (via email, Google, or LinkedIn sign-in).</li>
                <li><strong>Facilitate networking and matching</strong> with other attendees at your specific conference. We use OpenAI's services to help generate match recommendations and descriptions.</li>
                <li><strong>Improve your event experience</strong> by providing curated introductions.</li>
              </ol>
              <p>Your free-response answers are not directly visible to other attendees, but insights from them may be highlighted in matchmaking descriptions.</p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">How Your Information is Shared</h2>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>With attendees:</strong> Your name, job title, company, profile photo, and LinkedIn (if provided) are visible only to other attendees at the same conference.</li>
                <li><strong>With service providers:</strong> We may share limited data with trusted service providers (such as OpenAI for matchmaking) strictly for the purpose of operating the platform.</li>
                <li><strong>We never sell your data.</strong></li>
              </ul>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Data Storage & Security</h2>
              <p>We store your data securely and take reasonable technical and organizational measures to protect it from unauthorized access, loss, or misuse.</p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Your Choices</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>You can update or delete your account information at any time by contacting us.</li>
                <li>You may opt out of matchmaking, though some platform features may be limited.</li>
              </ul>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Data Retention</h2>
              <p>We retain your information only as long as necessary to provide our services and meet legal obligations. After an event ends, we may anonymize or delete data that is no longer required.</p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Your Rights</h2>
              <p>Depending on where you live, you may have rights under data protection laws (such as GDPR or CCPA), including the right to access, correct, or delete your data. To exercise these rights, please contact us.</p>

              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Contact Us</h2>
              <p>If you have questions about this Privacy Policy or how your data is handled, please reach out to:</p>
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
