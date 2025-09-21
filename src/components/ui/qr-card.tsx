import * as React from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { QrCode, Camera } from "lucide-react"
import { cn } from "@/lib/utils"

interface QRCardProps {
  qrCodeUrl?: string
  onScanClick: () => void
  className?: string
}

export function QRCard({ qrCodeUrl, onScanClick, className }: QRCardProps) {
  return (
    <Card className={cn("bg-card border-border shadow-elevation", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium text-foreground">
          Your QR Code
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {qrCodeUrl ? (
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl">
              <Image 
                src={qrCodeUrl} 
                alt="Your QR Code" 
                width={128}
                height={128}
                className="w-32 h-32"
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-32 h-32 bg-muted rounded-xl flex items-center justify-center">
              <QrCode className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
        )}
        
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Let others scan your QR code to connect
          </p>
          
          <GradientButton 
            onClick={onScanClick}
            className="w-full"
            size="sm"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scan QR Code
          </GradientButton>
        </div>
      </CardContent>
    </Card>
  )
}
