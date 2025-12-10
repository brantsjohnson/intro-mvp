import QRCode from 'qrcode'
import { encryptEventCode } from './event-code-encryption'

export interface EventQRCodeData {
  eventCode: string
  type: 'event_join'
}

export class EventQRCodeService {
  /**
   * Generate a URL-based QR code for an event using encrypted code
   * This creates a QR code that opens the app directly with the encrypted event code
   * Users will skip the join page and be auto-added to the event
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
          url = process.env.NEXT_PUBLIC_APP_URL || 'https://www.introevent.site'
        }
      }
      
      // Encrypt the event code for the URL
      const encryptedCode = encryptEventCode(eventCode.toUpperCase())
      const eventUrl = `${url}/join/${encryptedCode}`
      
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
   * Generate an encrypted join URL for an event
   * Returns the full URL that can be shared
   */
  generateEncryptedJoinUrl(eventCode: string, baseUrl?: string): string {
    const encryptedCode = encryptEventCode(eventCode.toUpperCase())
    const url = baseUrl || (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || 'https://www.introevent.site')
    return `${url}/join/${encryptedCode}`
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
   * Parse QR code data from scanned content - optimized for speed
   */
  parseEventQRCodeData(content: string): string | null {
    // Add null/undefined check first
    if (!content || typeof content !== 'string') {
      return null
    }
    
    const trimmedContent = content.trim()
    
    // Fast path: Check if it's just a simple 6-character event code first (most common case)
    const upperTrimmed = trimmedContent.toUpperCase()
    if (upperTrimmed.length === 6 && /^[A-Z0-9]+$/.test(upperTrimmed)) {
      return upperTrimmed
    }
    
    // Check if it's a URL with event code (common case) - DON'T convert to uppercase for URL parsing
    if (trimmedContent && typeof trimmedContent === 'string' && trimmedContent.toLowerCase().includes('code=')) {
      try {
        const url = new URL(trimmedContent)
        const eventCode = url.searchParams.get('code')
        if (eventCode && eventCode.length === 6 && /^[A-Z0-9]+$/i.test(eventCode)) {
          return eventCode.toUpperCase()
        }
      } catch (urlError) {
        // Not a valid URL, continue
      }
    }
    
    // Last resort: try JSON parsing (least common case)
    try {
      const data = JSON.parse(content)
      if (data && data.eventCode && data.type === 'event_join') {
        return data.eventCode.toUpperCase()
      }
    } catch (error) {
      // Not JSON, that's fine
    }
    
    return null
  }
}
