import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

const BASE_URL = process.env.INTRO_BASE_URL || "https://intro-mvp.vercel.app"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CSV_PATH =
  process.env.INTRO_ATTENDEE_CSV || "./Supabase Snippet Event attendance lookup.csv"

if (!SERVICE_KEY) {
  throw new Error("Please set SUPABASE_SERVICE_ROLE_KEY before running this script.")
}

async function rederive(eventId, userId) {
  const res = await fetch(`${BASE_URL}/api/derive-attendance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ eventId, userId })
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`❌ ${userId} failed (${res.status}): ${text}`)
    return false
  }

  console.log(`✅ ${userId} re-derived: ${text}`)
  return true
}

async function main() {
  const filePath = path.resolve(CSV_PATH)
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV not found at ${filePath}`)
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  })

  let isHeader = true
  let success = 0
  let failed = 0

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false
      continue
    }
    if (!line.trim()) continue

    const [eventId, userId] = line.split(",").map((part) => part.trim())
    if (!eventId || !userId) continue

    const ok = await rederive(eventId, userId)
    if (ok) success++
    else failed++

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  console.log(`\nFinished. Success: ${success}, Failed: ${failed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

