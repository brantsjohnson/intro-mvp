import OpenAI from "openai"

// Thin wrapper over the OpenAI Responses/Chat APIs used by the onboarding branching flow.
// We intentionally mirror the model + temperature choices used by
// src/app/api/derive-attendance/route.ts and supabase/functions/question-engine
// so onboarding output stays consistent with the rest of the match pipeline.

const DEFAULT_MODEL = "gpt-4o-mini"

let cachedClient: OpenAI | null = null

function getClient(): OpenAI | null {
  if (cachedClient) return cachedClient
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  cachedClient = new OpenAI({ apiKey: key })
  return cachedClient
}

export function isAiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

export interface CallJsonOpts {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  model?: string
}

export interface CallTextOpts {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  model?: string
}

// Strip ``` fences and leading/trailing noise so JSON.parse works on Claude/GPT output.
function stripCodeFences(text: string): string {
  if (!text) return ""
  const t = text.trim()
  if (t.startsWith("```")) {
    return t
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim()
  }
  return t
}

function safeJsonParse<T>(raw: string): T | null {
  if (!raw) return null
  const cleaned = stripCodeFences(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Sometimes the model includes prose before the JSON object.
    const match = cleaned.match(/\{[\s\S]*\}$/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}

export async function callAiJson<T = unknown>(opts: CallJsonOpts): Promise<T | null> {
  const client = getClient()
  if (!client) return null
  const response = await client.chat.completions.create({
    model: opts.model || DEFAULT_MODEL,
    response_format: { type: "json_object" },
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 600,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  })
  const raw = response.choices[0]?.message?.content ?? ""
  return safeJsonParse<T>(raw)
}

export async function callAiText(opts: CallTextOpts): Promise<string> {
  const client = getClient()
  if (!client) return ""
  const response = await client.chat.completions.create({
    model: opts.model || DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 200,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  })
  return (response.choices[0]?.message?.content ?? "").trim()
}
