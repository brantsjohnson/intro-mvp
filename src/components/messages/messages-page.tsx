"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { ArrowLeft, MessageSquare, Plus } from "lucide-react"

interface MessageThread {
  id: string
  other_user: {
    id: string
    first_name: string
    last_name: string
    avatar_url?: string
  }
  last_message?: {
    content: string
    created_at: string
  }
  unread_count: number
}

export function MessagesPage() {
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth")
          return
        }

        // TODO: Implement actual message loading
        // For now, show empty state
        setThreads([])
      } catch (error) {
        console.error("Error loading messages:", error)
        toast.error("Failed to load messages")
      } finally {
        setIsLoading(false)
      }
    }

    loadMessages()
  }, [router, supabase])

  const handleNewMessage = () => {
    // TODO: Implement new message functionality
    toast.info("New message functionality will be implemented")
  }

  const handleThreadClick = () => {
    // TODO: Navigate to thread
    toast.info("Thread view will be implemented")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={() => router.back()}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>
            
            <h1 className="text-lg font-semibold text-foreground">
              Messages
            </h1>

            <GradientButton
              onClick={handleNewMessage}
              variant="outline"
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </GradientButton>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {threads.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              No messages yet
            </h3>
            <p className="text-muted-foreground mb-6">
              Start conversations with people you meet at the conference
            </p>
            <GradientButton onClick={handleNewMessage}>
              Start a Conversation
            </GradientButton>
          </div>
        ) : (
          <div className="space-y-4">
            {threads.map((thread) => (
              <Card
                key={thread.id}
                className="bg-card border-border shadow-elevation cursor-pointer hover:bg-card/80 transition-colors"
                onClick={() => handleThreadClick(thread.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <PresenceAvatar
                      src={thread.other_user.avatar_url}
                      fallback={`${thread.other_user.first_name[0]}${thread.other_user.last_name[0]}`}
                      isPresent={false}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground truncate">
                          {thread.other_user.first_name} {thread.other_user.last_name}
                        </h3>
                        {thread.unread_count > 0 && (
                          <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>
                      {thread.last_message && (
                        <p className="text-sm text-muted-foreground truncate">
                          {thread.last_message.content}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
