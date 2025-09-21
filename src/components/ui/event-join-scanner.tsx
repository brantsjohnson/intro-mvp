import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { GradientButton } from "@/components/ui/gradient-button"
import { QrCode, Camera, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

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

  return (
    <Card className={cn("bg-card border-border shadow-elevation", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium text-foreground">
          Join Event
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Scanner Option */}
        <div className="text-center">
          <div className="mb-3">
            <div className="w-20 h-20 bg-muted rounded-xl flex items-center justify-center mx-auto mb-3">
              <QrCode className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Scan the event QR code
            </p>
          </div>
          
          <GradientButton 
            onClick={onScanQR}
            disabled={isLoading}
            className="w-full"
            size="sm"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scan QR Code
          </GradientButton>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        {/* Manual Code Input */}
        <form onSubmit={handleSubmit} className="space-y-3">
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
              className="text-center text-lg font-mono tracking-wider rounded-xl"
              disabled={isLoading}
            />
          </div>
          
          <GradientButton 
            type="submit"
            disabled={eventCode.length !== 5 || isLoading}
            className="w-full"
            size="sm"
          >
            {isLoading ? (
              "Joining..."
            ) : (
              <>
                Join Event
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </GradientButton>
        </form>
      </CardContent>
    </Card>
  )
}
