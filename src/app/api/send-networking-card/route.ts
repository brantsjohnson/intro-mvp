import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { EmailService } from '@/lib/email-service'
import { getNetworkingMetrics, type NetworkingData } from '@/lib/networking-metrics'
import { Database } from '@/lib/database.types'

export async function POST(request: NextRequest) {
  let eventId: string | undefined
  let userId: string | undefined
  try {
    const body = await request.json()
    eventId = body.eventId
    userId = body.userId

    if (!eventId || !userId) {
      return NextResponse.json(
        { error: 'eventId and userId are required' },
        { status: 400 }
      )
    }

    // Get networking metrics
    const metrics = await getNetworkingMetrics(eventId, userId)
    if (!metrics) {
      return NextResponse.json({ error: 'Failed to get metrics' }, { status: 400 })
    }

    // Get user email
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data: user } = await supabase.auth.admin.getUserById(userId)
    if (!user?.user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    // Build site URL for links
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || 'introevent.site'
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`

    // Create survey token for this attendee
    let surveyLink: string | undefined
    try {
      const result = await createSurveyToken(supabase, {
        eventId,
        userId,
        email: user.user.email,
        baseUrl,
      })
      surveyLink = result.surveyLink
      console.log('Survey token created successfully, link:', surveyLink)
    } catch (error) {
      console.error('Error creating survey token:', error)
      console.error('This usually means the migration 20251209_add_event_survey.sql has not been run.')
      console.error('Please run the migration to create the event_survey_tokens table.')
      // Continue without survey link - email will still be sent
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

    // Render HTML to PNG using Browserless (hosted Chrome) to avoid local Chrome deps
    const browserlessToken = process.env.BROWSERLESS_TOKEN
    if (!browserlessToken) {
      throw new Error('Missing BROWSERLESS_TOKEN env var for Browserless rendering')
    }

    // Convert HTML to a data URL for Browserless to load
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
    // Convert ArrayBuffer to Node Buffer
    const pngBuffer: Buffer = Buffer.from(new Uint8Array(screenshotArrayBuffer))

    // No DOM measurements available from Browserless screenshot; keep empty to skip overlays
    const cardBounds: Array<{ x: number; y: number; width: number; height: number }> = []

    // Keep image in full color to match website UI
    let finalBuffer = pngBuffer
    
    // Draw borders on the cards using Sharp (colored if available, gray if not)
    if (cardBounds.length > 0) {
      try {
        const hasColors = borderColors && borderColors.length > 0
        console.log(`Drawing ${hasColors ? 'colored' : 'gray'} borders on cards...`)
        
        // Create SVG overlays for each card border
        const borderOverlays = cardBounds.map((bounds: { x: number; y: number; width: number; height: number }, index: number) => {
          // Get color for this card (with fallbacks)
          const websiteBorderColor = 'rgba(190, 188, 184, 0.5)' // #BEBCB8 with opacity
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
            // Use website border color for all cards if no colors extracted
            color = websiteBorderColor
          }
          
          // Extract RGB from rgba string
          const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
          if (!rgbaMatch) {
            console.warn(`Invalid color format for card ${index}: ${color}`)
            return null
          }
          
          const r = rgbaMatch[1]
          const g = rgbaMatch[2]
          const b = rgbaMatch[3]
          
          console.log(`Card ${index} border color: rgb(${r}, ${g}, ${b})`)
          
          // Create SVG with website-style border (single border matching website design)
          const borderRadius = 16
          const borderWidth = 1.5 // Match website border width
          
          const svg = Buffer.from(`
            <svg width="${bounds.width}" height="${bounds.height}" xmlns="http://www.w3.org/2000/svg">
              <!-- Border matching website style (rounded rectangle) -->
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
          }).filter((overlay: { input: Buffer; left: number; top: number } | null): overlay is { input: Buffer; left: number; top: number } => overlay !== null)
        
        if (borderOverlays.length > 0) {
          // Composite the colored borders onto the final image
          finalBuffer = await sharp(finalBuffer)
            .composite(borderOverlays as Array<{ input: Buffer; left: number; top: number }>)
            .toBuffer()
          console.log(`Applied ${borderOverlays.length} colored borders`)
        }
      } catch (error) {
        console.error('Error drawing colored borders:', error)
        // Continue without colored borders if drawing fails
      }
    }

    // Generate email-compatible HTML card
    const emailCardHTML = generateEmailCardHTML(metrics, borderColors)

    // Send email with attachment
    const emailService = new EmailService()
    const result = await emailService.sendEmailWithAttachment({
      to: user.user.email,
      subject: `Your ${metrics.eventName} Networking Summary`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://fonts.googleapis.com/css2?family=Changa+One&family=Avenir+Next:wght@400;500&display=swap" rel="stylesheet">
          </head>
          <body style="font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3A3835; margin: 0; padding: 40px 20px; background-color: #EDEBE6;">
            <div style="max-width: 600px; margin: 0 auto;">
              <div style="background: rgba(237, 235, 230, 0.5); border: 1.5px solid #BEBCB8; border-radius: 56px; padding: 40px; box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.15);">
                <h1 style="font-family: 'Arial Bold', Arial, sans-serif; font-weight: bold; font-size: 28px; margin-bottom: 20px; color: #3A3835; text-transform: uppercase; letter-spacing: 0.02em;">Thank you for attending ${escapeHtml(metrics.eventName)}!</h1>
                <p style="font-size: 16px; margin-bottom: 20px; color: #3A3835;">Here's your networking summary:</p>
                ${surveyLink ? `
                <div style="background: rgba(237, 235, 230, 0.6); border: 1.5px solid #BEBCB8; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                  <p style="font-size: 15px; margin: 0 0 12px 0; color: #3A3835;">Before viewing your recap, can you answer 3 quick questions (incl. the organizer's custom one)?</p>
                  <div style="text-align: center;">
                    <a href="${surveyLink}" style="display: inline-block; background: #72A557; color: #FFFFFF; text-decoration: none; padding: 12px 20px; border-radius: 48px; font-weight: 500; border: none;">
                      Take the 30-second survey
                    </a>
                  </div>
                </div>
                ` : ''}
                
                <!-- Embedded HTML Card -->
                ${emailCardHTML}
                
                <!-- Download Section -->
                <div style="background: rgba(237, 235, 230, 0.6); border: 1.5px solid #BEBCB8; border-radius: 8px; padding: 16px; margin-top: 20px; text-align: center;">
                  <p style="font-size: 14px; color: #3A3835; margin: 0 0 12px 0;">Want to save or share your networking summary?</p>
                  <p style="font-size: 12px; color: #7D7A73; margin: 0;">Download the PNG version attached to this email</p>
                </div>
              </div>
              <p style="font-size: 12px; color: #7D7A73; margin-top: 24px; text-align: center;">
                Powered by <strong style="font-family: 'Changa One', cursive;">INTRO</strong>
              </p>
            </div>
          </body>
        </html>
      `,
      text: `Thanks for attending ${metrics.eventName}!${surveyLink ? ` Before viewing your recap, please answer a 30-second, 3-question survey: ${surveyLink}` : ''} Here's your networking summary:`,
      attachments: [{
        filename: 'networking-summary.png',
        content: finalBuffer,
        cid: 'networking-card',
      }],
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error generating networking card:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      eventId,
      userId,
    })
    return NextResponse.json(
      { 
        error: 'Failed to generate card', 
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    )
  }
}

