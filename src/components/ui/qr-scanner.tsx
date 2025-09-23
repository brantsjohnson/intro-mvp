"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GradientButton } from "@/components/ui/gradient-button"
import { QRCodeService, QRCodeData } from "@/lib/qr-service"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { X, Camera, CameraOff } from "lucide-react"

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onConnectionCreated?: () => void
}

export function QRScanner({ isOpen, onClose, onConnectionCreated }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const qrService = new QRCodeService()
  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    if (isOpen) {
      startScanning()
    } else {
      stopScanning()
    }

    return () => {
      stopScanning()
    }
  }, [isOpen])

  const startScanning = async () => {
    try {
      // Check for camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      setHasPermission(true)
      stream.getTracks().forEach(track => track.stop()) // Stop the test stream

      // Initialize the reader with better error handling
      readerRef.current = new BrowserMultiFormatReader()
      
      // Start scanning
      setIsScanning(true)
      await readerRef.current.decodeFromVideoDevice(
        undefined, // Use default camera
        videoRef.current!,
        (result, error) => {
          if (result) {
            handleQRCodeResult(result.getText())
          }
          // Only log meaningful errors, ignore common "not found" errors
          if (error && 
              error.name !== 'NotFoundException' && 
              !error.message?.includes('No MultiFormat Readers') &&
              !error.message?.includes('No QR code found')) {
            console.warn('QR scan warning:', error.message)
          }
        }
      )
    } catch (error) {
      console.error('Error starting QR scanner:', error)
      setHasPermission(false)
      toast.error('Camera access denied or not available')
    }
  }

  const stopScanning = () => {
    if (readerRef.current) {
      try {
        // Try to reset if the method exists
        if (typeof readerRef.current.reset === 'function') {
          readerRef.current.reset()
        }
      } catch (error) {
        console.warn('Error resetting QR reader:', error)
      }
      readerRef.current = null
    }
    setIsScanning(false)
  }

  const handleQRCodeResult = async (content: string) => {
    try {
      // Parse QR code data
      const qrData = qrService.parseQRCodeData(content)
      if (!qrData) {
        toast.error('Invalid QR code')
        return
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('You must be logged in to view profiles')
        return
      }

      // Validate that both users are in the same event
      const { data: scannerEventMember } = await supabase
        .from('event_members')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('event_id', qrData.eventId)
        .single()

      if (!scannerEventMember) {
        toast.error('You must be in the same event to view this profile')
        return
      }

      // Just navigate to the profile - don't create connection automatically
      // The user can decide to connect from the profile page
      stopScanning()
      onClose()
      
      // Navigate to the scanned user's profile
      router.push(`/profile/${qrData.userId}?source=qr&eventId=${qrData.eventId}`)
      
      toast.success('Profile found! You can connect from their profile page.')
    } catch (error) {
      console.error('Error handling QR code result:', error)
      toast.error('Failed to process QR code')
    }
  }

  const handleClose = () => {
    stopScanning()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan QR Code</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasPermission === false ? (
            <div className="text-center py-8">
              <CameraOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Camera access is required to scan QR codes
              </p>
              <GradientButton onClick={startScanning}>
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </GradientButton>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full h-64 bg-black rounded-lg object-cover"
                playsInline
                muted
              />
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-primary rounded-lg bg-transparent">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg"></div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Point your camera at a QR code to connect with someone
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
