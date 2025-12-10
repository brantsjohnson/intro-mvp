"use client"

import * as React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface ClickableProfilePictureProps {
  src?: string
  alt?: string
  fallback?: string
  isPresent?: boolean
  className?: string
  size?: "sm" | "md" | "lg" | "xl" | "profile"
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
  profile: "h-full w-full min-h-[120px] min-w-[120px]"
}

const presenceDotSizes = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-3 w-3",
  xl: "h-4 w-4",
  profile: "h-4 w-4"
}

export function ClickableProfilePicture({
  src,
  alt,
  fallback,
  isPresent = false,
  className,
  size = "md"
}: ClickableProfilePictureProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  if (!src && !fallback) {
    return null
  }

  return (
    <>
      <div 
        className={cn("relative cursor-pointer transition-all hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.2)] rounded-xl", className)}
        onClick={() => setIsOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsOpen(true)
          }
        }}
        aria-label="View profile picture"
      >
        <Avatar className={cn(
          sizeClasses[size],
          // Squircle shape: square with rounded corners instead of circular
          "rounded-xl overflow-hidden"
        )}>
          <AvatarImage 
            src={src} 
            alt={alt}
            className="object-cover"
          />
          <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium rounded-xl">
            {fallback}
          </AvatarFallback>
        </Avatar>
        {isPresent && (
          <div 
            className={cn(
              "absolute -bottom-0.5 -right-0.5 rounded-lg bg-primary border-2 border-background",
              presenceDotSizes[size]
            )}
          />
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent 
          className="max-w-[90vw] max-h-[90vh] p-4 bg-transparent border-none shadow-none"
          showCloseButton={true}
        >
          <div className="flex items-center justify-center">
            {src ? (
              <img
                src={src}
                alt={alt || "Profile picture"}
                className="max-w-full max-h-[85vh] object-contain rounded-xl"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex items-center justify-center bg-muted text-muted-foreground text-4xl font-medium rounded-xl min-h-[200px] min-w-[200px]">
                {fallback}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

