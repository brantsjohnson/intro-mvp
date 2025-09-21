import * as React from "react"
import { Textarea } from "@/components/ui/textarea"
import { GradientButton } from "@/components/ui/gradient-button"
import { Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface MessageComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function MessageComposer({ 
  value, 
  onChange, 
  onSend, 
  placeholder = "Type a message...",
  disabled = false,
  className 
}: MessageComposerProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSend()
      }
    }
  }

  return (
    <div className={cn("flex space-x-3", className)}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl"
        rows={1}
      />
      <GradientButton
        onClick={onSend}
        disabled={!value.trim() || disabled}
        size="icon"
        className="flex-shrink-0"
      >
        <Send className="h-4 w-4" />
      </GradientButton>
    </div>
  )
}