async function createSurveyToken(
  supabase: SupabaseClient<Database>,
  params: { eventId: string; userId: string; email: string; baseUrl: string }
) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()

  const { error } = await supabase
    .from('event_survey_tokens')
    .insert({
      event_id: params.eventId,
      recipient_user_id: params.userId,
      recipient_email: params.email,
      token,
      expires_at: expiresAt,
    })

  if (error) {
    console.error('Error creating survey token:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    throw new Error(`Failed to create survey token: ${error.message || 'Unknown error'}`)
  }

  const normalizedBaseUrl = params.baseUrl.replace(/\/$/, '')

  return {
    token,
    surveyLink: `${normalizedBaseUrl}/survey/${token}`,
  }
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
    
    console.log(`Total colors found after filtering: ${colors.length}`)
    
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

function generateCardHTML(data: NetworkingData, borderColors?: string[]): string {
  // Default to website border color if no colors provided
  const defaultColor = 'rgba(190, 188, 184, 0.5)' // #BEBCB8 with opacity
  
  console.log('generateCardHTML called with borderColors:', borderColors)
  
  // Assign colors to cards (with fallbacks)
  const eventCardColor = borderColors && borderColors[0] ? borderColors[0] : defaultColor
  const companiesColor = borderColors && borderColors[1] ? borderColors[1] : (borderColors && borderColors[0] ? borderColors[0] : defaultColor)
  const connectionsColor = borderColors && borderColors[2] ? borderColors[2] : (borderColors && borderColors[0] ? borderColors[0] : defaultColor)
  const industriesColor = borderColors && borderColors[3] ? borderColors[3] : (borderColors && borderColors[0] ? borderColors[0] : defaultColor)
  const titlesColor = borderColors && borderColors[0] ? borderColors[0] : defaultColor
  
  console.log('Card border colors assigned:', {
    eventCard: eventCardColor,
    companies: companiesColor,
    connections: connectionsColor,
    industries: industriesColor,
    titles: titlesColor
  })
  
  // Load fonts from Google Fonts
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
            /* Logo stays in color - no grayscale filter */
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

function generateEmailCardHTML(data: NetworkingData, borderColors?: string[]): string {
  // Convert rgba colors to hex for better email client support
  const rgbaToHex = (rgba: string | undefined): string => {
    if (!rgba) return '#999999'
    // If already hex, return as is
    if (rgba.startsWith('#')) return rgba
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
    if (!match) return '#999999'
    const r = parseInt(match[1])
    const g = parseInt(match[2])
    const b = parseInt(match[3])
    return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`
  }

  const defaultColor = '#999999'
  const eventCardColor = rgbaToHex(borderColors?.[0])
  const companiesColor = rgbaToHex(borderColors?.[1] || borderColors?.[0])
  const connectionsColor = rgbaToHex(borderColors?.[2] || borderColors?.[0])
  const industriesColor = rgbaToHex(borderColors?.[3] || borderColors?.[0])
  const titlesColor = rgbaToHex(borderColors?.[0])

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <tr>
        <td style="padding: 20px;">
          <!-- Event Card -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px; border: 3px solid ${eventCardColor}; border-radius: 16px; background-color: #ffffff;">
            <tr>
              <td style="padding: 24px; text-align: center;">
                <p style="font-family: 'Changa One', Arial, sans-serif; font-size: 18px; text-transform: uppercase; color: #000000; margin: 0 0 12px 0; letter-spacing: -0.5px;">Event Attended:</p>
                ${data.eventLogoUrl ? `
                  <img src="${escapeHtml(data.eventLogoUrl)}" alt="${escapeHtml(data.eventName)}" style="max-width: 250px; max-height: 100px; height: auto; display: block; margin: 0 auto;" />
                ` : `
                  <h2 style="font-family: 'Changa One', Arial, sans-serif; font-size: 36px; color: #000000; margin: 0; line-height: 1.2;">${escapeHtml(data.eventName)}</h2>
                `}
              </td>
            </tr>
          </table>

          <!-- Two Column Layout -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- Left Column -->
              <td width="48%" valign="top" style="padding-right: 8px;">
                <!-- Top Companies -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px; border: 3px solid ${companiesColor}; border-radius: 16px; background-color: #ffffff;">
                  <tr>
                    <td style="padding: 20px;">
                      <h3 style="font-family: 'Changa One', Arial, sans-serif; font-size: 16px; text-transform: uppercase; color: #000000; margin: 0 0 12px 0; letter-spacing: -0.5px;">Top Companies:</h3>
                      <ul style="margin: 0; padding-left: 20px; list-style: none;">
                        ${data.topCompanies.length > 0 ? data.topCompanies.map(c => `
                          <li style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #000000; margin-bottom: 6px;">
                            <span style="font-weight: bold; margin-right: 6px;">•</span>${escapeHtml(c)}
                          </li>
                        `).join('') : `
                          <li style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #666666; font-style: italic;">No companies listed</li>
                        `}
                      </ul>
                    </td>
                  </tr>
                </table>
              </td>

              <!-- Right Column -->
              <td width="48%" valign="top" style="padding-left: 8px;">
                <!-- Connections Count -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px; border: 3px solid ${connectionsColor}; border-radius: 16px; background-color: #ffffff;">
                  <tr>
                    <td style="padding: 20px; text-align: center;">
                      <p style="font-family: 'Changa One', Arial, sans-serif; font-size: 16px; text-transform: uppercase; color: #000000; margin: 0 0 12px 0; letter-spacing: -0.5px;">Number of People Connected With:</p>
                      <div style="font-family: 'Changa One', Arial, sans-serif; font-size: 72px; font-weight: 400; line-height: 1; color: #000000; letter-spacing: -2px;">${data.connectionsCount}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Bottom Row -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- Top Industries -->
              <td width="48%" valign="top" style="padding-right: 8px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px; border: 3px solid ${industriesColor}; border-radius: 16px; background-color: #ffffff;">
                  <tr>
                    <td style="padding: 20px;">
                      <h3 style="font-family: 'Changa One', Arial, sans-serif; font-size: 16px; text-transform: uppercase; color: #000000; margin: 0 0 12px 0; letter-spacing: -0.5px;">Top Industries:</h3>
                      <ul style="margin: 0; padding-left: 20px; list-style: none;">
                        ${data.topIndustries.length > 0 ? data.topIndustries.map(i => `
                          <li style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #000000; margin-bottom: 6px;">
                            <span style="font-weight: bold; margin-right: 6px;">•</span>${escapeHtml(i)}
                          </li>
                        `).join('') : `
                          <li style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #666666; font-style: italic;">No industries listed</li>
                        `}
                      </ul>
                    </td>
                  </tr>
                </table>
              </td>

              <!-- Common Titles -->
              <td width="48%" valign="top" style="padding-left: 8px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px; border: 3px solid ${titlesColor}; border-radius: 16px; background-color: #ffffff;">
                  <tr>
                    <td style="padding: 20px;">
                      <h3 style="font-family: 'Changa One', Arial, sans-serif; font-size: 16px; text-transform: uppercase; color: #000000; margin: 0 0 12px 0; letter-spacing: -0.5px;">Most Common Titles:</h3>
                      <ul style="margin: 0; padding-left: 20px; list-style: none;">
                        ${data.commonTitles.length > 0 ? data.commonTitles.map(t => `
                          <li style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #000000; margin-bottom: 6px;">
                            <span style="font-weight: bold; margin-right: 6px;">•</span>${escapeHtml(t)}
                          </li>
                        `).join('') : `
                          <li style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #666666; font-style: italic;">No titles listed</li>
                        `}
                      </ul>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 16px 0; text-align: center;">
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #333333; margin: 0;">
                  Powered by <strong>Intro</strong><br />
                  <span style="font-size: 11px;">introevent.site</span>
                  ${data.sponsor ? `<br /><span style="margin-top: 8px; display: block;">Sponsored by <strong>${escapeHtml(data.sponsor)}</strong></span>` : ''}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}


