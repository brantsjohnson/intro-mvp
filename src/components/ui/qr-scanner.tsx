"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GradientButton } from "@/components/ui/gradient-button"
import { QRCodeService, QRCodeData } from "@/lib/qr-service"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { X, Camera, CameraOff, AlertCircle } from "lucide-react"

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onConnectionCreated?: () => void
}

export function QRScanner({ isOpen, onClose, onConnectionCreated }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processedCodesRef = useRef<Set<string>>(new Set())
  const qrService = new QRCodeService()
  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    if (isOpen) {
      setError(null)
      setIsProcessing(false)
      processedCodesRef.current.clear() // Reset processed codes when opening
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
      // Get camera permission and stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      setHasPermission(true)
      streamRef.current = stream
      
      // Set video element source
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Initialize the reader
      readerRef.current = new BrowserMultiFormatReader()
      
      // Start scanning
      setIsScanning(true)
      
      await readerRef.current.decodeFromVideoDevice(
        undefined, // Use default camera
        videoRef.current!,
        (result, error) => {
          // Stop processing if already processing or scanner is closed
          if (isProcessing || !isOpen) {
            return
          }
          
          if (result) {
            const qrText = result.getText()
            // Prevent processing the same QR code multiple times
            if (!processedCodesRef.current.has(qrText)) {
              processedCodesRef.current.add(qrText)
              handleQRCodeResult(qrText)
            }
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
      setIsScanning(false)
    }
  }

  const stopScanning = () => {
    // Stop the video stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      streamRef.current = null
    }
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    
    // Stop the QR reader
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
    // Prevent multiple simultaneous scans
    if (isProcessing) {
      console.log('Already processing, ignoring duplicate scan')
      return
    }
    
    // Stop scanning immediately to prevent re-detection
    stopScanning()
    
    try {
      setIsProcessing(true)
      setError(null)
      
      // Parse QR code data
      const qrData = qrService.parseQRCodeData(content)
      if (!qrData) {
        setError("Invalid QR code. Please scan a valid Intro QR code.")
        setIsProcessing(false)
        return
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("You must be logged in to scan QR codes.")
        setIsProcessing(false)
        return
      }

      // Prevent scanning your own QR code
      if (user.id === qrData.userId) {
        setError("You cannot scan your own QR code.")
        setIsProcessing(false)
        return
      }

      // Validate that both users are in the same event
      const { data: scannerEventMember, error: scannerError } = await supabase
        .from('attendance')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('event_id', qrData.eventId)
        .maybeSingle()

      if (scannerError || !scannerEventMember) {
        setError("You must be registered for this event to connect with attendees.")
        setIsProcessing(false)
        return
      }

      // Create connection automatically since they're meeting in person via QR scan
      const result = await qrService.createConnectionFromQR(user.id, qrData)
      if (result && result.success) {
        onConnectionCreated?.()
        
        // Close the dialog immediately
        onClose()
        
        // Navigate to the scanned user's profile after closing
        setTimeout(() => {
          router.push(`/profile/${qrData.userId}?source=qr&eventId=${qrData.eventId}`)
        }, 200)
      } else {
        setError("Failed to create connection. Please try again.")
        setIsProcessing(false)
      }
    } catch (error: any) {
      console.error('Error handling QR code result:', error)
      const errorMessage = error?.message || "An error occurred while scanning. Please try again."
      setError(errorMessage)
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    stopScanning()
    setError(null)
    setIsProcessing(false)
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

          <div className="text-center space-y-3">
            {error && (
              <div className="flex items-center justify-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <p>Connecting...</p>
              </div>
            )}
            {!isProcessing && !error && (
              <p className="text-sm text-muted-foreground">
                Point your camera at a QR code to connect with someone
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
