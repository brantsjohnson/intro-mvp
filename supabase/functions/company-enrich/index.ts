// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts"

function normalizeUrl(input: string): { url: string; domain: string } {
  let s = input.trim()
  if (!/^https?:\/\//i.test(s)) s = "https://" + s
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./i, "")
    u.pathname = "/"
    u.search = ""
    u.hash = ""
    return { url: u.toString(), domain: host }
  } catch {
    return { url: s, domain: s.replace(/^https?:\/\//i, "").replace(/^www\./i, "") }
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "INTRO-enricher/1.0" } })
    if (!res.ok) return null
    const text = await res.text()
    return text
  } catch {
    return null
  }
}

function extractMeta(html: string, name: string, attr: "name" | "property" = "name"): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i")
  const m = html.match(re)
  return m?.[1]?.trim() || null
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim() || null
}

function extractJsonLd(html: string): { name?: string; description?: string } | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(m[1])
      const candidate = Array.isArray(obj) ? obj.find((o) => o["@type"] === "Organization") : obj
      if (candidate && (candidate.name || candidate.description)) {
        return { name: candidate.name, description: candidate.description }
      }
    } catch {
      continue
    }
  }
  return null
}

function bestCompanyName(domain: string, html?: string | null): string {
  if (!html) {
    return domain.split(".")[0]
  }
  const ld = extractJsonLd(html)
  const ogSite = extractMeta(html, "og:site_name", "property")
  const ogTitle = extractMeta(html, "og:title", "property")
  const title = extractTitle(html)
  const candidates = [ld?.name, ogSite, ogTitle, title].filter(Boolean) as string[]
  if (candidates.length) return candidates[0]!
  return domain.split(".")[0]
}

function bestDescription(html?: string | null): string | null {
  if (!html) return null
  const ld = extractJsonLd(html)
  const metaDesc = extractMeta(html, "description", "name")
  const ogDesc = extractMeta(html, "og:description", "property")
  const candidates = [ld?.description, metaDesc, ogDesc].filter(Boolean) as string[]
  if (!candidates.length) return null
  const desc = candidates[0]!
  // Clean up whitespace
  return desc.replace(/\s+/g, " ").trim()
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }
  try {
    const body = await req.json()
    const raw = String(body?.url || "")
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, error: "url required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }
    const norm = normalizeUrl(raw)
    const html = await fetchHtml(norm.url)
    const companyName = bestCompanyName(norm.domain, html)
    const description = bestDescription(html) || ""
    return new Response(
      JSON.stringify({
        ok: true,
        domain: norm.domain,
        url: norm.url,
        company_name: companyName,
        company_description: description
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})


