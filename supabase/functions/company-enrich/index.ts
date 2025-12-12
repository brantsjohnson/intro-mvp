// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts"
import OpenAI from "https://esm.sh/openai@4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  // Match when attribute comes before content (common)
  const primary = new RegExp(
    `<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  )
  const primaryMatch = html.match(primary)
  if (primaryMatch?.[1]) {
    return primaryMatch[1].trim()
  }

  // Match when content appears before the attribute (some sites use this order)
  const alternate = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${name}["'][^>]*>`,
    "i"
  )
  const altMatch = html.match(alternate)
  if (altMatch?.[1]) {
    return altMatch[1].trim()
  }

  return null
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

function cleanCompanyNameFromTitle(title: string): string {
  // Common separators: dash, pipe, colon, em dash, en dash
  // Extract just the company name part before the separator
  const separators = /[\s]*[-–—|:]\s*/
  const parts = title.split(separators)
  if (parts.length > 1) {
    // Take the first part and trim it
    const cleaned = parts[0]!.trim()
    // Only use it if it's reasonable length (not too short, not too long)
    if (cleaned.length > 1 && cleaned.length < 50) {
      return cleaned
    }
  }
  // If no separator or cleaned name is unreasonable, return original
  return title.trim()
}

function bestCompanyName(domain: string, html?: string | null): string {
  if (!html) {
    return domain.split(".")[0]
  }
  const ld = extractJsonLd(html)
  const ogSite = extractMeta(html, "og:site_name", "property")
  const ogTitle = extractMeta(html, "og:title", "property")
  const title = extractTitle(html)
  
  // Prioritize: JSON-LD name > og:site_name > cleaned og:title > cleaned title
  // JSON-LD and og:site_name are usually just the company name
  if (ld?.name) return ld.name.trim()
  if (ogSite) return ogSite.trim()
  
  // For og:title and title, clean them to extract just the company name
  if (ogTitle) {
    const cleaned = cleanCompanyNameFromTitle(ogTitle)
    if (cleaned) return cleaned
  }
  if (title) {
    const cleaned = cleanCompanyNameFromTitle(title)
    if (cleaned) return cleaned
  }
  
  return domain.split(".")[0]
}

function extractTextContent(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  
  // Extract title
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch?.[1]?.trim() || ''
  
  // Extract headings (h1-h3)
  const headings = []
  const h1Matches = text.matchAll(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi)
  for (const match of h1Matches) {
    if (match[1]) headings.push(match[1].trim())
  }
  
  // Extract first few paragraphs
  const paragraphs = []
  const pMatches = text.matchAll(/<p[^>]*>([^<]+)<\/p>/gi)
  for (const match of pMatches) {
    if (match[1] && paragraphs.length < 3) {
      paragraphs.push(match[1].trim())
    }
  }
  
  // Combine and limit length
  const content = [title, ...headings.slice(0, 3), ...paragraphs.slice(0, 2)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2000) // Limit to 2000 chars for AI
  
  return content
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

async function generateDescriptionWithAI(companyName: string, html: string): Promise<string | null> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.log('[company-enrich] No OPENAI_API_KEY found, skipping AI description generation')
    return null
  }
  
  try {
    const openai = new OpenAI({ apiKey: openaiApiKey })
    const textContent = extractTextContent(html)
    
    if (!textContent || textContent.length < 20) {
      console.log('[company-enrich] Insufficient text content for AI generation')
      return null
    }
    
    const prompt = `Based on the following website content, write a brief, professional description of ${companyName}. 
    
Website content:
${textContent}

Write a concise 1-2 sentence description that explains what ${companyName} does. Be specific and professional. Return only the description, nothing else.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at writing concise company descriptions. Return only the description text, nothing else.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 150
    })
    
    const description = completion.choices[0]?.message?.content?.trim() || null
    if (description) {
      console.log('[company-enrich] AI-generated description:', description.substring(0, 100))
    }
    return description
  } catch (error) {
    console.error('[company-enrich] Error generating AI description:', error)
    return null
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { 
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
  try {
    const body = await req.json()
    const raw = String(body?.url || "")
    console.log('[company-enrich] Received request for URL:', raw)
    
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, error: "url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }
    const norm = normalizeUrl(raw)
    console.log('[company-enrich] Normalized URL:', norm.url, 'Domain:', norm.domain)
    
    const html = await fetchHtml(norm.url)
    console.log('[company-enrich] Fetched HTML, length:', html?.length || 0)
    
    const companyName = bestCompanyName(norm.domain, html)
    let description = bestDescription(html)
    
    // If no description from meta tags, try AI generation
    if (!description && html) {
      console.log('[company-enrich] No meta description found, attempting AI generation...')
      description = await generateDescriptionWithAI(companyName, html)
    }
    
    // Fallback to empty string if still no description
    description = description || ""
    
    console.log('[company-enrich] Extracted name:', companyName, 'Description:', description ? description.substring(0, 50) : '(empty)')
    
    const response = {
      ok: true,
      domain: norm.domain,
      url: norm.url,
      company_name: companyName,
      company_description: description
    }
    
    console.log('[company-enrich] Returning response:', JSON.stringify(response))
    
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e) {
    console.error('[company-enrich] Error:', e)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})


