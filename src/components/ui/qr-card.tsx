"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { QrCode, Camera, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { QRCodeService } from "@/lib/qr-service"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"

interface QRCardProps {
  onScanClick: () => void
  className?: string
}

export function QRCard({ onScanClick, className }: QRCardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const qrService = new QRCodeService()
  const supabase = createClientComponentClient()

  const generateQRCode = async () => {
    try {
      setIsGenerating(true)
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('You must be logged in to generate QR code')
        return
      }

      // Get current user's event
      const eventId = await qrService.getCurrentUserEventId(user.id)
      if (!eventId) {
        toast.error('You must be in an event to generate QR code')
        return
      }

      // Generate QR code
      const url = await qrService.generateQRCode(user.id, eventId)
      if (url) {
        setQrCodeUrl(url)
      } else {
        toast.error('Failed to generate QR code')
      }
    } catch (error) {
      console.error('Error generating QR code:', error)
      toast.error('Failed to generate QR code')
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    generateQRCode()
  }, [])

  return (
    <div className={cn("space-y-3", className)}>
      {isGenerating ? (
        <div className="flex justify-center">
          <div className="w-40 h-40 bg-muted rounded-xl flex items-center justify-center">
            <RefreshCw className="h-10 w-10 text-muted-foreground animate-spin" />
          </div>
        </div>
      ) : qrCodeUrl ? (
        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <Image 
              src={qrCodeUrl} 
              alt="Your QR Code" 
              width={160}
              height={160}
              className="w-40 h-40"
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="w-40 h-40 bg-muted rounded-xl flex items-center justify-center">
            <QrCode className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>
      )}
      
      <div className="text-center">
        <GradientButton 
          onClick={onScanClick}
          className="w-full max-w-xs mx-auto"
          size="default"
        >
          <Camera className="h-4 w-4 mr-2" />
          Scan a QR code
        </GradientButton>
      </div>
    </div>
  )
}
