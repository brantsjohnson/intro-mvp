"use client"

import { useState } from "react"
import { FreshQRDisplay } from "@/components/ui/fresh-qr-display"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { toast } from "sonner"

export default function TestFreshQRPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleJoinEvent = async (eventCode: string) => {
    setIsLoading(true)
    try {
      // Simulate joining the event
      console.log('Joining event with code:', eventCode)
      toast.success(`Successfully joined event: ${eventCode}`)
      
      // In a real app, this would redirect to onboarding or home
      setTimeout(() => {
        toast.info('Redirecting to onboarding...')
      }, 1000)
    } catch (error) {
      console.error('Error joining event:', error)
      toast.error('Failed to join event')
    } finally {
      setIsLoading(false)
    }
  }

  const handleScanQR = () => {
    toast.info("QR scanning functionality is ready!")
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              FRESH Event QR Code Test
            </h1>
            <p className="text-muted-foreground">
              Test the permanent QR code for the FRESH networking event
            </p>
          </div>

          {/* QR Code Display */}
          <FreshQRDisplay />

          {/* QR Scanner Test */}
          <Card>
            <CardHeader>
              <CardTitle>Test QR Scanner</CardTitle>
            </CardHeader>
            <CardContent>
              <EventJoinScanner
                onJoinEvent={handleJoinEvent}
                onScanQR={handleScanQR}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How to Test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Method 1: Scan the QR Code Above</h3>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Use the "Scan QR Code" button in the scanner section</li>
                  <li>Point your camera at the FRESH QR code above</li>
                  <li>The scanner should detect "FRESH" and join the event</li>
                </ol>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Method 2: Manual Entry</h3>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Type "FRESH" in the manual input field</li>
                  <li>Click "Join Event"</li>
                </ol>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-2">Expected Behavior:</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Success message: "Successfully joined event: FRESH"</li>
                  <li>Info message: "Redirecting to onboarding..."</li>
                  <li>In a real app, user would be redirected to account creation/onboarding</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
