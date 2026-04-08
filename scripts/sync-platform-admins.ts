#!/usr/bin/env node
/**
 * Inserts each user_id from PLATFORM_ADMIN_USER_IDS into public.platform_admins.
 * Requires: migration 20260407_phase_a_platform_admin.sql applied, and each UUID must
 * already exist in public.users (same id as auth.users).
 *
 * Usage: npm run platform-admin:sync
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: join(__dirname, "..", ".env.local") })

function parseIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ids = parseIds(process.env.PLATFORM_ADMIN_USER_IDS)

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

if (ids.length === 0) {
  console.error("PLATFORM_ADMIN_USER_IDS is empty — set it in .env.local first.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

async function main() {
  for (const userId of ids) {
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()

    if (userErr) {
      console.error(`users lookup failed for ${userId}:`, userErr.message)
      continue
    }
    if (!userRow) {
      console.warn(
        `Skip ${userId}: no row in public.users (sign in once with this account so the user profile exists).`,
      )
      continue
    }

    const { error: insertErr } = await supabase
      .from("platform_admins")
      .insert({ user_id: userId })

    if (insertErr) {
      if (insertErr.code === "23505") {
        console.log(`Already platform admin: ${userId}`)
        continue
      }
      console.error(`Insert failed for ${userId}:`, insertErr.message)
      continue
    }
    console.log(`Added platform admin: ${userId}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
