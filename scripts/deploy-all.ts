#!/usr/bin/env tsx

import { config } from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { spawn } from "node:child_process"

const ENV_CANDIDATES = [
  ".env.deploy",
  ".env.production.local",
  ".env.local",
  ".vercel/output/.env.production.local"
] as const

type EnvFilename = (typeof ENV_CANDIDATES)[number]

function resolveEnvFile(): { filename: EnvFilename; path: string } {
  for (const candidate of ENV_CANDIDATES) {
    const full = resolve(candidate)
    if (existsSync(full)) {
      return { filename: candidate, path: full }
    }
  }

  throw new Error(
    `Cannot find any deployment env file. Checked:\n${ENV_CANDIDATES.map((name) => `• ${name}`).join("\n")}\n` +
      `Create one (e.g. copy deploy.env.example to .env.deploy) and rerun.`
  )
}

function log(step: string, message: string) {
  console.log(`[${step}] ${message}`)
}

function fail(message: string): never {
  console.error(`\n❌ ${message}`)
  process.exit(1)
}

let envInfo: { filename: EnvFilename; path: string }
try {
  envInfo = resolveEnvFile()
} catch (error) {
  fail((error as Error).message)
}

const ENV_FILENAME = envInfo.filename
const ENV_PATH = envInfo.path

config({ path: ENV_PATH, override: true })

if (ENV_FILENAME !== ".env.deploy") {
  log(
    "setup",
    `Using ${ENV_FILENAME}. Ensure it contains private values like the Supabase service role key (they won't be printed).`
  )
}

const parseBool = (value?: string | null): boolean => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ["true", "1", "yes", "on"].includes(normalized)
}

const forceDbFromEnv = parseBool(process.env.DEPLOY_FORCE_DB_PUSH)
const skipDbFromEnv = parseBool(process.env.DEPLOY_SKIP_DB_PUSH)
const forceDbFromCli = process.argv.includes("--force-db")
const skipDbFromCli = process.argv.includes("--skip-db") || process.argv.includes("--no-db")

let SKIP_DB_PUSH = true
if (forceDbFromEnv || forceDbFromCli) {
  SKIP_DB_PUSH = false
} else if (skipDbFromEnv || skipDbFromCli) {
  SKIP_DB_PUSH = true
}

const SUPABASE_PROJECT_REF = process.env.DEPLOY_SUPABASE_PROJECT_REF as string
const SUPABASE_FUNCTION = (process.env.DEPLOY_SUPABASE_FUNCTION_NAME || "matchmaker").trim()
const VERCEL_TOKEN = process.env.DEPLOY_VERCEL_TOKEN as string
const VERCEL_PROJECT_ID = process.env.DEPLOY_VERCEL_PROJECT_ID as string
const VERCEL_ORG_ID = process.env.DEPLOY_VERCEL_ORG_ID?.trim()

const REQUIRED_ENV_VARS: Array<[keyof NodeJS.ProcessEnv, string]> = [
  ["DEPLOY_SUPABASE_PROJECT_REF", "Supabase project ref"],
  ["DEPLOY_VERCEL_TOKEN", "Vercel token"],
  ["DEPLOY_VERCEL_PROJECT_ID", "Vercel project ID"]
]

const missing = REQUIRED_ENV_VARS.filter(([key]) => !process.env[key] || process.env[key]?.trim() === "")

if (missing.length > 0) {
  const details = missing.map(([key, description]) => `• ${key}: ${description}`).join("\n")
  fail(`Missing environment values in ${ENV_FILENAME}:\n${details}`)
}

const SUPABASE_ROOT = resolve("supabase")

const SUPABASE_ENV: Record<string, string> = { SUPABASE_PROJECT_REF }

function runCommand(
  name: string,
  command: string,
  args: string[],
  options: { env?: Record<string, string>; cwd?: string } = {}
) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    log(name, `${command} ${args.join(" ")}`)
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: options.cwd,
      env: { ...process.env, ...options.env }
    })

    child.on("error", (error) => {
      rejectPromise(error)
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        rejectPromise(new Error(`${command} exited with code ${code}`))
      }
    })
  })
}

async function ensureCliAvailable(binary: string, installHint: string) {
  try {
    await runCommand("check", binary, ["--version"])
  } catch (error) {
    fail(
      `${binary} CLI not found or not on PATH. Install it and try again.\n` +
        `Hint: ${installHint}\nDetails: ${(error as Error).message}`
    )
  }
}

async function main() {
  log("setup", `Loading environment from ${ENV_FILENAME}`)
  log(
    "setup",
    "Make sure the Supabase CLI is logged in (`supabase login`) and Vercel CLI is authenticated at least once."
  )

  await ensureCliAvailable(
    "supabase",
    "https://supabase.com/docs/guides/cli/getting-started"
  )
  await ensureCliAvailable(
    "vercel",
    "https://vercel.com/docs/cli"
  )

  let step = 0
  const totalSteps = SKIP_DB_PUSH ? 3 : 4
  const nextStep = (message: string) => {
    step += 1
    log(`${step}/${totalSteps}`, message)
  }

  nextStep("Linking Supabase project")
  const linkArgs = ["link", "--project-ref", SUPABASE_PROJECT_REF, "--yes"]
  if (process.env.DEPLOY_SUPABASE_DB_PASSWORD?.trim()) {
    linkArgs.push("--password", process.env.DEPLOY_SUPABASE_DB_PASSWORD.trim())
  }
  await runCommand("supabase", "supabase", linkArgs, { cwd: SUPABASE_ROOT, env: SUPABASE_ENV })

  if (!SKIP_DB_PUSH) {
    nextStep("Pushing database migrations to Supabase")
    await runCommand(
      "supabase",
      "supabase",
      [
        "db",
        "push",
        "--linked",
        "--yes",
        ...(process.env.DEPLOY_SUPABASE_DB_PASSWORD?.trim()
          ? ["-p", process.env.DEPLOY_SUPABASE_DB_PASSWORD.trim()]
          : [])
      ],
      { cwd: SUPABASE_ROOT, env: SUPABASE_ENV }
    )
  } else {
    log("info", "Skipping database migrations (set DEPLOY_FORCE_DB_PUSH=true or pass --force-db to run them).")
  }

  nextStep(`Deploying edge function '${SUPABASE_FUNCTION}' to Supabase`)
  await runCommand(
    "supabase",
    "supabase",
    ["functions", "deploy", SUPABASE_FUNCTION, "--project-ref", SUPABASE_PROJECT_REF, "--yes"],
    { cwd: SUPABASE_ROOT, env: SUPABASE_ENV }
  )

  nextStep("Triggering Vercel production deploy")
  const vercelArgs = ["deploy", "--prod", "--token", VERCEL_TOKEN, "--yes", "--confirm"]
  if (VERCEL_ORG_ID) {
    vercelArgs.push("--scope", VERCEL_ORG_ID)
  }
  await runCommand("vercel", "vercel", vercelArgs)

  console.log("\n✅ Deployment completed successfully.")
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
