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
  const [eventEnded, setEventEnded] = useState(false)
  const [messagesDeleted, setMessagesDeleted] = useState(false)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
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

  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    return scrollHeight - scrollTop - clientHeight < 100
  }

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      setUserHasScrolled(!isNearBottom())
    }
  }

  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled up
    if (!userHasScrolled) {
      scrollToBottom()
    }
  }, [messages, userHasScrolled])

  // Reset scroll state when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && isNearBottom()) {
      setUserHasScrolled(false)
    }
  }, [messages.length])

  useEffect(() => {
    if (!eventId) {
      toast.error("Event ID is required")
      router.push("/home")
      return
    }

    // Load event details and check status
    const loadEvent = async () => {
      try {
        const { data } = await supabase
          .from('events')
          .select('name, ends_at')
          .eq('id', eventId)
          .single()
        
        if (data) {
          setEventName(data.name)
          const now = new Date()
          const eventEnd = new Date(data.ends_at)
          const oneDayAfterEnd = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000)
          
          // Event is considered "ended" only after the grace period (1 day after end)
          setEventEnded(now > oneDayAfterEnd)
          setMessagesDeleted(now > oneDayAfterEnd)
        }
      } catch (e) {
        console.error("Error loading event:", e)
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
        } else         if (userId) {
          // Validate that the user is in the same event
          const { data: userInEvent } = await supabase
            .from('event_members')
            .select('user_id')
            .eq('event_id', eventId)
            .eq('user_id', userId)
            .single()
          
          if (!userInEvent) {
            toast.error("This user is not in the current event")
            router.push(`/messages?eventId=${eventId}`)
            return
          }
          
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
          // Only reload if we're not currently sending a message
          if (!isSending) {
            loadConversation() // Reload messages when new message arrives
          }
        }
      })

      return () => subscription.unsubscribe()
    }
  }, [eventId, threadId, userId, router, messageService, supabase])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !eventId || isSending) return
    
    // Check if messages are deleted
    if (messagesDeleted) {
      toast.error("This event's messages are no longer available.")
      return
    }
    
    // Check if event has ended
    if (eventEnded) {
      toast.error("This event has ended. Messages are no longer available.")
      return
    }
    
    const messageText = newMessage.trim()
    setNewMessage("")
    setIsSending(true)

    // Get user info first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setNewMessage(messageText)
      setIsSending(false)
      return
    }

    // Create optimistic message immediately (no async calls)
    const optimisticMessage: ConversationMessage = {
      id: `temp-${Date.now()}`,
      event_id: eventId,
      thread_id: threadId || '',
      sender: user.id,
      recipient: thread?.other_participant.id || userId || '',
      body: messageText,
      created_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
      sender_profile: {
        id: user.id,
        first_name: 'You',
        last_name: '',
        avatar_url: null,
        job_title: null
      },
      is_from_current_user: true
    }

    // Add optimistic message immediately
    console.log("Adding optimistic message:", optimisticMessage)
    setMessages(prev => {
      const newMessages = [...prev, optimisticMessage]
      console.log("Updated messages array:", newMessages)
      return newMessages
    })
    
    // Scroll to bottom immediately
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 50)

    try {
      if (threadId) {
        // Send to existing thread
        if (!thread) return

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
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
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
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Header skeleton */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 bg-muted rounded-full animate-pulse"></div>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-muted rounded-full animate-pulse"></div>
                <div>
                  <div className="h-6 w-32 bg-muted rounded animate-pulse mb-2"></div>
                  <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
                </div>
              </div>
              <div className="w-9 h-9"></div>
            </div>
          </div>
        </header>

        {/* Messages skeleton */}
        <main 
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ 
            height: 'calc(100vh - 200px)',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="container mx-auto px-4 py-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] ${i % 2 === 0 ? 'order-2' : 'order-1'}`}>
                    <div className={`rounded-2xl px-4 py-2 h-12 animate-pulse ${
                      i % 2 === 0 ? 'bg-orange-400' : 'bg-white border border-gray-200'
                    }`}></div>
                    <div className="h-3 w-16 bg-muted rounded mt-1 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* System banner skeleton */}
        <div className="bg-muted/50 border-t border-border px-4 py-2 flex-shrink-0">
          <div className="h-3 w-full bg-muted rounded animate-pulse"></div>
        </div>

        {/* Composer skeleton */}
        <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4 flex-shrink-0">
          <div className="container mx-auto">
            <div className="flex items-center space-x-3">
              <div className="flex-1 h-10 bg-muted rounded animate-pulse"></div>
              <div className="w-10 h-10 bg-muted rounded animate-pulse"></div>
            </div>
          </div>
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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <GradientButton
              onClick={() => router.back()}
              variant="outline"
              size="icon"
            >
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>

            <div className="flex items-center space-x-3">
              <PresenceAvatar
                src={thread.other_participant.avatar_url}
                fallback={`${thread.other_participant.first_name[0]}${thread.other_participant.last_name[0]}`}
                isPresent={false}
                size="md"
              />
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {thread.other_participant.first_name} {thread.other_participant.last_name}
                </h1>
                {thread.other_participant.job_title && (
                  <p className="text-sm text-muted-foreground">
                    {thread.other_participant.job_title}
                  </p>
                )}
              </div>
            </div>

            {/* spacer to balance layout */}
            <div className="w-9 h-9" />
          </div>
        </div>
      </header>

      {/* Messages */}
      <main 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={handleScroll}
        style={{ 
          height: 'calc(100vh - 200px)', // Fixed height to prevent page scroll
          WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
        }}
      >
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
                          ? 'text-white'
                          : 'bg-white text-black border border-gray-200'
                      }`}
                      style={message.is_from_current_user ? {
                        background: 'linear-gradient(135deg, #EC874E 0%, #BF341E 100%)'
                      } : {}}
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
      <div className="bg-muted/50 border-t border-border px-4 py-2 flex-shrink-0">
        <p className="text-xs text-muted-foreground text-center">
          {messagesDeleted 
            ? "This event's messages are no longer available."
            : eventEnded
            ? "This event has ended. Messages are read-only."
            : "Messages are stored for one day after the event ends. Use messages to find a location to meet and have your conversations in person."
          }
        </p>
      </div>

      {/* Message Composer - Only show if event hasn't ended and messages aren't deleted */}
      {!eventEnded && !messagesDeleted && (
        <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4 flex-shrink-0">
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
      )}
    </div>
  )
}
