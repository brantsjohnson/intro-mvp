import * as React from "react"
import { GradientButton } from "@/components/ui/gradient-button"
import { Camera, ArrowRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrowserQRCodeReader } from "@zxing/browser"
import { EventQRCodeService } from "@/lib/event-qr-service"

interface EventJoinScannerProps {
  onJoinEvent: (eventCode: string) => void
  onScanQR: () => void
  isLoading?: boolean
  className?: string
}

export function EventJoinScanner({ 
  onJoinEvent, 
  onScanQR, 
  isLoading = false,
  className 
}: EventJoinScannerProps) {
  const [eventCode, setEventCode] = React.useState<string[]>(["", "", "", "", "", ""])
  const [isScanning, setIsScanning] = React.useState(false)
  const [scanError, setScanError] = React.useState<string | null>(null)
  const [isProcessing, setIsProcessing] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const codeReader = React.useRef<BrowserQRCodeReader | null>(null)
  const activeStreamRef = React.useRef<MediaStream | null>(null)
  const eventQRService = React.useRef(new EventQRCodeService())
  const lastScanTime = React.useRef<number>(0)
  const scanCooldown = 1000 // 1 second cooldown between scans
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([])

  const handleDigitChange = (index: number, value: string) => {
    // Only allow alphanumeric characters
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (sanitized.length > 1) {
      // If pasting multiple characters, distribute them
      const chars = sanitized.split('').slice(0, 6)
      const newCode = [...eventCode]
      chars.forEach((char, i) => {
        if (index + i < 6) {
          newCode[index + i] = char
        }
      })
      setEventCode(newCode)
      // Focus the next empty input or the last one
      const nextIndex = Math.min(index + chars.length, 5)
      inputRefs.current[nextIndex]?.focus()
    } else {
      const newCode = [...eventCode]
      newCode[index] = sanitized
      setEventCode(newCode)
      
      // Auto-focus next input
      if (sanitized && index < 5) {
        inputRefs.current[index + 1]?.focus()
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !eventCode[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    const newCode = [...eventCode]
    pasted.split('').forEach((char, i) => {
      if (i < 6) {
        newCode[i] = char
      }
    })
    setEventCode(newCode)
    // Focus the last filled input or the last one
    const lastFilledIndex = Math.min(pasted.length - 1, 5)
    inputRefs.current[lastFilledIndex]?.focus()
  }

  const fullEventCode = eventCode.join('')
  const isCodeComplete = fullEventCode.length === 6

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isCodeComplete) {
      onJoinEvent(fullEventCode)
    }
  }

  const startScanning = async () => {
    try {
      setScanError(null)
      setIsScanning(true)
      console.log('Starting QR scanner...')
    } catch (error) {
      console.error('Error starting QR scanner:', error)
      setScanError('Failed to start camera. Please check permissions.')
      setIsScanning(false)
    }
  }

  const stopScanning = () => {
    // Stop all video tracks
    const videoEl = videoRef.current
    const stream = (videoEl?.srcObject as MediaStream | null) || activeStreamRef.current
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    if (videoEl) {
      videoEl.srcObject = null
    }
    activeStreamRef.current = null
    
    // Reset the code reader
    if (codeReader.current) {
      codeReader.current = null
    }
    
    setIsScanning(false)
    setScanError(null)
    setIsProcessing(false)
  }

  React.useEffect(() => {
    if (!isScanning) return

    let didCancel = false

    const init = async () => {
      try {
        console.log('Initializing QR scanner...')
        
        // Check if camera is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera not supported on this device')
        }

        // Prompt for camera permission first to avoid zxing swallowing the error
        await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: false
        }).then(stream => {
          // Immediately stop the probe stream; zxing will request its own
          stream.getTracks().forEach(t => t.stop())
          console.log('Camera permission granted')
        }).catch((error) => { 
          console.error('Camera permission denied:', error)
          throw new Error('Camera access denied. Please allow camera access and try again.')
        })

        if (!codeReader.current) {
          codeReader.current = new BrowserQRCodeReader()
          console.log('QR code reader initialized')
        }

        const videoElement = videoRef.current
        if (!videoElement) {
          throw new Error('Video element not found')
        }

        await codeReader.current.decodeFromVideoDevice(
          undefined,
          videoElement,
          (result, error) => {
            if (didCancel) return
            const streamFromVideo = (videoElement as HTMLVideoElement).srcObject as MediaStream | null
            if (streamFromVideo) {
              activeStreamRef.current = streamFromVideo
            }
            if (result) {
              const currentTime = Date.now()
              
              // Implement cooldown to prevent rapid duplicate scans
              if (currentTime - lastScanTime.current < scanCooldown) {
                return
              }
              lastScanTime.current = currentTime
              
              const scannedText = result.getText()
              console.log('QR Code scanned:', scannedText)
              
              // Try to parse as structured event QR code first
              const parsedEventCode = eventQRService.current.parseEventQRCodeData(scannedText)
              console.log('Parsed event code:', parsedEventCode)
              
              if (parsedEventCode) {
                console.log('Stopping scanner and joining event with parsed code')
                setIsProcessing(true)
                stopScanning()
                onJoinEvent(parsedEventCode)
                return
              }
              
              // Fallback to simple 6-character event code
              if (scannedText && scannedText.length === 6 && /^[A-Z0-9]+$/.test(scannedText)) {
                console.log('Stopping scanner and joining event with simple code')
                setIsProcessing(true)
                stopScanning()
                onJoinEvent(scannedText)
                return
              }
            }
            if (error && !(error instanceof Error && error.name === 'NotFoundException')) {
              // Only log meaningful errors, not the constant "not found" errors
              if (error instanceof Error && error.message && !error.message.includes('No MultiFormat Readers')) {
                console.warn('QR scan error:', error.message)
              }
            }
          }
        )
      } catch (error) {
        console.error('Failed to start QR scanning:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to access camera. Please check permissions.'
        setScanError(errorMessage)
        setIsScanning(false)
      }
    }

    init()

    return () => {
      didCancel = true
      stopScanning()
    }
  }, [isScanning, onJoinEvent])

  return (
    <div className={cn("space-y-6", className)}>
      {/* Title and Subtitle */}
      <div className="text-center space-y-2">
        <p className="text-sm text-foreground">Enter 6 digit code or scan QR code to join.</p>
      </div>

      {/* 6-Digit Code Input */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex justify-center items-center gap-2">
          {eventCode.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              type="text"
              inputMode="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className={cn(
                "w-12 h-14 text-center text-xl font-semibold rounded-lg border-2 bg-muted/40 text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
                "transition-all",
                digit ? "border-primary" : "border-border"
              )}
              disabled={isLoading}
            />
          ))}
        </div>
        
        <div className="flex justify-center">
          <GradientButton 
            type="submit"
            disabled={!isCodeComplete || isLoading}
            className="max-w-xs rounded-full py-3 text-base font-medium"
          >
            {isLoading ? (
              "Joining..."
            ) : (
              <>
                Add Event Code
                <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </GradientButton>
        </div>
      </form>

      {/* Divider with OR */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-border"></div>
        </div>
        <div className="relative flex justify-center items-center">
          <div className="flex-1 border-t-2 border-border"></div>
          <span className="px-4 text-foreground text-2xl font-semibold">OR</span>
          <div className="flex-1 border-t-2 border-border"></div>
        </div>
      </div>

      {/* QR Scanner Box */}
      <div className="space-y-3">
        {isScanning ? (
          <div className="space-y-3">
            <div className="relative w-full aspect-square max-w-sm mx-auto bg-black rounded-2xl overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
            </div>
            {isProcessing && (
              <div className="flex items-center justify-center space-x-2 text-primary">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <p className="text-sm text-foreground">Processing QR code...</p>
              </div>
            )}
            {scanError && (
              <p className="text-destructive text-sm text-center">{scanError}</p>
            )}
            <div className="flex justify-center">
              <GradientButton 
                onClick={stopScanning}
                variant="outline"
                className="max-w-xs rounded-full py-3 text-base font-medium"
              >
                <X className="h-5 w-5 mr-2" />
                Stop Scanning
              </GradientButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative w-full aspect-square max-w-sm mx-auto bg-muted/30 rounded-2xl flex items-center justify-center border-2 border-border">
              <GradientButton 
                onClick={startScanning}
                disabled={isLoading}
                className="rounded-full py-3 px-6 text-base font-medium"
              >
                <Camera className="h-5 w-5 mr-2" />
                Scan QR Code
              </GradientButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
