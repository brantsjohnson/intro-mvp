"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      style={
        {
          "--normal-bg": "var(--background)", // Use beige background instead of popover
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          background: "var(--background)", // Beige background
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          pointerEvents: "auto", // Allow interaction but don't cover content on scroll
        },
        className: "toast-notification",
      }}
      {...props}
    />
  )
}

export { Toaster }
