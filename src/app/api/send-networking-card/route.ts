import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { EmailService } from '@/lib/email-service'
import { getNetworkingMetrics, type NetworkingData } from '@/lib/networking-metrics'

export async function POST(request: NextRequest) {
  try {
    const { eventId, userId } = await request.json()

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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data: user } = await supabase.auth.admin.getUserById(userId)
    if (!user?.user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    // Generate HTML for the card (black and white)
    const html = generateCardHTML(metrics)

    // Convert HTML to PNG using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    
    let pngBuffer: Buffer
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      await page.setViewport({ width: 1200, height: 1600 })
      
      // Take screenshot
      const screenshot = await page.screenshot({ type: 'png' })
      pngBuffer = Buffer.from(screenshot as ArrayBuffer)
    } finally {
      await browser.close()
    }

    // Convert to true grayscale using Sharp
    const grayscaleBuffer = await sharp(pngBuffer)
      .grayscale()
      .toBuffer()

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
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="font-size: 24px; margin-bottom: 20px;">Thank you for attending ${escapeHtml(metrics.eventName)}!</h1>
            <p style="font-size: 16px; margin-bottom: 20px;">Here's your networking summary:</p>
            <img src="cid:networking-card" alt="Networking Summary" style="width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;" />
            <p style="font-size: 14px; color: #666; margin-top: 20px; text-align: center;">
              Networking software provided by <strong>introevent</strong>
            </p>
          </body>
        </html>
      `,
      attachments: [{
        filename: 'networking-summary.png',
        content: grayscaleBuffer,
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
    return NextResponse.json(
      { error: 'Failed to generate card', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function generateCardHTML(data: NetworkingData): string {
  // Load Changa One font from Google Fonts
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
            border: 2px solid #000;
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
            max-width: 200px;
            max-height: 80px;
            margin-bottom: 16px;
            object-fit: contain;
            filter: grayscale(100%);
          }
          .event-label {
            font-size: 14px;
            font-weight: 500;
            color: #333;
            margin-bottom: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
            font-size: 14px;
            font-weight: 500;
            color: #333;
            margin-bottom: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
          <div class="card event-card">
            ${data.eventLogoUrl ? `
              <img src="${escapeHtml(data.eventLogoUrl)}" alt="Event Logo" class="event-logo" />
            ` : ''}
            <p class="event-label">Event Attended:</p>
            <h2 class="event-name">${escapeHtml(data.eventName)}</h2>
          </div>
          
          <div class="card">
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

          <div class="card connections-card">
            <p class="connections-label">Number of People Connected With:</p>
            <div class="connections-count">${data.connectionsCount}</div>
          </div>

          <div class="card">
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

          <div class="card titles-grid">
            <h3 class="list-title" style="grid-column: 1 / -1;">Most Common Titles:</h3>
            ${data.commonTitles.length > 0 ? data.commonTitles.map(t => `
              <div class="list-item">
                <span class="bullet">•</span>
                <span>${escapeHtml(t)}</span>
              </div>
            `).join('') : '<div class="list-item" style="grid-column: 1 / -1;"><span class="text-muted">No titles listed</span></div>'}
          </div>

          <div class="footer">
            <p>Networking software provided by <strong>${escapeHtml(data.softwareProvider)}</strong></p>
            ${data.sponsor ? `<p>Sponsored by <strong>${escapeHtml(data.sponsor)}</strong></p>` : ''}
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


