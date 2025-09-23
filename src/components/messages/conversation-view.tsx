"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { Input } from "@/components/ui/input"
import { MessageService, ConversationMessage, ThreadWithDetails } from "@/lib/message-service-simple"
import { createClientComponentClient } from "@/lib/supabase"
import { toast } from "sonner"
import { ArrowLeft, Send, User } from "lucide-react"
import { format } from "date-fns"

export function ConversationView() {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [thread, setThread] = useState<ThreadWithDetails | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [eventName, setEventName] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get('eventId')
  const threadId = searchParams.get('threadId')
  const userId = searchParams.get('userId')
  const messageService = new MessageService()
  const supabase = createClientComponentClient()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!eventId) {
      toast.error("Event ID is required")
      router.push("/home")
      return
    }

    // Load event name for header subtitle
    const loadEvent = async () => {
      try {
        const { data } = await supabase
          .from('events')
          .select('name')
          .eq('id', eventId)
          .single()
        if (data?.name) setEventName(data.name)
      } catch (e) {
        // ignore subtitle failures
      }
    }
    loadEvent()

    const loadConversation = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth")
          return
        }

        if (threadId) {
          // Load existing thread
          const [messagesData, threadsData] = await Promise.all([
            messageService.getThreadMessages(threadId),
            messageService.getThreads(eventId)
          ])
          
          const currentThread = threadsData.find(t => t.id === threadId)
          setThread(currentThread || null)
          setMessages(messagesData)
          
          // Mark messages as read
          await messageService.markThreadAsRead(threadId)
        } else if (userId) {
          // Start new conversation
          const threadsData = await messageService.getThreads(eventId)
          const existingThread = threadsData.find(t => 
            t.participant_a === userId || t.participant_b === userId
          )
          
          if (existingThread) {
            // Navigate to existing thread
            router.replace(`/messages/conversation?eventId=${eventId}&threadId=${existingThread.id}`)
            return
          }
          
          // Get user profile for new conversation
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, job_title')
            .eq('id', userId)
            .single()
          
          if (userProfile) {
            setThread({
              id: '',
              event_id: eventId,
              participant_a: user.id,
              participant_b: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_message_at: null,
              other_participant: userProfile,
              last_message: undefined,
              unread_count: 0
            })
          }
          
          setMessages([])
        }
      } catch (error) {
        console.error("Error loading conversation:", error)
        toast.error("Failed to load conversation")
      } finally {
        setIsLoading(false)
      }
    }

    loadConversation()

    // Subscribe to real-time message updates
    if (threadId) {
      const subscription = messageService.subscribeToMessages(eventId, (payload) => {
        if (payload.new?.thread_id === threadId) {
          loadConversation() // Reload messages when new message arrives
        }
      })

      return () => subscription.unsubscribe()
    }
  }, [eventId, threadId, userId, router, messageService, supabase])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !eventId || isSending) return
    
    const messageText = newMessage.trim()
    setNewMessage("")
    setIsSending(true)

    try {
      if (threadId) {
        // Send to existing thread
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !thread) return

        await messageService.sendMessage(
          eventId,
          thread.other_participant.id,
          messageText
        )
      } else if (userId) {
        // Start new conversation
        await messageService.sendMessage(eventId, userId, messageText)
        
        // Reload to get the new thread ID
        const threadsData = await messageService.getThreads(eventId)
        const newThread = threadsData.find(t => 
          t.participant_a === userId || t.participant_b === userId
        )
        
        if (newThread) {
          router.replace(`/messages/conversation?eventId=${eventId}&threadId=${newThread.id}`)
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast.error("Failed to send message")
      setNewMessage(messageText) // Restore message on error
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatMessageTime = (timestamp: string) => {
    return format(new Date(timestamp), 'h:mm a')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Conversation not found
          </h3>
          <p className="text-muted-foreground mb-6">
            This conversation may have been deleted or you don't have access to it.
          </p>
          <GradientButton onClick={() => router.back()}>
            Go Back
          </GradientButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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

            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {thread.other_participant.first_name} {thread.other_participant.last_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {`Connected at: ${eventName || 'Event'}`}
              </p>
            </div>

            {/* spacer to balance layout */}
            <div className="w-9 h-9" />
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.is_from_current_user ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] ${message.is_from_current_user ? 'order-2' : 'order-1'}`}>
                    <div
                      className={`rounded-2xl px-4 py-2 ${
                        message.is_from_current_user
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-border'
                      }`}
                    >
                      <p className="text-sm">{message.body}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 px-2">
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-2xl px-4 py-2">
                    <p className="text-sm text-muted-foreground">typing...</p>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* System Banner */}
      <div className="bg-muted/50 border-t border-border px-4 py-2">
        <p className="text-xs text-muted-foreground text-center">
          Messages are only stored for one day after the end of the event. Use messages to find a location to meet and have your conversations in person.
        </p>
      </div>

      {/* Message Composer */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
        <div className="container mx-auto">
          <div className="flex items-center space-x-3">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isSending}
              className="flex-1"
            />
            <GradientButton
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isSending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </GradientButton>
          </div>
        </div>
      </div>
    </div>
  )
}
