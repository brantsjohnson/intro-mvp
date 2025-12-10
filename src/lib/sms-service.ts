/**
 * SMS Service for sending notifications via Twilio
 * 
 * Environment variables required:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_PHONE_NUMBER (the phone number to send from)
 */

interface SendSMSOptions {
  to: string
  message: string
}

interface SendSMSResult {
  success: boolean
  messageId?: string
  error?: string
}

export class SMSService {
  private accountSid: string | undefined
  private authToken: string | undefined
  private fromNumber: string | undefined

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID
    this.authToken = process.env.TWILIO_AUTH_TOKEN
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER
  }

  /**
   * Check if SMS service is configured
   */
  isConfigured(): boolean {
    return !!(this.accountSid && this.authToken && this.fromNumber)
  }

  /**
   * Send an SMS message
   */
  async sendSMS({ to, message }: SendSMSOptions): Promise<SendSMSResult> {
    if (!this.isConfigured()) {
      console.warn('SMS service not configured - missing Twilio credentials')
      return {
        success: false,
        error: 'SMS service not configured'
      }
    }

    try {
      // Normalize phone number (remove any non-digit characters except +)
      const normalizedTo = this.normalizePhoneNumber(to)
      
      if (!normalizedTo) {
        return {
          success: false,
          error: 'Invalid phone number format'
        }
      }

      // Use Twilio REST API
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`
      
      const body = new URLSearchParams({
        From: this.fromNumber!,
        To: normalizedTo,
        Body: message
      })

      // Create basic auth header (Node.js compatible)
      const credentials = `${this.accountSid}:${this.authToken}`
      // Use Buffer if available (Node.js), otherwise use btoa (browser)
      let encodedCredentials: string
      if (typeof Buffer !== 'undefined') {
        encodedCredentials = Buffer.from(credentials).toString('base64')
      } else {
        encodedCredentials = btoa(credentials)
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encodedCredentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('Twilio API error:', data)
        return {
          success: false,
          error: data.message || 'Failed to send SMS'
        }
      }

      return {
        success: true,
        messageId: data.sid
      }
    } catch (error) {
      console.error('Error sending SMS:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Normalize phone number to E.164 format
   * Accepts formats like: +1234567890, (123) 456-7890, 123-456-7890, etc.
   */
  private normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null

    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '')

    // If it starts with +, keep it
    if (cleaned.startsWith('+')) {
      return cleaned
    }

    // If it's 10 digits, assume US number and add +1
    if (cleaned.length === 10) {
      return `+1${cleaned}`
    }

    // If it's 11 digits and starts with 1, add +
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`
    }

    // If it already has country code, add +
    if (cleaned.length > 10) {
      return `+${cleaned}`
    }

    return null
  }

  /**
   * Send a message notification SMS
   */
  async sendMessageNotification(
    recipientPhone: string,
    senderName: string,
    link: string = 'introevent.site'
  ): Promise<SendSMSResult> {
    const message = `You have a new message from ${senderName} on Intro. View: ${link}`
    return this.sendSMS({
      to: recipientPhone,
      message
    })
  }
}

