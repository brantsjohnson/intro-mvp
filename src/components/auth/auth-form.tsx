"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [consent, setConsent] = useState(false)
  const [showPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const supabase = createClientComponentClient()

  const handleGoogleAuth = async () => {
    setIsLoading(true)
    try {
      console.log('Starting Google OAuth with redirect:', `${window.location.origin}/auth/callback`)
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) {
        console.error('Google OAuth error:', error)
        toast.error(error.message)
      } else {
        console.log('Google OAuth initiated successfully')
      }
    } catch (err) {
      console.error('Google OAuth exception:', err)
      toast.error("An error occurred during authentication")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (isSignUp && !consent) {
      toast.error("Please accept the terms and privacy policy")
      return
    }

    setIsLoading(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            }
          }
        })
        
        if (error) {
          toast.error(error.message)
        } else if (data.user) {
          // Profile will be created automatically by database trigger
          toast.success("Account created successfully! Check your email for confirmation.")
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        if (error) {
          toast.error(error.message)
        } else {
          toast.success("Signed in successfully")
          // Let the main page handle routing based on onboarding status
          window.location.href = "/"
        }
      }
    } catch {
      toast.error("An error occurred during authentication")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-card border-border shadow-elevation rounded-xl">
      <CardContent className="p-6 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">WELCOME!</h2>
          <p className="text-white text-left">Log in/Sign up</p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleAuth}
          disabled={isLoading}
          className="w-full bg-white text-gray-800 py-3 px-4 rounded-xl font-medium flex items-center justify-center space-x-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Sign in with Google</span>
        </button>

        {/* Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-card px-2 text-gray-400">or</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required={isSignUp}
                className="bg-gray-800 text-white rounded-xl border-gray-600 placeholder-gray-400"
                placeholder="First Name"
              />
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required={isSignUp}
                className="bg-gray-800 text-white rounded-xl border-gray-600 placeholder-gray-400"
                placeholder="Last Name"
              />
            </div>
          )}

          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-gray-800 text-white rounded-xl border-gray-600"
            placeholder="Email"
          />

          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-gray-800 text-white rounded-xl border-gray-600"
            placeholder="Password"
          />

          {!isSignUp && (
            <div className="text-left">
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-gray-300"
              >
                Forgot password?
              </button>
            </div>
          )}

          {isSignUp && (
            <div className="flex items-start space-x-2">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked as boolean)}
                className="mt-0.5"
              />
              <Label htmlFor="consent" className="text-sm text-gray-400 leading-relaxed">
                By signing up, I accept the{" "}
                <a href="/terms" className="text-orange-400 hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" className="text-orange-400 hover:underline">
                  Privacy Policy
                </a>
                . I understand that my name and image will be visible to event attendees and that OpenAI will be used for matching.
              </Label>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || (isSignUp && !consent)}
            className="w-full text-white py-3 px-4 rounded-xl font-bold text-lg transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #EC874E, #BF341E)' }}
          >
            {isLoading ? "Loading..." : isSignUp ? "SIGN UP" : "LOG IN"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-gray-400"
          >
            {isSignUp ? (
              <>
                <span className="text-gray-400">Already have an account? </span>
                <span className="text-orange-400 hover:underline">Sign in</span>
              </>
            ) : (
              <>
                <span className="text-gray-400">Don&apos;t have an account? </span>
                <span className="text-orange-400 hover:underline">Sign up</span>
              </>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
