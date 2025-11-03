import QRCode from 'qrcode'
import { createClientComponentClient } from '@/lib/supabase'
import { toast } from 'sonner'

export interface QRCodeData {
  userId: string
  eventId: string
  timestamp: number
}

export class QRCodeService {
  private supabase = createClientComponentClient()

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
        toast.error('This QR code has expired')
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
   */
  async createConnectionFromQR(
    scannerUserId: string,
    qrData: QRCodeData
  ): Promise<boolean> {
    try {
      console.log('Creating connection from QR:', { scannerUserId, qrData })
      
      // Don't allow self-connection
      if (scannerUserId === qrData.userId) {
        toast.error('You cannot connect with yourself')
        return false
      }

      // Check if both users are in the same event
      const { data: scannerEventMember } = await this.supabase
        .from('attendance')
        .select('event_id')
        .eq('user_id', scannerUserId)
        .eq('event_id', qrData.eventId)
        .maybeSingle()

      if (!scannerEventMember) {
        toast.error('You must be in the same event to connect')
        return false
      }

      // Check if connection already exists
      // Ensure a_id < b_id for consistent lookup
      const [aId, bId] = scannerUserId < qrData.userId 
        ? [scannerUserId, qrData.userId]
        : [qrData.userId, scannerUserId]
      
      const { data: existingConnection } = await this.supabase
        .from('connections')
        .select('event_id, a_id, b_id')
        .eq('event_id', qrData.eventId)
        .eq('a_id', aId)
        .eq('b_id', bId)
        .maybeSingle()

      if (existingConnection) {
        toast.info('You are already connected with this person')
        return false
      }

      // Create the connection directly
      const { data, error } = await this.supabase
        .from('connections')
        .insert({
          event_id: qrData.eventId,
          a_id: scannerUserId,
          b_id: qrData.userId,
          connection_kind: 'user_added',
          user_add_method: 'qr',
          created_by_user_id: scannerUserId
        })
        .select()

      if (error) {
        console.error('Error creating connection:', error)
        // If it's a duplicate key error, that's actually fine
        if (error.code === '23505') {
          toast.info('You are already connected with this person')
          return true
        }
        toast.error('Failed to create connection')
        return false
      }

      console.log('Connection created successfully:', data)
      toast.success('Connection created successfully!')
      return true
    } catch (error) {
      console.error('Error creating connection:', error)
      toast.error('Failed to create connection')
      return false
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
