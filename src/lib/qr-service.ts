import QRCode from 'qrcode'
import { createClientComponentClient } from '@/lib/supabase'

export interface QRCodeData {
  userId: string
  eventId: string
  timestamp: number
}

export class QRCodeService {
  private supabase = createClientComponentClient() as any

  /**
   * Generate a QR code for a user in a specific event
   */
  async generateQRCode(userId: string, eventId: string): Promise<string | null> {
    try {
      // Create QR code data
      const qrData: QRCodeData = {
        userId,
        eventId,
        timestamp: Date.now()
      }

      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })

      // For now, return the data URL directly to avoid storage issues
      // This is more reliable and doesn't require storage permissions
      return qrCodeDataURL

      // TODO: Re-enable storage upload once storage policies are confirmed working
      /*
      // Upload to Supabase storage
      const fileName = `${userId}/${eventId}-${Date.now()}.png`
      const response = await fetch(qrCodeDataURL)
      const blob = await response.blob()
      
      const { data, error } = await this.supabase.storage
        .from('qr')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true
        })

      if (error) {
        console.error('Error uploading QR code:', error)
        // If upload fails, return the data URL directly as fallback
        return qrCodeDataURL
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from('qr')
        .getPublicUrl(fileName)

      return urlData.publicUrl
      */
    } catch (error) {
      console.error('Error generating QR code:', error)
      return null
    }
  }

  /**
   * Parse QR code data from scanned content
   */
  parseQRCodeData(content: string): QRCodeData | null {
    try {
      const data = JSON.parse(content)
      
      // Validate the structure
      if (!data.userId || !data.eventId || !data.timestamp) {
        return null
      }

      // Check if QR code is not too old (24 hours)
      const now = Date.now()
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      if (now - data.timestamp > maxAge) {
        return null
      }

      return data as QRCodeData
    } catch (error) {
      console.error('Error parsing QR code:', error)
      return null
    }
  }

  /**
   * Create a connection between two users when QR code is scanned
   * Returns the connection result object with success status and user IDs
   */
  async createConnectionFromQR(
    scannerUserId: string,
    qrData: QRCodeData
  ): Promise<{ success: boolean; scannerUserId?: string; targetUserId?: string; eventId?: string; alreadyConnected?: boolean; error?: string }> {
    try {
      console.log('Creating connection from QR:', { scannerUserId, qrData })
      
      // Don't allow self-connection
      if (scannerUserId === qrData.userId) {
        return { success: false, error: 'Cannot connect to yourself' }
      }

      const response = await fetch('/api/connect-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scannerUserId,
          targetUserId: qrData.userId,
          eventId: qrData.eventId,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        console.error('connect-qr error', payload)
        // Return error details so it can be displayed
        return { 
          success: false, 
          error: payload.error || payload.details || 'Failed to create connection' 
        }
      }

      // Return the payload with success status
      return {
        success: true,
        ...payload
      }
    } catch (error: any) {
      console.error('Error creating connection:', error)
      return { 
        success: false, 
        error: error?.message || 'An unexpected error occurred while creating the connection' 
      }
    }
  }

  /**
   * Get current user's event ID
   */
  async getCurrentUserEventId(userId: string): Promise<string | null> {
    try {
      // Use attendance table (new schema) and get most recent event
      const { data, error } = await this.supabase
        .from('attendance')
        .select('event_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error || !data) {
        console.error('Error getting user event ID:', error)
        return null
      }

      return data.event_id
    } catch (error) {
      console.error('Error getting user event ID:', error)
      return null
    }
  }
}
