import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { getNetworkingMetrics } from '@/lib/networking-metrics'
import { Database } from '@/lib/database.types'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey)
}

async function fetchToken(supabase: ReturnType<typeof getSupabase>, token: string) {
  const { data, error } = await supabase
    .from('event_survey_tokens')
    .select('event_id, recipient_user_id')
    .eq('token', token)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const params = await context.params
    const tokenValue = params?.token
    if (!tokenValue) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const supabase = getSupabase()
    const tokenRow = await fetchToken(supabase, tokenValue)

    if (!tokenRow || !tokenRow.recipient_user_id) {
      return NextResponse.json({ error: 'Invalid survey token' }, { status: 404 })
    }

    // Get networking metrics
    const metrics = await getNetworkingMetrics(tokenRow.event_id, tokenRow.recipient_user_id)
    if (!metrics) {
      return NextResponse.json({ error: 'Failed to get metrics' }, { status: 400 })
    }

    // Extract logo colors if logo exists
    let borderColors: string[] | undefined = undefined
    if (metrics.eventLogoUrl) {
      try {
        const logoResponse = await fetch(metrics.eventLogoUrl)
        if (logoResponse.ok) {
          const logoBuffer = Buffer.from(await logoResponse.arrayBuffer())
          borderColors = await extractLogoColors(logoBuffer)
          if (borderColors.length > 0) {
            borderColors = borderColors.map(color => makeColorSubtle(color, 0.4))
          }
        }
      } catch (error) {
        console.error('Error extracting logo colors:', error)
      }
    }

    // Generate HTML for the card
    const html = generateCardHTML(metrics, borderColors)

    // Render HTML to PNG using Puppeteer
    const puppeteer = await import('puppeteer-core')
    const chromium = await import('@sparticuz/chromium')
    
    const browser = await puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
    
    let pngBuffer: Buffer
    let contentHeight: number
    let cardBounds: Array<{ x: number; y: number; width: number; height: number }> = []
    
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1200, height: 800 })
      await page.setContent(html, { waitUntil: 'networkidle0' })
      
      contentHeight = await page.evaluate(() => {
        return Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        )
      })
      
      await page.setViewport({ width: 1200, height: contentHeight + 20 })
      
      const bounds = await page.evaluate(() => {
        const cards = document.querySelectorAll('.card')
        return Array.from(cards).map(card => {
          const rect = card.getBoundingClientRect()
          return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        })
      })
      cardBounds = bounds
      
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      pngBuffer = Buffer.from(screenshot)
    } finally {
      await browser.close()
    }

    // Draw borders on cards
    let finalBuffer = pngBuffer
    if (cardBounds.length > 0) {
      try {
        const hasColors = borderColors && borderColors.length > 0
        const websiteBorderColor = 'rgba(190, 188, 184, 0.5)'
        
        const borderOverlays = cardBounds.map((bounds, index) => {
          let color: string
          if (hasColors && borderColors) {
            if (index === 0) {
              color = borderColors[0] || websiteBorderColor
            } else if (index === 1) {
              color = borderColors[1] || borderColors[0] || websiteBorderColor
            } else if (index === 2) {
              color = borderColors[2] || borderColors[0] || websiteBorderColor
            } else if (index === 3) {
              color = borderColors[3] || borderColors[0] || websiteBorderColor
            } else {
              color = borderColors[0] || websiteBorderColor
            }
          } else {
            color = websiteBorderColor
          }
          
          const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
          if (!rgbaMatch) return null
          
          const r = rgbaMatch[1]
          const g = rgbaMatch[2]
          const b = rgbaMatch[3]
          const borderRadius = 16
          const borderWidth = 1.5
          
          const svg = Buffer.from(`
            <svg width="${bounds.width}" height="${bounds.height}" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="${bounds.width}" height="${bounds.height}" 
                    rx="${borderRadius}" ry="${borderRadius}" 
                    fill="none" stroke="rgb(${r},${g},${b})" stroke-width="${borderWidth}" />
            </svg>
          `)
          
          return {
            input: svg,
            left: bounds.x,
            top: bounds.y
          }
        }).filter((overlay): overlay is { input: Buffer; left: number; top: number } => overlay !== null)
        
        if (borderOverlays.length > 0) {
          finalBuffer = await sharp(finalBuffer)
            .composite(borderOverlays)
            .toBuffer()
        }
      } catch (error) {
        console.error('Error drawing borders:', error)
      }
    }

    // Convert to base64 data URL
    const base64 = finalBuffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return NextResponse.json({ imageUrl: dataUrl })
  } catch (error) {
    console.error('Error generating networking card:', error)
    return NextResponse.json(
      { error: 'Failed to generate card', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper functions from send-networking-card route
function isWhiteColor(r: number, g: number, b: number, threshold: number = 220): boolean {
  return r >= threshold && g >= threshold && b >= threshold
}

function isBlackColor(r: number, g: number, b: number, threshold: number = 30): boolean {
  return r <= threshold && g <= threshold && b <= threshold
}

function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return 0
  return ((max - min) / max) * 100
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2))
}

