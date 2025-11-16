#!/usr/bin/env tsx
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

// Try multiple env file paths
const envPaths = [
  process.env.DOTENV_CONFIG_PATH,
  process.env.REMATCH_ENV_PATH,
  ".env.production.local",
  ".env.local",
  ".env.deploy",
  ".env"
].filter(Boolean) as string[]

let loaded = false
for (const envPath of envPaths) {
  try {
    const fullPath = resolve(envPath)
    const content = readFileSync(fullPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const [key, ...valueParts] = trimmed.split("=")
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=").replace(/^["']|["']$/g, "")
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
    loaded = true
    console.log(`Loaded env from ${envPath}`)
    break
  } catch (e) {
    // Try next file
  }
}

if (!loaded) {
  config() // Fallback to default dotenv behavior
}

const eventId = process.argv[2]

if (!eventId) {
  console.error("Usage: tsx scripts/rematch-event.ts <eventId>")
  process.exit(1)
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  ""

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  ""

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase URL or service role key in environment")
  console.error("Looking for NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL")
  console.error("Looking for SUPABASE_SERVICE_ROLE_KEY")
  console.error(`Tried env files: ${envPaths.join(", ")}`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

console.log(`Fetching attendees for event ${eventId}...`)

const { data: attendanceRows, error: attendanceError } = await supabase
  .from("attendance")
  .select("user_id")
  .eq("event_id", eventId)

if (attendanceError) {
  console.error("Failed to load attendance:", attendanceError)
  process.exit(1)
}

const userIds = Array.from(
  new Set((attendanceRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)))
)

if (userIds.length === 0) {
  console.log("No attendees found. Nothing to rematch.")
  process.exit(0)
}

console.log(`Found ${userIds.length} attendee(s). Deleting existing system matches...`)

const { error: deleteError } = await supabase
  .from("connections")
  .delete()
  .eq("event_id", eventId)
  .eq("connection_kind", "system_match")

if (deleteError) {
  console.error("Failed to delete existing system matches:", deleteError)
  process.exit(1)
}

const endpoint = new URL("/api/dev/force-rematch", "https://introevent.site")

let success = 0
let failures: Array<{ userId: string; status: number; body: string }> = []

for (const userId of userIds) {
  const payload = {
    eventId,
    userId,
    forceBackfill: true,
    deleteExisting: false
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    const text = await response.text()

    if (response.ok) {
      success += 1
      console.log(`✅ ${userId}: ${text}`)
    } else {
      failures.push({ userId, status: response.status, body: text })
      console.error(`❌ ${userId}: (${response.status}) ${text}`)
    }
  } catch (error) {
    failures.push({ userId, status: 0, body: String(error) })
    console.error(`❌ ${userId}: request failed`, error)
  }
}

console.log(`Completed. Success: ${success}, Failures: ${failures.length}`)

if (failures.length) {
  console.log("Failure details:")
  for (const failure of failures) {
    console.log(` - ${failure.userId}: status=${failure.status}, body=${failure.body}`)
  }
  process.exit(1)
}


