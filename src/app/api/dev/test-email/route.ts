/**
 * Development API endpoint for testing emails
 * 
 * This endpoint allows you to test email sending without running a script.
 * 
 * POST /api/dev/test-email
 * Body: {
 *   email: string (required) - Your email address
 *   type: 'message' | 'networking' | 'all' (default: 'all')
 *   eventId?: string - Optional, for networking card with real data
 *   userId?: string - Optional, for networking card with real data
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { EmailService } from '@/lib/email-service'
import { getNetworkingMetrics } from '@/lib/networking-metrics'
import sharp from 'sharp'

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

/**
 * Check if a color is too close to white
 */
function isWhiteColor(r: number, g: number, b: number, threshold: number = 220): boolean {
  // A color is considered white if all RGB channels are above the threshold
  return r >= threshold && g >= threshold && b >= threshold
}

/**
 * Check if a color is too close to black
 */
function isBlackColor(r: number, g: number, b: number, threshold: number = 30): boolean {
  // A color is considered black if all RGB channels are below the threshold
  return r <= threshold && g <= threshold && b <= threshold
}

/**
 * Calculate color saturation (how vibrant/colorful the color is)
 */
function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return 0
  return ((max - min) / max) * 100
}

/**
 * Calculate color distance between two RGB colors
 */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2))
}

/**
 * Extract dominant colors from logo image, focusing on non-white colors
 */
