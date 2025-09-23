import QRCode from 'qrcode'

export interface EventQRCodeData {
  eventCode: string
  type: 'event_join'
}

export class EventQRCodeService {
  /**
   * Generate a URL-based QR code for an event
   * This creates a QR code that opens the app directly with the event code
   */
  async generateEventQRCode(eventCode: string, baseUrl?: string): Promise<string | null> {
    try {
      // Use the provided baseUrl or detect the current domain
      let url = baseUrl
      if (!url) {
        // In browser environment, use current origin
        if (typeof window !== 'undefined') {
          url = window.location.origin
        } else {
          // Fallback for server-side rendering
          url = process.env.NEXT_PUBLIC_APP_URL || 'https://intro-au217wail-brant-johnsons-projects.vercel.app'
        }
      }
      const eventUrl = `${url}/event/join?code=${eventCode.toUpperCase()}`
      
      // Generate QR code with the URL
      const qrCodeDataURL = await QRCode.toDataURL(eventUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })

      return qrCodeDataURL
    } catch (error) {
      console.error('Error generating event QR code:', error)
      return null
    }
  }

  /**
   * Generate a simple QR code that contains just the event code as text
   * This is even simpler - just the 5-character event code
   */
  async generateSimpleEventQRCode(eventCode: string): Promise<string | null> {
    try {
      // Generate QR code with just the event code as text
      const qrCodeDataURL = await QRCode.toDataURL(eventCode.toUpperCase(), {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })

      return qrCodeDataURL
    } catch (error) {
      console.error('Error generating simple event QR code:', error)
      return null
    }
  }

  /**
   * Parse QR code data from scanned content
   */
  parseEventQRCodeData(content: string): string | null {
    try {
      // First try to parse as JSON (structured format)
      const data = JSON.parse(content)
      
      if (data.eventCode && data.type === 'event_join') {
        return data.eventCode
      }
      
      return null
    } catch (error) {
      // If JSON parsing fails, check if it's just a simple event code
      const trimmedContent = content.trim().toUpperCase()
      
      // Check if it's a valid 5-character event code
      if (trimmedContent.length === 5 && /^[A-Z0-9]+$/.test(trimmedContent)) {
        return trimmedContent
      }
      
      console.error('Error parsing event QR code:', error)
      return null
    }
  }
}
