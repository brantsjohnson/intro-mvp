"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createClientComponentClient } from "@/lib/supabase"
import { MessageService, ThreadWithDetails } from "@/lib/message-service-simple"
import { toast } from "sonner"
import { ArrowLeft, MailPlus, MessageCircle, MessageSquare, Search, Users } from "lucide-react"
import { format, isThisYear, isToday } from "date-fns"

interface EventAttendee {
  id: string
  first_name: string
  last_name: string
  job_title?: string | null
  avatar_url?: string | null
  company?: string | null
}

interface ThreadListItem extends ThreadWithDetails {
  displayName: string
  displaySubtitle: string
  hasNewMessages: boolean
  unreadCount: number
}

const formatThreadTimestamp = (timestamp: string | null): string => {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""

  if (isToday(date)) {
    return format(date, "h:mm a")
  }

  if (isThisYear(date)) {
    return format(date, "MMM d")
  }

  return format(date, "MMM d, yyyy")
}

export function MessagesPage() {
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [filteredThreads, setFilteredThreads] = useState<ThreadListItem[]>([])
  const [attendees, setAttendees] = useState<EventAttendee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAttendeeLoading, setIsAttendeeLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [attendeeSearchQuery, setAttendeeSearchQuery] = useState("")
  const [eventName, setEventName] = useState<string>("")
  const [eventEnded, setEventEnded] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get("eventId")
  const supabase = useMemo(() => createClientComponentClient(), [])
  const messageService = useMemo(() => new MessageService(), [])

  const loadEventDetails = useCallback(async () => {
    if (!eventId) return

    const { data, error } = await supabase
      .from("events")
      .select("event_name, event_ends_at")
      .eq("event_id", eventId)
      .single()

    if (error) {
      console.error("Error loading event details:", error)
      return
    }

    if (data) {
      setEventName(data.event_name)
      const now = new Date()
      const eventEnd = data.event_ends_at ? new Date(data.event_ends_at) : null

      if (eventEnd) {
        const oneDayAfterEnd = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000)
        setEventEnded(now > oneDayAfterEnd)
      } else {
        setEventEnded(false)
      }
    }
  }, [eventId, supabase])

  const decorateThreads = useCallback((items: ThreadWithDetails[]): ThreadListItem[] => {
    const isBrowser = typeof window !== "undefined"
    return items.map((thread) => {
      const displayName = `${thread.other_participant.first_name} ${thread.other_participant.last_name}`.trim()
      const displaySubtitle = thread.other_participant.job_title || ""
      const incomingTimestamps = thread.incoming_message_timestamps ?? []
      let unreadCount = incomingTimestamps.length

      if (isBrowser) {
        const lastSeenKey = `conversation:lastSeen:${thread.id}`
        const lastSeen = window.localStorage.getItem(lastSeenKey)
        if (lastSeen) {
          const lastSeenDate = new Date(lastSeen)
          unreadCount = incomingTimestamps.filter((timestamp) => {
            const ts = new Date(timestamp)
            return !Number.isNaN(ts.getTime()) && ts > lastSeenDate
          }).length
        }
      }

      return {
        ...thread,
        displayName,
        displaySubtitle,
        hasNewMessages: unreadCount > 0,
        unreadCount
      }
    })
  }, [])

  const loadThreads = useCallback(async () => {
    if (!eventId) return

    try {
      const data = await messageService.getThreads(eventId)
      const enriched = decorateThreads(data)
      setThreads(enriched)
    } catch (error) {
      console.error("Error loading threads:", error)
      toast.error("Failed to load conversations")
    }
  }, [decorateThreads, eventId, messageService])

  const loadAttendees = useCallback(async (currentUserId: string) => {
    if (!eventId) return

    setIsAttendeeLoading(true)
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select(`
          user_id,
          users:user_id (
            user_id,
            first_name,
            last_name,
            photo_url,
            career_title,
            company_name
          )
        `)
        .eq("event_id", eventId)
        .neq("user_id", currentUserId)

      if (error) {
        console.error("Error loading event attendees:", error)
        toast.error("Failed to load attendees")
        return
      }

      const formatted: EventAttendee[] = (data || [])
        .map((row: any) => {
          const profile = row?.users
          if (!profile) return null

          return {
            id: profile.user_id,
            first_name: profile.first_name || "",
            last_name: profile.last_name || "",
            job_title: profile.career_title || null,
            avatar_url: profile.photo_url || null,
            company: profile.company_name || null
          }
        })
        .filter(Boolean) as EventAttendee[]

      formatted.sort((a, b) => {
        const aLast = a.last_name.toLowerCase()
        const bLast = b.last_name.toLowerCase()
        if (aLast !== bLast) return aLast.localeCompare(bLast)
        return a.first_name.toLowerCase().localeCompare(b.first_name.toLowerCase())
      })

      setAttendees(formatted)
    } finally {
      setIsAttendeeLoading(false)
    }
  }, [eventId, supabase])

  useEffect(() => {
    if (!eventId) {
      toast.error("Event ID is required")
      router.push("/home")
      return
    }

    let isMounted = true

    const initialize = async () => {
      try {
        setIsLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth")
          return
        }

        await Promise.all([
          loadEventDetails(),
          loadThreads(),
          loadAttendees(user.id)
        ])
      } catch (error) {
        console.error("Error initializing messages page:", error)
        toast.error("Unable to load messages")
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    initialize()

    const messageSubscription = messageService.subscribeToMessages(eventId, () => {
      loadThreads()
    })

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(() => {
      if (document.hidden) return
      loadThreads().catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Passive messages poll failed:", error)
        }
      })
    }, 5000)

    return () => {
      isMounted = false
      messageSubscription.unsubscribe()
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [eventId, router, supabase, loadEventDetails, loadThreads, loadAttendees, messageService])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredThreads(threads)
      return
    }

    const term = searchQuery.toLowerCase()
    setFilteredThreads(
      threads.filter((thread) =>
        thread.displayName.toLowerCase().includes(term) ||
        thread.displaySubtitle.toLowerCase().includes(term)
      )
    )
  }, [threads, searchQuery])

  const filteredAttendeesForDialog = useMemo(() => {
    if (!attendeeSearchQuery.trim()) return attendees

    const query = attendeeSearchQuery.toLowerCase()
    return attendees.filter((attendee) => {
      const fullName = `${attendee.first_name} ${attendee.last_name}`.trim().toLowerCase()
      const job = attendee.job_title?.toLowerCase() || ""
      const company = attendee.company?.toLowerCase() || ""
      return (
        fullName.includes(query) ||
        job.includes(query) ||
        company.includes(query)
      )
    })
  }, [attendees, attendeeSearchQuery])

  const handleThreadClick = (thread: ThreadListItem) => {
    if (!eventId) return
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`conversation:lastSeen:${thread.id}`, new Date().toISOString())
    }
    setThreads((prev) =>
      prev.map((item) => (item.id === thread.id ? { ...item, hasNewMessages: false } : item))
    )
    setFilteredThreads((prev) =>
      prev.map((item) => (item.id === thread.id ? { ...item, hasNewMessages: false } : item))
    )
    router.push(`/messages/conversation?eventId=${eventId}&threadId=${thread.id}`)
  }

  const handleStartConversation = (attendee: EventAttendee) => {
    if (!eventId) return

    const existingThread = threads.find(
      (thread) => thread.other_participant.id === attendee.id
    )

    if (existingThread) {
      router.push(`/messages/conversation?eventId=${eventId}&threadId=${existingThread.id}`)
    } else {
      router.push(`/messages/conversation?eventId=${eventId}&userId=${attendee.id}`)
    }

    setIsDialogOpen(false)
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            {/* Left: Back button (settings style) */}
            <button
              aria-label="Go back"
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full shadow-elevation transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary gradient-primary"
            >
              <ArrowLeft className="h-5 w-5 text-primary-foreground" />
            </button>

            {/* Center: Title and subtitle */}
            <div className="flex-1 text-center">
              <h1 className="text-lg font-semibold text-foreground">Messages</h1>
              {eventName && (
                <p className="text-sm text-muted-foreground">{eventName}</p>
              )}
            </div>

            {/* Right: Message icon + New Message button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(`/messages?eventId=${eventId || ''}`)}
                className="relative w-10 h-10 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/20 gradient-primary"
                style={{
                  border: 'none'
                }}
                aria-label="Open messages"
              >
                <MessageSquare className="h-5 w-5 text-primary-foreground pointer-events-none" />
              </button>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <GradientButton asChild className="rounded-full">
                  <DialogTrigger className="flex items-center justify-center p-2">
                    <MailPlus className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">New message</span>
                  </DialogTrigger>
                </GradientButton>

              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Start a new conversation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Search attendees..."
                    value={attendeeSearchQuery}
                    onChange={(event) => setAttendeeSearchQuery(event.target.value)}
                    className="pl-10"
                  />
                  {isAttendeeLoading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      Loading attendees...
                    </div>
                  ) : filteredAttendeesForDialog.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      No attendees found
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-2">
                      {filteredAttendeesForDialog.map((attendee) => {
                        const fullName = `${attendee.first_name} ${attendee.last_name}`.trim()
                        const subtitleParts = [attendee.job_title, attendee.company].filter(Boolean)

                        return (
                          <Card
                            key={attendee.id}
                            className="cursor-pointer border-border bg-card hover:bg-card/80 transition-colors"
                            onClick={() => handleStartConversation(attendee)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center space-x-3">
                                <PresenceAvatar
                                  src={attendee.avatar_url || undefined}
                                  fallback={fullName
                                    .split(" ")
                                    .map((part) => part[0])
                                    .join("")}
                                  isPresent={false}
                                  size="md"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-foreground truncate">{fullName}</p>
                                  {subtitleParts.length > 0 && (
                                    <p className="text-sm text-muted-foreground truncate">
                                      {subtitleParts.join(" · ")}
                                    </p>
                                  )}
                                </div>
                                <Button variant="ghost" size="icon">
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 flex-1 w-full">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
            />
          </div>

          {eventEnded && (
            <div className="p-4 bg-muted/50 border border-border rounded-lg text-center text-sm text-muted-foreground">
              This event has ended. Messages are read only.
            </div>
          )}

          {filteredThreads.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {searchQuery ? "No conversations found" : "No messages yet"}
              </h3>
              <p className="text-muted-foreground">
                {searchQuery
                  ? `No conversations match "${searchQuery}"`
                  : "Start a new conversation to connect with someone at the event."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredThreads.map((thread) => {
                const { other_participant: participant, last_message: lastMessage, hasNewMessages, unreadCount } = thread
                const previewText = lastMessage?.body ? lastMessage.body : "Say hello and start planning your meetup."
                const timestamp = lastMessage?.created_at || thread.updated_at
                const formattedTime = formatThreadTimestamp(timestamp ?? null)

                return (
                  <Card
                    key={thread.id}
                    className={`bg-card border-border cursor-pointer transition-colors ${
                      hasNewMessages ? "hover:bg-card/90" : "hover:bg-card/80"
                    }`}
                    onClick={() => handleThreadClick(thread)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <PresenceAvatar
                          src={participant.avatar_url || undefined}
                          fallback={`${participant.first_name[0] ?? ""}${participant.last_name[0] ?? ""}`}
                          isPresent={false}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-semibold text-foreground truncate">
                              {thread.displayName}
                              {thread.displaySubtitle && (
                                <span className="font-normal text-muted-foreground"> - {thread.displaySubtitle}</span>
                              )}
                            </p>
                            <div className="flex items-center gap-2">
                              {formattedTime && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formattedTime}
                                </span>
                              )}
                              {unreadCount > 0 && (
                                <span className="inline-flex items-center justify-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                                  {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                            {previewText}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