async function extractLogoColors(logoBuffer: Buffer): Promise<string[]> {
  try {
    // Resize logo to a consistent size for processing
    const resized = await sharp(logoBuffer)
      .resize(200, 200, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    const { data, info } = resized
    const width = info.width
    const height = info.height
    const channels = info.channels
    
    // Sample pixels in a grid pattern for consistent results
    const gridSize = 4 // Sample every 4th pixel (more samples = better color detection)
    const colorMap = new Map<string, { r: number; g: number; b: number; count: number; saturation: number }>()
    
    let totalPixels = 0
    let skippedWhite = 0
    let skippedBlack = 0
    let skippedGray = 0
    
    // Sample pixels systematically across the image
    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        totalPixels++
        const idx = (y * width + x) * channels
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        
        const brightness = (r + g + b) / 3
        const saturation = getSaturation(r, g, b)
        
        // Skip white colors (all channels high) - more strict threshold
        if (isWhiteColor(r, g, b, 240)) {
          skippedWhite++
          continue
        }
        
        // Skip black colors (all channels low) - more strict threshold
        if (isBlackColor(r, g, b, 15)) {
          skippedBlack++
          continue
        }
        
        // Skip very light gray colors (low saturation, high brightness) - relaxed filter
        if (brightness > 220 && saturation < 5) {
          skippedGray++
          continue
        }
        
        // Quantize colors to reduce similar variations (round to nearest 10)
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
    
    console.log(`Pixel sampling stats: total=${totalPixels}, skipped white=${skippedWhite}, skipped black=${skippedBlack}, skipped gray=${skippedGray}, kept=${colorMap.size}`)
    
    // Convert to array and sort by frequency and saturation (prioritize vibrant colors)
    const colors = Array.from(colorMap.entries())
      .map(([_, color]) => color)
      .sort((a, b) => {
        // First sort by saturation (more vibrant first), then by frequency
        if (Math.abs(a.saturation - b.saturation) > 5) {
          return b.saturation - a.saturation
        }
        return b.count - a.count
      })
    
    // Remove colors that are too similar to each other
    const uniqueColors: string[] = []
    for (const color of colors) {
      const hex = `#${[color.r, color.g, color.b].map(x => {
        const hex = Math.round(x).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')}`
      
      // Check if this color is too similar to any already selected color
      let tooSimilar = false
      for (const existingHex of uniqueColors) {
        const existingRgb = existingHex.slice(1).match(/.{2}/g)!.map(x => parseInt(x, 16))
        const distance = colorDistance(color.r, color.g, color.b, existingRgb[0], existingRgb[1], existingRgb[2])
        if (distance < 30) { // Colors are too similar if distance < 30
          tooSimilar = true
          break
        }
      }
      
      if (!tooSimilar) {
        uniqueColors.push(hex)
        console.log(`Extracted color: ${hex} (rgb(${color.r}, ${color.g}, ${color.b}), saturation: ${color.saturation.toFixed(1)}%, count: ${color.count})`)
        if (uniqueColors.length >= 4) break
      }
    }
    
    console.log(`Total unique colors extracted: ${uniqueColors.length}`)
    
    // If no colors were extracted, try a more lenient approach
    if (uniqueColors.length === 0 && colors.length > 0) {
      console.log('No unique colors after similarity filtering, using top colors anyway...')
      // Just take the top colors without similarity filtering
      for (let i = 0; i < Math.min(4, colors.length); i++) {
        const color = colors[i]
        const hex = `#${[color.r, color.g, color.b].map(x => {
          const hex = Math.round(x).toString(16)
          return hex.length === 1 ? '0' + hex : hex
        }).join('')}`
        uniqueColors.push(hex)
        console.log(`Using color (fallback): ${hex} (rgb(${color.r}, ${color.g}, ${color.b}), saturation: ${color.saturation.toFixed(1)}%, count: ${color.count})`)
      }
    }
    
    // If still no colors, try even more lenient filtering - accept any non-pure-white/black
    if (uniqueColors.length === 0 && colorMap.size === 0) {
      console.log('Trying ultra-lenient color extraction - accepting any non-pure white/black...')
      // Re-sample with very lenient filtering
      for (let y = 0; y < height; y += gridSize) {
        for (let x = 0; x < width; x += gridSize) {
          const idx = (y * width + x) * channels
          const r = data[idx]
          const g = data[idx + 1]
          const b = data[idx + 2]
          
          // Only skip pure white (255,255,255) and pure black (0,0,0)
          if (r === 255 && g === 255 && b === 255) continue
          if (r === 0 && g === 0 && b === 0) continue
          
          const qr = Math.round(r / 10) * 10
          const qg = Math.round(g / 10) * 10
          const qb = Math.round(b / 10) * 10
          const key = `${qr},${qg},${qb}`
          
          if (!colorMap.has(key)) {
            const saturation = getSaturation(r, g, b)
            colorMap.set(key, { r: qr, g: qg, b: qb, count: 1, saturation })
          } else {
            colorMap.get(key)!.count++
          }
        }
      }
      
      // Get top colors from this ultra-lenient pass
      const lenientColors = Array.from(colorMap.entries())
        .map(([_, color]) => color)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
      
      for (const color of lenientColors) {
        const hex = `#${[color.r, color.g, color.b].map(x => {
          const hex = Math.round(x).toString(16)
          return hex.length === 1 ? '0' + hex : hex
        }).join('')}`
        uniqueColors.push(hex)
        console.log(`Using color (ultra-lenient fallback): ${hex} (rgb(${color.r}, ${color.g}, ${color.b}), count: ${color.count})`)
      }
    }
    
    if (uniqueColors.length === 0) {
      console.log('WARNING: No colors extracted - all pixels were filtered out. Check filtering thresholds.')
    }
    return uniqueColors
  } catch (error) {
    console.error('Error extracting logo colors:', error)
    return [] // Fallback to default gray
  }
}

/**
 * Convert hex color to subtle rgba format
 */
function makeColorSubtle(hex: string, opacity: number = 0.4): string {
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  
  // Lighten the color by mixing with white (60% white, 40% original color)
  const lightenFactor = 0.6
  const lightR = Math.round(r + (255 - r) * lightenFactor)
  const lightG = Math.round(g + (255 - g) * lightenFactor)
  const lightB = Math.round(b + (255 - b) * lightenFactor)
  
  return `rgba(${lightR}, ${lightG}, ${lightB}, ${opacity})`
}

function generateCardHTML(data: {
  eventName: string
  connectionsCount: number
  topCompanies: string[]
  topIndustries: string[]
  commonTitles: string[]
  eventLogoUrl?: string | null
  softwareProvider: string
  sponsor?: string
}, borderColors?: string[]): string {
  // Default to subtle gray if no colors provided
  const defaultColor = 'rgba(153, 153, 153, 0.5)'
  
  // Assign colors to cards (with fallbacks)
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
        <link href="https://fonts.googleapis.com/css2?family=Changa+One&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Changa One', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: white;
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
            border: none;
            border-radius: 16px;
            padding: 32px;
            background: white;
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
            /* Logo stays in color - no grayscale filter */
          }
          .event-label {
            font-size: 20px;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: -0.01em;
            color: #000;
            margin-bottom: 12px;
            font-family: 'Changa One', cursive;
          }
          .event-name {
            font-size: 48px;
            font-weight: 400;
            line-height: 1.2;
            color: #000;
            font-family: 'Changa One', cursive;
          }
          .connections-card {
            min-height: 280px;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .connections-label {
            font-size: 20px;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: -0.01em;
            color: #000;
            margin-bottom: 16px;
            font-family: 'Changa One', cursive;
          }
          .connections-count {
            font-size: 144px;
            font-weight: 400;
            line-height: 1;
            letter-spacing: -0.02em;
            color: #000;
            font-family: 'Changa One', cursive;
          }
          .list-title {
            font-size: 20px;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: -0.01em;
            margin-bottom: 16px;
            color: #000;
            font-family: 'Changa One', cursive;
          }
          .list-item {
            display: flex;
            align-items: start;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 16px;
            color: #000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .bullet {
            color: #000;
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
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .text-muted {
            color: #666;
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
            <p>Powered by <strong>Intro</strong></p>
            <p style="font-size: 11px; margin-top: 4px;">introevent.site</p>
            ${data.sponsor ? `<p style="margin-top: 8px;">Sponsored by <strong>${escapeHtml(data.sponsor)}</strong></p>` : ''}
          </div>
        </div>
      </body>
    </html>
  `
}

function createMockMetrics() {
  return {
    eventName: 'Test Networking Event 2024',
    connectionsCount: 12,
    topCompanies: ['Tech Corp', 'Startup Inc', 'Innovation Labs', 'Digital Solutions'],
    topIndustries: ['Technology', 'Software', 'SaaS', 'AI/ML'],
    commonTitles: ['Software Engineer', 'Product Manager', 'Designer', 'Founder', 'CTO'],
    eventLogoUrl: null,
    softwareProvider: 'introevent',
    sponsor: undefined,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, type = 'all', eventId, userId } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      )
    }

    const emailService = new EmailService()

    if (!emailService.isConfigured()) {
      return NextResponse.json(
        { error: 'Email service not configured. Please set RESEND_API_KEY in your environment.' },
        { status: 500 }
      )
    }

    const results: Record<string, any> = {}

    // Test message notification
    if (type === 'message' || type === 'all') {
      const messageResult = await emailService.sendMessageNotification(
        email,
        'Test Sender',
        'This is a test message preview to verify that email notifications are working correctly!'
      )
      results.message = messageResult
    }

    // Test networking card
    if (type === 'networking' || type === 'all') {
      let metrics: {
        eventName: string
        connectionsCount: number
        topCompanies: string[]
        topIndustries: string[]
        commonTitles: string[]
        eventLogoUrl?: string | null
        softwareProvider: string
        sponsor?: string
      }

      if (eventId && userId) {
        // Use real data from the database
        const realMetrics = await getNetworkingMetrics(eventId, userId)
        if (!realMetrics) {
          metrics = createMockMetrics()
        } else {
          metrics = realMetrics
        }
      } else {
        // Use mock data
        metrics = createMockMetrics()
      }

      // Extract logo colors if logo exists (for border colors)
      let borderColors: string[] | undefined = undefined
      if (metrics.eventLogoUrl) {
        try {
          console.log('Attempting to extract colors from logo:', metrics.eventLogoUrl)
          // Fetch the logo image
          const logoResponse = await fetch(metrics.eventLogoUrl)
          console.log('Logo fetch response status:', logoResponse.status, logoResponse.ok)
          if (logoResponse.ok) {
            const logoBuffer = Buffer.from(await logoResponse.arrayBuffer())
            console.log('Logo buffer size:', logoBuffer.length)
            const extractedColors = await extractLogoColors(logoBuffer)
            console.log('Extracted colors (hex):', extractedColors)
            if (extractedColors.length > 0) {
              // Convert to subtle rgba colors
              borderColors = extractedColors.map(color => makeColorSubtle(color, 0.4))
              console.log('Border colors (rgba):', borderColors)
            } else {
              console.log('No colors extracted from logo (all filtered out or extraction failed)')
            }
          } else {
            console.error('Failed to fetch logo:', logoResponse.status, logoResponse.statusText)
          }
        } catch (error) {
          console.error('Error extracting logo colors for borders:', error)
          // Continue with default gray borders
        }
      } else {
        console.log('No logo URL in metrics, using default gray borders')
      }

      // Generate HTML for the card with border colors
      const html = generateCardHTML(metrics, borderColors)

      // Render via Browserless to avoid local Chrome dependency
      const browserlessToken = process.env.BROWSERLESS_TOKEN
      if (!browserlessToken) {
        throw new Error('Missing BROWSERLESS_TOKEN env var for Browserless rendering')
      }

      const htmlBase64 = Buffer.from(html, 'utf8').toString('base64')
      const dataUrl = `data:text/html;base64,${htmlBase64}`

      const browserlessUrl = `https://chrome.browserless.io/screenshot?token=${browserlessToken}`
      const response = await fetch(browserlessUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: dataUrl,
          options: {
            viewport: { width: 1200, height: 800 },
            fullPage: true,
            waitUntil: 'networkidle0',
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Browserless screenshot failed: ${response.status} ${text}`)
      }

      const screenshotArrayBuffer = await response.arrayBuffer()
      const pngBuffer: Buffer = Buffer.from(new Uint8Array(screenshotArrayBuffer))

      // For simplicity in this dev endpoint, skip logo/border overlays
      const finalBuffer = pngBuffer

      // Send email with attachment
      const networkingResult = await emailService.sendEmailWithAttachment({
        to: email,
        subject: `Your ${metrics.eventName} Networking Summary`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; margin-bottom: 20px;">Thank you for attending ${escapeHtml(metrics.eventName)}!</h1>
              <p style="font-size: 16px; margin-bottom: 20px;">Here's your networking summary:</p>
              <img src="cid:networking-card" alt="Networking Summary" style="width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;" />
              <p style="font-size: 14px; color: #666; margin-top: 20px; text-align: center;">
                Powered by <strong>Intro</strong><br />
                <span style="font-size: 12px;">introevent.site</span>
              </p>
            </body>
          </html>
        `,
        attachments: [{
          filename: 'networking-summary.png',
          content: finalBuffer,
          cid: 'networking-card',
        }],
      })

      results.networking = networkingResult
    }

    const allSuccess = Object.values(results).every((r: any) => r.success)

    return NextResponse.json({
      success: allSuccess,
      results,
      message: allSuccess 
        ? `Emails sent successfully to ${email}. Check your inbox!`
        : 'Some emails failed to send. Check the results for details.',
    })
  } catch (error) {
    console.error('Error in test-email API:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

