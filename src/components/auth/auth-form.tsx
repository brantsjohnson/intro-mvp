"use client"

import { useState, FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { createClientComponentClient } from "@/lib/supabase"

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [consent, setConsent] = useState(false)
  const [showPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const searchParams = useSearchParams()
  const eventCode = searchParams.get("eventCode") // Legacy support
  const encryptedCode = searchParams.get("code") // New encrypted code
  const codeToUse = encryptedCode || eventCode
  const supabase = createClientComponentClient()

  const startOAuth = async (provider: "google" | "linkedin_oidc") => {
    setIsLoading(true)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const redirectUrl = codeToUse
        ? `${baseUrl}/auth/callback?code=${codeToUse}`
        : `${baseUrl}/auth/callback`

      console.log(`Starting ${provider} OAuth with redirect URL:`, redirectUrl)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          scopes: provider === "linkedin_oidc" ? "openid profile email" : undefined,
        },
      })

      if (error) {
        console.error(`${provider} OAuth error:`, error)
      } else {
        console.log(`${provider} OAuth initiated successfully`)
      }
    } catch (err) {
      console.error("OAuth exception:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isSignUp && !consent) {
      return
    }

    setIsLoading(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: undefined, // Disable email verification redirect
            data: {
              first_name: firstName,
              last_name: lastName,
            },
          },
        })

        if (error) {
          console.error("Sign up error:", error)
          alert(`Sign up failed: ${error.message}`)
        } else if (data.user) {
          // Profile will be created automatically by database trigger
          console.log("Sign up successful, user created:", data.user.id)
          console.log("Session exists:", !!data.session)
          console.log("Email confirmed:", data.user.email_confirmed_at ? "Yes" : "No")
          
          // Wait for session to be properly established and persisted before proceeding
          // Sometimes the session needs a moment to be available and cookies need time to be set
          let sessionConfirmed = !!data.session
          let attempts = 0
          const maxAttempts = 10 // Increased attempts
          
          console.log("Initial session check:", !!data.session)
          
          while (!sessionConfirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 300)) // Increased delay
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()
            if (session) {
              sessionConfirmed = true
              console.log("Session confirmed after", attempts + 1, "attempt(s)")
              console.log("Session user ID:", session.user.id)
            } else {
              attempts++
              console.log(`Waiting for session... (${attempts}/${maxAttempts})`, sessionError)
            }
          }
          
          // Double-check with getUser() as well
          if (sessionConfirmed) {
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (!user) {
              console.warn("getUser() returned no user even though session exists")
              sessionConfirmed = false
            } else {
              console.log("getUser() confirmed user:", user.id)
            }
          }
          
          if (!sessionConfirmed) {
            console.error("Session not established after signup. This may cause issues.")
            alert("Account created but session not established. Please try signing in.")
            return
          }
          
          // Additional delay to ensure cookies are fully set and trigger has executed
          console.log("Waiting for cookies and trigger to complete...")
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Try to verify user row exists
          const { data: userRow, error: userError } = await supabase
            .from("users")
            .select("user_id")
            .eq("user_id", data.user.id)
            .single()
          
          if (userRow) {
            console.log("User row confirmed in database")
          } else {
            console.warn("User row not found. Trigger may have failed. Creating user row manually...")
            
            // Fallback: Manually create the user row if trigger failed
            // Retry logic in case of race condition
            let retries = 3
            let createError = null
            
            while (retries > 0) {
              const { error: err } = await supabase
                .from("users")
                .insert({
                  user_id: data.user.id,
                  email: data.user.email || email,
                  first_name: firstName || data.user.user_metadata?.first_name || "",
                  last_name: lastName || data.user.user_metadata?.last_name || "",
                  photo_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture || null,
                })
              
              if (!err) {
                console.log("User row created successfully via fallback")
                createError = null
                break
              } else if (err.code === '23505') {
                // Unique violation - user already exists (trigger might have just created it)
                console.log("User row already exists (trigger may have just created it)")
                createError = null
                break
              } else {
                createError = err
                retries--
                if (retries > 0) {
                  console.log(`Retry creating user row... (${3 - retries + 1}/3)`)
                  await new Promise(resolve => setTimeout(resolve, 200))
                }
              }
            }
            
            if (createError) {
              console.error("Failed to create user row manually after retries:", createError)
              // Still redirect - onboarding will handle missing profile
            }
          }
          
          // Determine redirect URL - always go to onboarding after sign-up
          let redirectUrl = "/onboarding"  // Always start onboarding after sign-up
          if (encryptedCode) {
            // Encrypted code - preserve it in onboarding
            redirectUrl = `/onboarding?code=${encryptedCode}`
          } else if (eventCode) {
            // Legacy event code - go to event join page
            redirectUrl = `/event/join?code=${eventCode}`
          }
          
          // Final session check before redirect
          const { data: { session: finalSession } } = await supabase.auth.getSession()
          if (!finalSession) {
            console.error("Session lost before redirect! This will cause issues.")
            alert("Session was lost. Please try signing in.")
            return
          }
          
          console.log("Final session check passed. Redirecting to:", redirectUrl)
          console.log("User ID:", data.user.id)
          console.log("User email:", data.user.email)
          console.log("Session access token exists:", !!finalSession.access_token)
          
          // Use href instead of replace to ensure cookies are sent properly
          // The replace was causing session issues
          window.location.href = redirectUrl
        } else {
          console.warn("Sign up completed but no user object returned")
          alert("Sign up completed but there was an issue. Please try signing in.")
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          console.error("Sign in error:", error)
        } else {
          // Redirect based on code type
          if (encryptedCode) {
            // Encrypted code - go to onboarding (profile check happens there)
            window.location.href = `/onboarding?code=${encryptedCode}`
          } else if (eventCode) {
            // Legacy event code - go to event join page
            window.location.href = `/event/join?code=${eventCode}`
          } else {
            window.location.href = "/"
          }
        }
      }
    } catch (err) {
      console.error("Email auth exception:", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-title mb-2">welcome!</h2>
          <p className="text-foreground text-left">Log in/Sign up</p>
        </div>

        {/* LinkedIn OAuth */}
        <button
          onClick={() => startOAuth("linkedin_oidc")}
          disabled={isLoading}
          className="w-full bg-[#0A66C2] text-white py-3 px-4 rounded-concave font-medium flex items-center justify-center space-x-3 hover:bg-[#084b8a] transition-colors disabled:opacity-50"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 34 34"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g>
              <path
                d="M34 2.5v29c0 1.38-1.12 2.5-2.5 2.5h-29C1.12 34 0 32.88 0 31.5v-29C0 1.12 1.12 0 2.5 0h29C32.88 0 34 1.12 34 2.5z"
                fill="#0A66C2"
              />
              <path
                d="M25.43 25.39h-3.71v-5.59c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.68h-3.71V13.5h3.56v1.62h.05c.5-.95 1.72-1.95 3.54-1.95 3.79 0 4.49 2.49 4.49 5.73v6.49zM10.08 11.88a2.14 2.14 0 01-2.12-2.14 2.14 2.14 0 112.13 2.14h-.01zM11.94 25.39H8.22V13.5h3.72v11.89z"
                fill="#fff"
              />
            </g>
          </svg>
          <span>Sign in with LinkedIn</span>
        </button>

        {/* Google OAuth */}
        <button
          onClick={() => startOAuth("google")}
          disabled={isLoading}
          className="w-full bg-white text-slate-900 py-3 px-4 rounded-concave font-medium flex items-center justify-center space-x-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
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
        <div className="relative flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-sm font-title text-muted-foreground">OR</span>
          <div className="flex-1 border-t border-border" />
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
                className="bg-input text-foreground rounded-2xl border-border placeholder:text-muted-foreground"
                placeholder="First Name"
              />
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required={isSignUp}
                className="bg-input text-foreground rounded-2xl border-border placeholder:text-muted-foreground"
                placeholder="Last Name"
              />
            </div>
          )}

          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-input text-foreground rounded-2xl border-border"
            placeholder="Email"
          />

          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-input text-foreground rounded-2xl border-border"
            placeholder="Password"
          />

          {!isSignUp && (
            <div className="text-left">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Forgot password?
              </button>
            </div>
          )}

          {isSignUp && (
            <div className="flex items-center space-x-3 p-4 rounded-lg border border-border bg-card/50">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked as boolean)}
                className="h-5 w-5 border-2 border-[#656361] flex-shrink-0"
              />
              <Label
                htmlFor="consent"
                className="text-sm text-foreground cursor-pointer normal-case font-normal whitespace-normal font-body"
                style={{ textTransform: 'none', fontWeight: 'normal' }}
              >
                By signing up, I accept the{" "}
                <a href="/terms" className="text-accent hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </a>
                . I understand that my name and image will be visible to event attendees and that OpenAI will be used for matching.
              </Label>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || (isSignUp && !consent)}
            className="w-full text-primary-foreground py-3 px-4 rounded-concave font-title text-lg transition-all disabled:opacity-50 bg-primary"
          >
            {isLoading ? "Loading..." : isSignUp ? "sign up" : "log in"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-gray-400"
          >
            {isSignUp ? (
              <>
                <span className="text-muted-foreground">Already have an account? </span>
                <span className="text-accent hover:underline">Sign in</span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">Don&apos;t have an account? </span>
                <span className="text-accent hover:underline font-medium">Sign up</span>
              </>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
