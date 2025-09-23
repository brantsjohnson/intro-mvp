import { Suspense } from "react"
import { AuthForm } from "@/components/auth/auth-form"

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">I</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to Intro</h1>
          <p className="text-muted-foreground">
            Connect with the right people at your next conference
          </p>
        </div>
        
        <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  )
}
