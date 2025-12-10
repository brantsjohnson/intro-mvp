"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MessageService, ConversationMessage, ThreadWithDetails } from "@/lib/message-service-simple"
import { createClientComponentClient } from "@/lib/supabase"
import { TablesInsert } from "@/lib/database.types"
import { getAvatarUrl } from "@/lib/utils"
import { ArrowLeft, Send, User } from "lucide-react"
import { differenceInMinutes, format } from "date-fns"

export function ConversationView() {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [thread, setThread] = useState<ThreadWithDetails | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [eventEnded, setEventEnded] = useState(false)
  const [messagesDeleted, setMessagesDeleted] = useState(false)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false)
  const [hasCheckedForThread, setHasCheckedForThread] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false)
  const [isCreatingConnection, setIsCreatingConnection] = useState(false)
  const [visibleTimestamps, setVisibleTimestamps] = useState<Record<string, boolean>>({})
  const [hasManuallyBlurredInput, setHasManuallyBlurredInput] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<ConversationMessage[]>([])
  const isSendingRef = useRef(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get("eventId")
  const threadId = searchParams.get("threadId")
  const userId = searchParams.get("userId")
  const messageService = useMemo(() => new MessageService(), [])
  const supabase = useMemo(() => createClientComponentClient(), [])

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

  const loadEvent = useCallback(async () => {
    if (!eventId) return

    try {
      const { data } = await supabase
        .from("events")
        .select("event_ends_at")
        .eq("event_id", eventId)
        .single()

      if (data) {
        const now = new Date()
        const eventEnd = data.event_ends_at ? new Date(data.event_ends_at) : null

        if (eventEnd) {
          const oneDayAfterEnd = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000)
          const isPastWindow = now > oneDayAfterEnd

          setEventEnded(isPastWindow)
          setMessagesDeleted(isPastWindow)
        } else {
          setEventEnded(false)
          setMessagesDeleted(false)
        }
      }
    } catch (error) {
      console.error("Error loading event:", error)
    }
  }, [eventId, supabase])

  const loadConversation = useCallback(async () => {
    if (!eventId) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth")
        return
      }

      setCurrentUserId(user.id)

      if (threadId) {
        const [messagesData, threadsData] = await Promise.all([
          messageService.getThreadMessages(threadId),
          messageService.getThreads(eventId)
        ])

        const currentThread = threadsData.find((t) => t.id === threadId)
        setThread(currentThread || null)
        setMessages(messagesData)
        setHasLoadedMessages(true)
      } else if (userId) {
        const { data: userInEvent } = await supabase
          .from("attendance")
          .select("user_id")
          .eq("event_id", eventId)
          .eq("user_id", userId)
          .maybeSingle()

        if (!userInEvent) {
          router.push(`/messages?eventId=${eventId}`)
          return
        }

        const threadsData = await messageService.getThreads(eventId)
        const existingThread = threadsData.find(
          (t) => t.participant_a === userId || t.participant_b === userId
        )

        if (existingThread) {
          router.replace(`/messages/conversation?eventId=${eventId}&threadId=${existingThread.id}`)
          return
        }

        const { data: userProfile } = await supabase
          .from("users")
          .select("user_id, first_name, last_name, photo_url, career_title")
          .eq("user_id", userId)
          .single()

        if (userProfile) {
          setThread({
            id: "",
            event_id: eventId,
            participant_a: user.id,
            participant_b: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message_at: null,
            other_participant: {
              id: userProfile.user_id,
              first_name: userProfile.first_name || "",
              last_name: userProfile.last_name || "",
              avatar_url: getAvatarUrl(userProfile.photo_url),
              job_title: userProfile.career_title || null
            },
            last_message: undefined,
            unread_count: 0,
            incoming_message_timestamps: []
          })
        }

        setMessages([])
        setHasLoadedMessages(true)
      }

      setHasCheckedForThread(true)
    } catch (error) {
      console.error("Error loading conversation:", error)
      setHasCheckedForThread(true)
    } finally {
      setIsLoading(false)
    }
  }, [eventId, messageService, router, supabase, threadId, userId])

  useEffect(() => {
    isMountedRef.current = true
    messagesRef.current = messages

    return () => {
      isMountedRef.current = false
    }
  }, [messages])

  useEffect(() => {
    setHasManuallyBlurredInput(false)
  }, [threadId])

  useEffect(() => {
    isSendingRef.current = isSending
  }, [isSending])

  useEffect(() => {
    if (!eventId) {
      router.push("/home")
      return
    }

    loadEvent()
    void loadConversation()
  }, [eventId, loadEvent, loadConversation, router])

  useEffect(() => {
    if (!eventId || !threadId) return

    const channel = messageService.subscribeToConversationMessages(threadId, async (payload) => {
      const messageId = payload.new?.message_id
      if (!messageId) return

      try {
        const latestMessage = await messageService.getMessageById(messageId)

        if (!latestMessage) {
          await loadConversation()
          return
        }

        setMessages((prev) => {
          const exists = prev.some((msg) => msg.id === latestMessage.id)
          if (exists) {
            return prev.map((msg) => (msg.id === latestMessage.id ? latestMessage : msg))
          }
          return [...prev, latestMessage]
        })

        setThread((prev) =>
          prev
            ? {
                ...prev,
                last_message: latestMessage,
                last_message_at: latestMessage.created_at,
                updated_at: latestMessage.created_at
              }
            : prev
        )

        setVisibleTimestamps((prev) => {
          if (prev[messageId] === undefined) return prev
          const { [messageId]: _ignored, ...rest } = prev
          return rest
        })

        if (isNearBottom()) {
          requestAnimationFrame(() => {
            scrollToBottom()
          })
        }
      } catch (error) {
        console.error("Error handling realtime message:", error)
      }
    })

    return () => {
      void channel?.unsubscribe()
    }
  }, [eventId, threadId, messageService, loadConversation])

  useEffect(() => {
    const startPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }

      if (!threadId || typeof window === "undefined") {
        return
      }

      pollingIntervalRef.current = setInterval(() => {
        if (
          !isMountedRef.current ||
          document.hidden ||
          isSendingRef.current
        ) {
          return
        }

        void loadConversation().catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Passive poll failed:", error)
          }
        })
      }, 4500)
    }

    startPolling()

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [threadId, loadConversation])

  useEffect(() => {
    if (typeof window === "undefined" || !threadId) return
    const latestMessage = messages[messages.length - 1]
    if (!latestMessage) return

    window.localStorage.setItem(
      `conversation:lastSeen:${threadId}`,
      latestMessage.created_at
    )
    window.dispatchEvent(
      new CustomEvent("conversation:lastSeen", {
        detail: { threadId, timestamp: latestMessage.created_at }
      })
    )
  }, [messages, threadId])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !eventId || isSending) return
    
    // Check if messages are deleted
    if (messagesDeleted) {
      return
    }
    
    // Check if event has ended
    if (eventEnded) {
      return
    }
    
    const messageText = newMessage.trim()
    setNewMessage("")
    setIsSending(true)
    isSendingRef.current = true
    setHasManuallyBlurredInput(false)
    if (!userHasScrolled) {
      messageInputRef.current?.focus()
    }

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
    setMessages((prev) => [...prev, optimisticMessage])

    // Scroll to bottom immediately
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 50)

    try {
      if (threadId) {
        // Send to existing thread
        if (!thread) return

        const sentMessage = await messageService.sendMessage(
          eventId,
          thread.other_participant.id,
          messageText
        )

        // Replace optimistic message with real message
        if (sentMessage) {
          const conversationMessage: ConversationMessage = {
            ...sentMessage,
            sender_profile: {
              id: user.id,
              first_name: 'You',
              last_name: '',
              avatar_url: null,
              job_title: null
            },
            is_from_current_user: true
          }
          setMessages((prev) =>
            prev.map((msg) => (msg.id === optimisticMessage.id ? conversationMessage : msg))
          )

          // Trigger SMS and email notifications for recipient (fire and forget)
          // Get sender name from user profile
          supabase
            .from('users')
            .select('first_name, last_name')
            .eq('user_id', user.id)
            .single()
            .then(({ data: senderProfile }) => {
              const senderName = senderProfile?.first_name || 'Someone'
              const messagePreview = messageText.length > 100 
                ? messageText.substring(0, 100) + '...' 
                : messageText
              
              // Send SMS notification
              fetch('/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipientUserId: thread.other_participant.id,
                  senderName: senderName
                })
              }).catch(err => {
                // Silently fail - SMS is optional
                console.log('SMS notification failed (non-critical):', err)
              })

              // Send email notification
              fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipientUserId: thread.other_participant.id,
                  senderName: senderName,
                  messagePreview: messagePreview
                })
              }).catch(err => {
                // Silently fail - email is optional
                console.log('Email notification failed (non-critical):', err)
              })
            })
            .catch(err => {
              // Silently fail - notifications are optional
              console.log('Failed to fetch sender profile for notifications (non-critical):', err)
            })
        }
      } else if (userId) {
        // Start new conversation
        const sentMessage = await messageService.sendMessage(eventId, userId, messageText)

        // Replace optimistic message with real message
        if (sentMessage) {
          const conversationMessage: ConversationMessage = {
            ...sentMessage,
            sender_profile: {
              id: user.id,
              first_name: 'You',
              last_name: '',
              avatar_url: null,
              job_title: null
            },
            is_from_current_user: true
          }
          setMessages((prev) =>
            prev.map((msg) => (msg.id === optimisticMessage.id ? conversationMessage : msg))
          )

          // Trigger SMS and email notifications for recipient (fire and forget)
          // Get sender name from user profile
          supabase
            .from('users')
            .select('first_name, last_name')
            .eq('user_id', user.id)
            .single()
            .then(({ data: senderProfile }) => {
              const senderName = senderProfile?.first_name || 'Someone'
              const messagePreview = messageText.length > 100 
                ? messageText.substring(0, 100) + '...' 
                : messageText
              
              // Send SMS notification
              fetch('/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipientUserId: userId,
                  senderName: senderName
                })
              }).catch(err => {
                // Silently fail - SMS is optional
                console.log('SMS notification failed (non-critical):', err)
              })

              // Send email notification
              fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipientUserId: userId,
                  senderName: senderName,
                  messagePreview: messagePreview
                })
              }).catch(err => {
                // Silently fail - email is optional
                console.log('Email notification failed (non-critical):', err)
              })
            })
            .catch(err => {
              // Silently fail - notifications are optional
              console.log('Failed to fetch sender profile for notifications (non-critical):', err)
            })
        }

        // Reload to get the new thread ID
        const threadsData = await messageService.getThreads(eventId)
        const newThread = threadsData.find(
          (t) => t.participant_a === userId || t.participant_b === userId
        )

        if (newThread) {
          router.replace(`/messages/conversation?eventId=${eventId}&threadId=${newThread.id}`)
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      setNewMessage(messageText) // Restore message on error
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id))
    } finally {
      setIsSending(false)
      isSendingRef.current = false
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

  const toggleTimestamp = (messageId: string) => {
    setVisibleTimestamps((prev) => ({
      ...prev,
      [messageId]: !prev[messageId]
    }))
  }

  useEffect(() => {
    if (
      hasLoadedMessages &&
      !eventEnded &&
      !messagesDeleted &&
      !hasManuallyBlurredInput &&
      !userHasScrolled
    ) {
      messageInputRef.current?.focus()
    }
  }, [hasLoadedMessages, eventEnded, messagesDeleted, hasManuallyBlurredInput, userHasScrolled])

  const handleParticipantClick = useCallback(async () => {
    if (!thread || !eventId || !currentUserId || isCheckingConnection) return

    setIsCheckingConnection(true)
    try {
      const otherUserId = thread.other_participant.id
      const { data, error } = await supabase
        .from("connections")
        .select("connection_kind")
        .eq("event_id", eventId)
        .or(
          `and(a_id.eq.${currentUserId},b_id.eq.${otherUserId}),and(a_id.eq.${otherUserId},b_id.eq.${currentUserId})`
        )
        .maybeSingle()

      if (error && error.code !== "PGRST116") {
        console.error("Error checking connection:", error)
        return
      }

      if (data && data.connection_kind !== "user_request_pending") {
        router.push(`/profile/${otherUserId}?source=message&eventId=${eventId}`)
        return
      }

      if (data && data.connection_kind === "user_request_pending") {
        return
      }

      setIsConnectionDialogOpen(true)
    } finally {
      setIsCheckingConnection(false)
    }
  }, [thread, eventId, currentUserId, supabase, router, isCheckingConnection])

  const handleCreateConnection = useCallback(async () => {
    if (!thread || !eventId || !currentUserId) return

    setIsCreatingConnection(true)
    try {
      const otherUserId = thread.other_participant.id
      const [aId, bId] = currentUserId < otherUserId
        ? [currentUserId, otherUserId]
        : [otherUserId, currentUserId]

      const { error } = await supabase
        .from("connections")
        .insert({
          event_id: eventId,
          a_id: aId,
          b_id: bId,
          connection_kind: "user_request_pending",
          user_add_method: "manual_message",
          created_by_user_id: currentUserId
        } as TablesInsert<"connections">)

      if (error) {
        const duplicate = error.message?.toLowerCase().includes("duplicate")
        if (duplicate) {
        } else {
          console.error("Failed to send connection request:", error)
        }
        return
      }

      setIsConnectionDialogOpen(false)
    } finally {
      setIsCreatingConnection(false)
    }
  }, [thread, eventId, currentUserId, supabase])

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col overflow-hidden">
        <header className="border-b border-border bg-background flex-shrink-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
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

        <main className="flex-1 overflow-hidden">
          <div className="container mx-auto px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] ${i % 2 === 0 ? "order-2" : "order-1"}`}>
                    <div className={`h-12 rounded-2xl animate-pulse px-4 py-2 ${
                      i % 2 === 0 ? "bg-primary" : "bg-white border border-border"
                    }`}></div>
                    <div className="h-3 w-16 bg-muted rounded mt-1 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <div className="bg-muted/50 border-t border-border px-4 py-2 flex-shrink-0">
          <div className="h-3 w-full bg-muted rounded animate-pulse"></div>
        </div>

        <div className="border-t border-border bg-card/60 p-4 flex-shrink-0">
          <div className="container mx-auto">
            <div className="max-w-3xl mx-auto flex items-center space-x-3">
              <div className="flex-1 h-10 bg-muted rounded animate-pulse"></div>
              <div className="w-10 h-10 bg-muted rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!thread && !hasCheckedForThread) {
    return (
      <div className="min-h-screen flex flex-col overflow-hidden">
        <header className="border-b border-border bg-background flex-shrink-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
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

        <main className="flex-1 overflow-hidden">
          <div className="container mx-auto px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] ${i % 2 === 0 ? "order-2" : "order-1"}`}>
                    <div className={`h-12 rounded-2xl animate-pulse px-4 py-2 ${
                      i % 2 === 0 ? "bg-primary" : "bg-white border border-border"
                    }`}></div>
                    <div className="h-3 w-16 bg-muted rounded mt-1 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <div className="bg-muted/50 border-t border-border px-4 py-2 flex-shrink-0">
          <div className="h-3 w-full bg-muted rounded animate-pulse"></div>
        </div>

        <div className="border-t border-border bg-card/60 p-4 flex-shrink-0">
          <div className="container mx-auto">
            <div className="max-w-3xl mx-auto flex items-center space-x-3">
              <div className="flex-1 h-10 bg-muted rounded animate-pulse"></div>
              <div className="w-10 h-10 bg-muted rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // If we've checked and confirmed there's no thread, show error
  if (!thread && hasCheckedForThread) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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

  if (!thread) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <GradientButton onClick={() => router.back()} size="icon" className="!rounded-2xl">
              <ArrowLeft className="h-4 w-4" />
            </GradientButton>

            <Button
              variant="ghost"
              onClick={handleParticipantClick}
              disabled={isCheckingConnection}
              className="flex-1 flex items-center justify-center space-x-3 px-3 py-2 hover:shadow-[0px_2px_3px_rgba(0,0,0,0.1)]"
            >
              <PresenceAvatar
                src={thread.other_participant.avatar_url ?? undefined}
                fallback={`${thread.other_participant.first_name[0]}${thread.other_participant.last_name[0]}`}
                isPresent={false}
                size="md"
              />
              <div className="text-left">
                <h1 className="text-lg font-semibold text-foreground">
                  {thread.other_participant.first_name} {thread.other_participant.last_name}
                </h1>
                {thread.other_participant.job_title && (
                  <p className="text-sm text-muted-foreground">
                    {thread.other_participant.job_title}
                  </p>
                )}
              </div>
            </Button>

            <div className="w-9 h-9" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 flex-1 w-full">
        <div className="max-w-3xl mx-auto flex flex-col h-full min-h-0">
          <section
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden pb-32 pt-4"
            onScroll={handleScroll}
          >
            {messages.length === 0 && hasLoadedMessages ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
              </div>
            ) : messages.length > 0 ? (
              <div className="flex flex-col">
                {messages.map((message, index) => {
                  const previousMessage = index > 0 ? messages[index - 1] : null
                  const isSameSenderAsPrevious =
                    previousMessage?.is_from_current_user === message.is_from_current_user
                  const isCloseInTime =
                    previousMessage &&
                    differenceInMinutes(new Date(message.created_at), new Date(previousMessage.created_at)) <= 5
                  const isGroupedWithPrevious = Boolean(isSameSenderAsPrevious && isCloseInTime)
                  const alignment = message.is_from_current_user ? "items-end" : "items-start"
                  const bubbleAlignment = message.is_from_current_user ? "ml-auto" : "mr-auto"
                  const bubbleColors = message.is_from_current_user
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/55 text-foreground border border-border shadow-sm"
                  const timestampVisible = visibleTimestamps[message.id]

                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col ${alignment} ${isGroupedWithPrevious ? "mt-1" : "mt-4"}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTimestamp(message.id)}
                        className={`max-w-[75%] ${bubbleAlignment} text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/40 rounded-3xl`}
                      >
                        <div
                          className={`w-fit rounded-3xl px-4 py-2 shadow-sm transition-all hover:scale-[0.99] hover:shadow-[0px_3px_4px_rgba(0,0,0,0.2)] active:scale-95 ${bubbleColors}`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {message.body}
                          </p>
                        </div>
                      </button>
                      {timestampVisible && (
                        <span
                          className={`text-[11px] text-muted-foreground mt-1 ${
                            message.is_from_current_user ? "text-right pr-2" : "text-left pl-2"
                          }`}
                        >
                          {formatMessageTime(message.created_at)}
                        </span>
                      )}
                    </div>
                  )
                })}

                {isTyping && (
                  <div className="flex justify-start mt-4">
                    <div className="bg-card border border-border rounded-3xl px-4 py-2 shadow-sm">
                      <p className="text-sm text-muted-foreground">typing...</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            ) : null}
          </section>

          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-background/95 via-background/80 to-transparent pt-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className="space-y-4">
              {messages.length === 0 && !messagesDeleted && !eventEnded && (
                <div className="mx-auto w-fit rounded-2xl bg-card/60 px-5 py-2 text-xs text-muted-foreground border border-border/60 shadow-sm">
                  <p>
                    Messages stay available for one day after the event ends. Coordinate and then meet in person.
                  </p>
                </div>
              )}

              {(eventEnded || messagesDeleted) && (
                <div className="rounded-concave border border-border/60 bg-card px-4 py-3 shadow-sm">
                  <p className="text-xs text-muted-foreground text-center">
                    {messagesDeleted
                      ? "This event's messages are no longer available."
                      : "This event has ended. Messages are read-only."}
                  </p>
                </div>
              )}

              {!eventEnded && !messagesDeleted && (
                <div className="border border-border/60 bg-card rounded-concave p-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <Input
                      ref={messageInputRef}
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      onKeyPress={handleKeyPress}
                      onFocus={() => setHasManuallyBlurredInput(false)}
                      onBlur={() => setHasManuallyBlurredInput(true)}
                      disabled={eventEnded || messagesDeleted}
                      className="flex-1 border-none bg-background/60 shadow-inner rounded-concave focus-visible:ring-0 focus-visible:ring-offset-0"
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
              )}
            </div>
          </div>
        </div>
      </main>

      <Dialog open={isConnectionDialogOpen} onOpenChange={setIsConnectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add connection?</DialogTitle>
            <DialogDescription>
              Would you like to send {thread?.other_participant.first_name} a connection request so they appear in your network?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConnectionDialogOpen(false)}
              disabled={isCreatingConnection}
            >
              Not now
            </Button>
            <Button onClick={handleCreateConnection} disabled={isCreatingConnection}>
              {isCreatingConnection ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
