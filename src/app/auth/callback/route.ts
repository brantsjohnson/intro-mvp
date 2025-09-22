import { createServerComponentClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const origin = requestUrl.origin

  console.log('Auth callback received:', { code: !!code, error })

  if (error) {
    console.error('OAuth error in callback:', error)
    return NextResponse.redirect(`${origin}/auth?error=${error}`)
  }

  if (code) {
    const supabase = await createServerComponentClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('OAuth callback error:', exchangeError)
      return NextResponse.redirect(`${origin}/auth?error=oauth_error`)
    }
    
    // Profile will be automatically created by the database trigger
    console.log('OAuth successful, user:', data.user?.id, 'email:', data.user?.email)
    console.log('Session established:', !!data.session)
  }

  // URL to redirect to after sign in process completes
  console.log('Redirecting to main page for routing logic')
  return NextResponse.redirect(`${origin}/`)
}
