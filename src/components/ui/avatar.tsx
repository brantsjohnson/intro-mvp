"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-2xl",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  onError,
  src,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  const handleError = React.useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Log image load failures for debugging
    const img = e.currentTarget
    console.warn('Avatar image failed to load:', {
      src: img.src,
      error: e.type
    })
    // Call user's onError handler if provided
    if (onError) {
      onError(e)
    }
  }, [onError])

  // Determine referrer policy based on URL type
  // For external URLs (OAuth providers), use more permissive policy
  // For Supabase storage URLs, use no-referrer for security
  const isExternalUrl = src && typeof src === 'string' && 
    (src.startsWith('http://') || src.startsWith('https://')) &&
    !src.includes('supabase.co') && !src.includes('supabase.in')
  
  const referrerPolicy = isExternalUrl ? 'no-referrer-when-downgrade' : 'no-referrer'
  const crossOrigin = isExternalUrl ? undefined : 'anonymous'

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      referrerPolicy={referrerPolicy}
      crossOrigin={crossOrigin}
      onError={handleError}
      src={src}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-2xl",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