async function extractLogoColors(logoBuffer: Buffer): Promise<string[]> {
  try {
    const resized = await sharp(logoBuffer)
      .resize(200, 200, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    const { data, info } = resized
    const width = info.width
    const height = info.height
    const channels = info.channels
    
    const gridSize = 4
    const colorMap = new Map<string, { r: number; g: number; b: number; count: number; saturation: number }>()
    
    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        const idx = (y * width + x) * channels
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        
        const brightness = (r + g + b) / 3
        const saturation = getSaturation(r, g, b)
        
        if (isWhiteColor(r, g, b, 240)) continue
        if (isBlackColor(r, g, b, 15)) continue
        if (brightness > 220 && saturation < 5) continue
        
        const qr = Math.round(r / 10) * 10
        const qg = Math.round(g / 10) * 10
        const qb = Math.round(b / 10) * 10
        const key = `${qr},${qg},${qb}`
        
        if (colorMap.has(key)) {
          const existing = colorMap.get(key)!
          existing.count++
        } else {
          colorMap.set(key, { r: qr, g: qg, b: qb, count: 1, saturation })
        }
      }
    }
    
    const colors = Array.from(colorMap.entries())
      .map(([_, color]) => color)
      .sort((a, b) => {
        if (Math.abs(a.saturation - b.saturation) > 5) {
          return b.saturation - a.saturation
        }
        return b.count - a.count
      })
    
    const uniqueColors: string[] = []
    for (const color of colors) {
      const hex = `#${[color.r, color.g, color.b].map(x => {
        const hex = Math.round(x).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')}`
      
      let tooSimilar = false
      for (const existingHex of uniqueColors) {
        const existingRgb = existingHex.slice(1).match(/.{2}/g)!.map(x => parseInt(x, 16))
        const distance = colorDistance(color.r, color.g, color.b, existingRgb[0], existingRgb[1], existingRgb[2])
        if (distance < 30) {
          tooSimilar = true
          break
        }
      }
      
      if (!tooSimilar) {
        uniqueColors.push(hex)
        if (uniqueColors.length >= 4) break
      }
    }
    
    return uniqueColors
  } catch (error) {
    console.error('Error extracting logo colors:', error)
    return []
  }
}

function makeColorSubtle(hex: string, opacity: number = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  
  const lightenFactor = 0.6
  const lightR = Math.round(r + (255 - r) * lightenFactor)
  const lightG = Math.round(g + (255 - g) * lightenFactor)
  const lightB = Math.round(b + (255 - b) * lightenFactor)
  
  return `rgba(${lightR}, ${lightG}, ${lightB}, ${opacity})`
}

