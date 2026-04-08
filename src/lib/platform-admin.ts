import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { Database } from "./database.types"

/** Comma-separated Supabase auth user UUIDs with full platform access. */
export function parsePlatformAdminUserIdsFromEnv(): string[] {
  const raw = process.env.PLATFORM_ADMIN_USER_IDS ?? ""
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isPlatformAdminFromEnv(userId: string): boolean {
  if (!userId) return false
  const allowed = parsePlatformAdminUserIdsFromEnv()
  return allowed.includes(userId.toLowerCase())
}

/**
 * Returns true if the user is a platform admin via env allowlist or `platform_admins` table.
 * Table check uses the service role and fails closed if the query errors (e.g. migration not applied).
 */
export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  if (isPlatformAdminFromEnv(userId)) return true

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false

  const supabase = createClient<Database>(url, key)
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.warn("[platform-admin] platform_admins lookup failed:", error.message)
    return false
  }
  return data != null
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient<Database>(url, key)
}

/**
 * Supabase SSR client for Route Handlers (reads session from cookies).
 */
export async function createRouteHandlerSupabase() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          /* ignore when called from read-only context */
        }
      },
    },
  })
}

export type PlatformAdminRouteResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

/**
 * For API routes: require a logged-in user who is a platform admin.
 */
export async function requirePlatformAdminForRoute(): Promise<PlatformAdminRouteResult> {
  const supabase = await createRouteHandlerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const allowed = await isPlatformAdminUser(user.id)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — platform admin only" },
        { status: 403 },
      ),
    }
  }

  return { ok: true, userId: user.id }
}
