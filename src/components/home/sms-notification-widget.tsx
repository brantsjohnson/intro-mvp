"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { Phone, Bell, BellOff, X } from "lucide-react"

export function SMSNotificationWidget() {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [hasPhoneNumber, setHasPhoneNumber] = useState(false)
  const supabase = createClientComponentClient()

  // Load current phone number and notification preference
  useEffect(() => {
    const loadPhoneNumber = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from("users")
          .select("phone_number, sms_notifications_enabled")
          .eq("user_id", user.id)
          .single()

        if (error) {
          console.error("Error loading phone number:", error)
          return
        }

        if (data) {
          const phone = data.phone_number || ""
          setPhoneNumber(phone)
          setSmsEnabled(data.sms_notifications_enabled ?? true)
          setHasPhoneNumber(!!phone)
        }
      } catch (error) {
        console.error("Error in loadPhoneNumber:", error)
      } finally {
        setIsLoading(false)
      }
    }

    setIsLoading(true)
    loadPhoneNumber()
  }, [supabase])

  const handleSave = async () => {
    if (!phoneNumber.trim() && smsEnabled) {
      toast.error("Please enter a phone number")
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch("/api/save-phone-number", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim() || null,
          smsNotificationsEnabled: smsEnabled,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save phone number")
      }

      toast.success("Phone number saved successfully")
      if (phoneNumber.trim()) {
        setHasPhoneNumber(true)
        
        // Send a test SMS to confirm the number works
        try {
          const smsResponse = await fetch("/api/send-sms", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: phoneNumber.trim(),
              message: "Welcome to Intro! You're all set to receive text notifications when someone sends you a message. Reply STOP to opt out anytime."
            }),
          })
          
          if (smsResponse.ok) {
            toast.success("Test message sent! Check your phone.")
          } else {
            // Don't show error - SMS might not be configured yet
            console.log("SMS test message not sent (may not be configured)")
          }
        } catch (smsError) {
          // Silently fail - SMS service might not be configured
          console.log("SMS test message failed (non-critical):", smsError)
        }
      }
    } catch (error) {
      console.error("Error saving phone number:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to save phone number"
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleNotifications = async (enabled: boolean) => {
    setSmsEnabled(enabled)
    
    // Auto-save when toggling
    try {
      const response = await fetch("/api/save-phone-number", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          smsNotificationsEnabled: enabled,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update notification preference")
      }

      toast.success(
        enabled
          ? "SMS notifications enabled"
          : "SMS notifications disabled"
      )
    } catch (error) {
      console.error("Error updating notification preference:", error)
      // Revert on error
      setSmsEnabled(!enabled)
      toast.error("Failed to update notification preference")
    }
  }

  // Don't show if dismissed or if user already has phone number set
  if (isDismissed || (hasPhoneNumber && !isLoading)) {
    return null
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-3/4"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-elevation">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Stay Connected</span>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="phone-number" className="text-sm">Your Phone Number</Label>
            <Input
              id="phone-number"
              type="tel"
              placeholder="(555) 123-4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              We'll send you a text when someone reaches out to you.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="sms-enabled"
              checked={smsEnabled}
              onCheckedChange={(checked) =>
                handleToggleNotifications(checked === true)
              }
              disabled={isSaving || !phoneNumber.trim()}
            />
            <Label
              htmlFor="sms-enabled"
              className="flex items-center space-x-2 cursor-pointer flex-1 text-sm"
            >
              {smsEnabled ? (
                <Bell className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span>Receive text notifications</span>
            </Label>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !phoneNumber.trim()}
            className="w-full"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}

