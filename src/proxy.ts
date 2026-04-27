import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Next.js 16+: use `proxy` (this file) instead of deprecated `middleware.ts`.
 * OAuth often lands on Site URL `/` with ?code=&state= while marketing is served there;
 * forward to /auth/callback so the code is exchanged. Logged-in users on `/` go to the app.
 */
function isLikelyOAuthAuthorizationCode(code: string): boolean {
  if (!code) return false
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
  return uuid || code.length >= 40
}

function shouldForwardRootOAuthToCallback(request: NextRequest): boolean {
  if (request.nextUrl.pathname !== "/") return false
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  if (!code) return false
  return Boolean(state) || isLikelyOAuthAuthorizationCode(code)
}

export async function proxy(request: NextRequest) {
  if (shouldForwardRootOAuthToCallback(request)) {
    const url = new URL("/auth/callback", request.url)
    url.search = request.nextUrl.search
    return NextResponse.redirect(url)
  }

  // Demo-mode sponsor access: App Router layouts cannot read `searchParams`,
  // so we stamp an `x-intro-demo: 1` request header when `/sponsor/*` is visited
  // with `?demo=1`. The sponsor layout reads this header to skip the auth redirect.
  const isSponsorDemo =
    request.nextUrl.pathname.startsWith("/sponsor/") &&
    request.nextUrl.searchParams.get("demo") === "1"

  if (isSponsorDemo) {
    const demoHeaders = new Headers(request.headers)
    demoHeaders.set("x-intro-demo", "1")
    return NextResponse.next({ request: { headers: demoHeaders } })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user && request.nextUrl.pathname === "/") {
    const dest = new URL("/onboarding", request.url)
    const rawCode = request.nextUrl.searchParams.get("code")
    const eventCode = request.nextUrl.searchParams.get("eventCode")
    if (rawCode && !isLikelyOAuthAuthorizationCode(rawCode)) {
      dest.searchParams.set("code", rawCode)
    }
    if (eventCode) {
      dest.searchParams.set("eventCode", eventCode)
    }
    return NextResponse.redirect(dest)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