function generateCardHTML(data: Awaited<ReturnType<typeof getNetworkingMetrics>>, borderColors?: string[]): string {
  const defaultColor = 'rgba(190, 188, 184, 0.5)'
  
  const eventCardColor = borderColors && borderColors[0] ? borderColors[0] : defaultColor
  const companiesColor = borderColors && borderColors[1] ? borderColors[1] : (borderColors && borderColors[0] ? borderColors[0] : defaultColor)
  const connectionsColor = borderColors && borderColors[2] ? borderColors[2] : (borderColors && borderColors[0] ? borderColors[0] : defaultColor)
  const industriesColor = borderColors && borderColors[3] ? borderColors[3] : (borderColors && borderColors[0] ? borderColors[0] : defaultColor)
  const titlesColor = borderColors && borderColors[0] ? borderColors[0] : defaultColor
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Changa+One&family=Avenir+Next:wght@400;500&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #EDEBE6;
            padding: 32px;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
          }
          .card {
            border: 1.5px solid #BEBCB8;
            border-radius: 16px;
            padding: 32px;
            background: rgba(237, 235, 230, 0.5);
            box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.15);
          }
          .event-card {
            min-height: 220px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
          }
          .event-logo {
            max-width: 300px;
            max-height: 120px;
            margin-bottom: 16px;
            object-fit: contain;
          }
          .event-label {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            color: #3A3835;
            margin-bottom: 12px;
            font-family: 'Arial Bold', Arial, sans-serif;
          }
          .event-name {
            font-size: 48px;
            font-weight: bold;
            line-height: 1.2;
            color: #3A3835;
            font-family: 'Arial Bold', Arial, sans-serif;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .connections-card {
            min-height: 280px;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .connections-label {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            color: #3A3835;
            margin-bottom: 16px;
            font-family: 'Arial Bold', Arial, sans-serif;
          }
          .connections-count {
            font-size: 144px;
            font-weight: bold;
            line-height: 1;
            letter-spacing: 0.02em;
            color: #3A3835;
            font-family: 'Arial Bold', Arial, sans-serif;
          }
          .list-title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            margin-bottom: 16px;
            color: #3A3835;
            font-family: 'Arial Bold', Arial, sans-serif;
          }
          .list-item {
            display: flex;
            align-items: start;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 16px;
            color: #3A3835;
            font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .bullet {
            color: #3A3835;
            font-weight: bold;
            margin-top: 2px;
          }
          .titles-grid {
            grid-column: 1 / -1;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px 32px;
          }
          .footer {
            grid-column: 1 / -1;
            text-align: center;
            padding-top: 16px;
            font-size: 12px;
            color: #7D7A73;
            font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .text-muted {
            color: #7D7A73;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card event-card" style="border-color: ${eventCardColor};">
            <p class="event-label">Event Attended:</p>
            ${data.eventLogoUrl ? `
              <img src="${escapeHtml(data.eventLogoUrl)}" alt="Event Logo" class="event-logo" />
            ` : `
            <h2 class="event-name">${escapeHtml(data.eventName)}</h2>
            `}
          </div>
          
          <div class="card" style="border-color: ${companiesColor};">
            <h3 class="list-title">Top Companies:</h3>
            <ul>
              ${data.topCompanies.length > 0 ? data.topCompanies.map(c => `
                <li class="list-item">
                  <span class="bullet">•</span>
                  <span>${escapeHtml(c)}</span>
                </li>
              `).join('') : '<li class="list-item"><span class="text-muted">No companies listed</span></li>'}
            </ul>
          </div>

          <div class="card connections-card" style="border-color: ${connectionsColor};">
            <p class="connections-label">Number of People Connected With:</p>
            <div class="connections-count">${data.connectionsCount}</div>
          </div>

          <div class="card" style="border-color: ${industriesColor};">
            <h3 class="list-title">Top Industries:</h3>
            <ul>
              ${data.topIndustries.length > 0 ? data.topIndustries.map(i => `
                <li class="list-item">
                  <span class="bullet">•</span>
                  <span>${escapeHtml(i)}</span>
                </li>
              `).join('') : '<li class="list-item"><span class="text-muted">No industries listed</span></li>'}
            </ul>
          </div>

          <div class="card titles-grid" style="border-color: ${titlesColor};">
            <h3 class="list-title" style="grid-column: 1 / -1;">Most Common Titles:</h3>
            ${data.commonTitles.length > 0 ? data.commonTitles.map(t => `
              <div class="list-item">
                <span class="bullet">•</span>
                <span>${escapeHtml(t)}</span>
              </div>
            `).join('') : '<div class="list-item" style="grid-column: 1 / -1;"><span class="text-muted">No titles listed</span></div>'}
          </div>

          <div class="footer">
            <p>Powered by <strong style="font-family: 'Changa One', cursive;">INTRO</strong></p>
            <p style="font-size: 11px; margin-top: 4px;">introevent.site</p>
            ${data.sponsor ? `<p style="margin-top: 8px;">Sponsored by <strong>${escapeHtml(data.sponsor)}</strong></p>` : ''}
          </div>
        </div>
      </body>
    </html>
  `
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}
