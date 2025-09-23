"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EventQRCodeService } from "@/lib/event-qr-service"
import { Download, QrCode } from "lucide-react"
import { GradientButton } from "@/components/ui/gradient-button"

interface FreshQRDisplayProps {
  className?: string
}

export function FreshQRDisplay({ className }: FreshQRDisplayProps) {
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const eventQRService = new EventQRCodeService()
        // Use URL-based QR code for better compatibility
        const qrCode = await eventQRService.generateEventQRCode('FRESH')
        
        if (qrCode) {
          setQrCodeDataURL(qrCode)
        } else {
          setError('Failed to generate QR code')
        }
      } catch (err) {
        console.error('Error generating FRESH QR code:', err)
        setError('Failed to generate QR code')
      } finally {
        setIsLoading(false)
      }
    }

    generateQRCode()
  }, [])

  const handleDownload = () => {
    if (!qrCodeDataURL) return
    
    const link = document.createElement('a')
    link.download = 'fresh-event-qr-code.png'
    link.href = qrCodeDataURL
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          FRESH Event QR Code
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
        
        {error && (
          <div className="text-center py-8">
            <p className="text-destructive">{error}</p>
          </div>
        )}
        
        {qrCodeDataURL && !isLoading && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <img 
                src={qrCodeDataURL} 
                alt="FRESH Event QR Code" 
                className="w-48 h-48 border rounded-lg"
              />
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Scan this QR code to join the FRESH networking event
              </p>
              <p className="text-xs text-muted-foreground">
                Event Code: <span className="font-mono font-semibold">FRESH</span>
              </p>
              <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                <p className="font-semibold mb-1">How it works:</p>
                <ul className="text-left space-y-1">
                  <li>• <strong>New users:</strong> Scan → Create account → Auto-join event</li>
                  <li>• <strong>Existing users:</strong> Scan → Auto-join event</li>
                </ul>
              </div>
            </div>
            
            <div className="flex justify-center">
              <GradientButton onClick={handleDownload} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download QR Code
              </GradientButton>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
