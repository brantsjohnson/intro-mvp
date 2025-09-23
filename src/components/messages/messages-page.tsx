"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { Input } from "@/components/ui/input"
import { createClientComponentClient } from "@/lib/supabase"
import { MessageService, ThreadWithDetails } from "@/lib/message-service-simple"
import { toast } from "sonner"
import { ArrowLeft, MessageSquare, Plus, Search, Users } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export function MessagesPage() {
  const [threads, setThreads] = useState<ThreadWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get('eventId')
  const messageService = new MessageService()

  useEffect(() => {
    if (!eventId) {
      toast.error("Event ID is required")
      router.push("/home")
      return
    }

    const loadMessages = async () => {
      try {
        const { data: { user } } = await messageService.supabase.auth.getUser()
        if (!user) {
          router.push("/auth")
          return
        }

        const threadsData = await messageService.getThreads(eventId)
        setThreads(threadsData)
      } catch (error) {
        console.error("Error loading messages:", error)
        toast.error("Failed to load messages")
      } finally {
        setIsLoading(false)
      }
    }

    loadMessages()

    // Subscribe to real-time updates
    const messageSubscription = messageService.subscribeToMessages(eventId, (payload) => {
      if (payload.eventType === 'INSERT') {
        loadMessages() // Reload threads when new message arrives
      }
    })

    const threadSubscription = messageService.subscribeToThreads(eventId, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        loadMessages() // Reload threads when thread is updated
      }
    })

    return () => {
      messageSubscription.unsubscribe()
      threadSubscription.unsubscribe()
    }
  }, [eventId, router, messageService])

  const handleNewMessage = () => {
    setShowSearch(true)
  }

  const handleSearch = async (query: string) => {
    if (!query.trim() || !eventId) return
    
    try {
      const results = await messageService.searchEventUsers(eventId, query)
      setSearchResults(results)
    } catch (error) {
      console.error("Error searching users:", error)
      toast.error("Failed to search users")
    }
  }

  const handleStartConversation = async (userId: string) => {
    if (!eventId) return
    
    try {
      // Navigate to conversation view
      router.push(`/messages/conversation?eventId=${eventId}&userId=${userId}`)
    } catch (error) {
      console.error("Error starting conversation:", error)
      toast.error("Failed to start conversation")
    }
  }

  const handleThreadClick = (threadId: string) => {
    if (!eventId) return
    router.push(`/messages/conversation?eventId=${eventId}&threadId=${threadId}`)
  }

  const formatTime = (timestamp: string) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
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
        {/* Search Bar */}
        {showSearch && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search attendees to message..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  handleSearch(e.target.value)
                }}
                className="pl-10"
              />
            </div>
            
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {searchResults.map((user) => (
                  <Card
                    key={user.id}
                    className="bg-card border-border cursor-pointer hover:bg-card/80 transition-colors"
                    onClick={() => handleStartConversation(user.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-3">
                        <PresenceAvatar
                          src={user.avatar_url}
                          fallback={`${user.first_name[0]}${user.last_name[0]}`}
                          isPresent={false}
                          size="sm"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">
                            {user.first_name} {user.last_name}
                          </h4>
                          {user.job_title && (
                            <p className="text-sm text-muted-foreground">
                              {user.job_title}
                            </p>
                          )}
                        </div>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            
            {searchQuery && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                No attendees found matching "{searchQuery}"
              </p>
            )}
          </div>
        )}

        {/* Threads List */}
        {threads.length === 0 && !showSearch ? (
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
                    <div className="relative">
                      <PresenceAvatar
                        src={thread.other_participant.avatar_url}
                        fallback={`${thread.other_participant.first_name[0]}${thread.other_participant.last_name[0]}`}
                        isPresent={false}
                        size="md"
                      />
                      {thread.unread_count > 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#EC874E] rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground truncate">
                          {thread.other_participant.first_name} {thread.other_participant.last_name}
                        </h3>
                        <div className="flex items-center space-x-2">
                          {thread.last_message && (
                            <span className="text-xs text-muted-foreground">
                              {formatTime(thread.last_message.created_at)}
                            </span>
                          )}
                          {thread.unread_count > 0 && (
                            <span className="bg-[#BF341E] text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                              {thread.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                      {thread.last_message && (
                        <p className="text-sm text-muted-foreground truncate">
                          {thread.last_message.body}
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
