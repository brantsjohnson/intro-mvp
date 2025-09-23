import * as React from "react"
import { Input } from "@/components/ui/input"
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
  const [eventCode, setEventCode] = React.useState("")
  const [isScanning, setIsScanning] = React.useState(false)
  const [scanError, setScanError] = React.useState<string | null>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const codeReader = React.useRef<BrowserQRCodeReader | null>(null)
  const activeStreamRef = React.useRef<MediaStream | null>(null)
  const eventQRService = React.useRef(new EventQRCodeService())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (eventCode.trim().length === 5) {
      onJoinEvent(eventCode.trim().toUpperCase())
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (value.length <= 5) {
      setEventCode(value)
    }
  }

  const startScanning = async () => {
    // Only flip the flag here; actual initialization runs in the effect
    setScanError(null)
    setIsScanning(true)
  }

  const stopScanning = () => {
    if (codeReader.current) {
      codeReader.current.reset()
    }
    const videoEl = videoRef.current
    const stream = (videoEl?.srcObject as MediaStream | null) || activeStreamRef.current
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    if (videoEl) {
      videoEl.srcObject = null
    }
    activeStreamRef.current = null
    setIsScanning(false)
    setScanError(null)
  }

  React.useEffect(() => {
    if (!isScanning) return

    let didCancel = false

    const init = async () => {
      try {
        // Prompt for camera permission first to avoid zxing swallowing the error
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        }).then(stream => {
          // Immediately stop the probe stream; zxing will request its own
          stream.getTracks().forEach(t => t.stop())
        }).catch(() => { /* ignore - zxing will try again */ })

        if (!codeReader.current) {
          codeReader.current = new BrowserQRCodeReader()
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
              const scannedText = result.getText()
              
              // Try to parse as structured event QR code first
              const parsedEventCode = eventQRService.current.parseEventQRCodeData(scannedText)
              if (parsedEventCode) {
                stopScanning()
                onJoinEvent(parsedEventCode)
                return
              }
              
              // Fallback to simple 5-character event code
              if (scannedText && scannedText.length === 5 && /^[A-Z0-9]+$/.test(scannedText)) {
                stopScanning()
                onJoinEvent(scannedText)
              }
            }
            if (error && !(error instanceof Error && error.name === 'NotFoundException')) {
              console.error('QR scan error:', error)
            }
          }
        )
      } catch (error) {
        console.error('Failed to start QR scanning:', error)
        setScanError('Failed to access camera. Please check permissions.')
        setIsScanning(false)
      }
    }

    init()

    return () => {
      didCancel = true
      stopScanning()
    }
  }, [isScanning])

  return (
    <div className={cn("space-y-6", className)}>
      {/* QR Scanner Option */}
      <div className="text-center space-y-4">
        {isScanning ? (
          <div className="space-y-3">
            <div className="relative w-64 h-64 bg-black rounded-2xl mx-auto overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              <div className="absolute inset-0 border-2 border-primary rounded-2xl pointer-events-none">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-primary rounded-lg">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg"></div>
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">Position the QR code within the frame</p>
            {scanError && (
              <p className="text-destructive text-sm">{scanError}</p>
            )}
            <GradientButton 
              onClick={stopScanning}
              variant="outline"
              className="w-full rounded-full py-3 text-base font-medium"
            >
              <X className="h-5 w-5 mr-2" />
              Stop Scanning
            </GradientButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-24 h-24 bg-muted/50 rounded-2xl mx-auto flex items-center justify-center">
              <div className="w-16 h-16 bg-muted-foreground/20 rounded-xl flex items-center justify-center">
                <div className="w-12 h-12 bg-muted-foreground/30 rounded-lg"></div>
              </div>
            </div>
            
            <GradientButton 
              onClick={startScanning}
              disabled={isLoading}
              className="w-full rounded-full py-3 text-base font-medium"
            >
              <Camera className="h-5 w-5 mr-2" />
              Scan QR Code
            </GradientButton>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-card px-3 text-muted-foreground">OR</span>
        </div>
      </div>

      {/* Manual Code Input */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="event-code" className="block text-sm font-medium text-foreground mb-2">
            Enter 5-character event code
          </label>
          <Input
            id="event-code"
            type="text"
            value={eventCode}
            onChange={handleInputChange}
            placeholder="ABC12"
            maxLength={5}
            className="text-center text-lg font-mono tracking-wider"
            disabled={isLoading}
          />
        </div>
        
        <GradientButton 
          type="submit"
          disabled={eventCode.length !== 5 || isLoading}
          className="w-full rounded-full py-3 text-base font-medium"
        >
          {isLoading ? (
            "Joining..."
          ) : (
            <>
              Join Event
              <ArrowRight className="h-5 w-5 ml-2" />
            </>
          )}
        </GradientButton>
      </form>
    </div>
  )
}
