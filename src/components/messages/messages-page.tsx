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
import { ArrowLeft, MessageSquare, Search, Users } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface AttendeeWithUnread {
  id: string
  first_name: string
  last_name: string
  avatar_url?: string | null
  job_title?: string | null
  unread_count: number
  has_thread: boolean
}

export function MessagesPage() {
  const [attendees, setAttendees] = useState<AttendeeWithUnread[]>([])
  const [filteredAttendees, setFilteredAttendees] = useState<AttendeeWithUnread[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [eventName, setEventName] = useState<string>("")
  const [eventEnded, setEventEnded] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get('eventId')
  const messageService = new MessageService()
  const supabase = createClientComponentClient()

  useEffect(() => {
    if (!eventId) {
      toast.error("Event ID is required")
      router.push("/home")
      return
    }

    const loadAttendees = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth")
          return
        }

        // Load event details
        const { data: eventData } = await supabase
          .from('events')
          .select('name, ends_at')
          .eq('id', eventId)
          .single()
        
        if (eventData) {
          setEventName(eventData.name)
          const now = new Date()
          const eventEnd = new Date(eventData.ends_at)
          setEventEnded(now > eventEnd)
        }

        // Load all attendees in the event
        const { data: eventMembers } = await supabase
          .from('event_members')
          .select(`
            user_id,
            profiles!event_members_user_id_fkey (
              id,
              first_name,
              last_name,
              avatar_url,
              job_title
            )
          `)
          .eq('event_id', eventId)
          .neq('user_id', user.id) // Exclude current user

        if (!eventMembers) return

        // Get existing threads to check for unread counts
        const threadsData = await messageService.getThreads(eventId)
        const threadMap = new Map<string, ThreadWithDetails>()
        threadsData.forEach(thread => {
          threadMap.set(thread.other_participant.id, thread)
        })

        // Format attendees with unread counts
        const attendeesData: AttendeeWithUnread[] = eventMembers
          .map(member => {
            const profile = member.profiles
            if (!profile) return null
            
            const thread = threadMap.get(profile.id)
            return {
              id: profile.id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              avatar_url: profile.avatar_url,
              job_title: profile.job_title,
              unread_count: thread?.unread_count || 0,
              has_thread: !!thread
            }
          })
          .filter(Boolean) as AttendeeWithUnread[]

        // Sort alphabetically by last name, then first name
        attendeesData.sort((a, b) => {
          const aLast = a.last_name.toLowerCase()
          const bLast = b.last_name.toLowerCase()
          if (aLast !== bLast) return aLast.localeCompare(bLast)
          return a.first_name.toLowerCase().localeCompare(b.first_name.toLowerCase())
        })

        setAttendees(attendeesData)
        setFilteredAttendees(attendeesData)
      } catch (error) {
        console.error("Error loading attendees:", error)
        toast.error("Failed to load attendees")
      } finally {
        setIsLoading(false)
      }
    }

    loadAttendees()

    // Subscribe to real-time updates
    const messageSubscription = messageService.subscribeToMessages(eventId, () => {
      loadAttendees() // Reload when messages change
    })

    return () => {
      messageSubscription.unsubscribe()
    }
  }, [eventId, router, messageService, supabase])

  // Handle search filtering
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredAttendees(attendees)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = attendees.filter(attendee => 
      attendee.first_name.toLowerCase().includes(query) ||
      attendee.last_name.toLowerCase().includes(query) ||
      `${attendee.first_name} ${attendee.last_name}`.toLowerCase().includes(query)
    )
    setFilteredAttendees(filtered)
  }, [searchQuery, attendees])

  const handleAttendeeClick = (attendee: AttendeeWithUnread) => {
    if (!eventId) return
    
    if (eventEnded) {
      toast.error("This event has ended. Messages are read-only.")
      return
    }
    
    router.push(`/messages/conversation?eventId=${eventId}&userId=${attendee.id}`)
  }

  const getSectionHeader = (attendee: AttendeeWithUnread, index: number) => {
    if (index === 0) return attendee.last_name[0].toUpperCase()
    
    const prevAttendee = filteredAttendees[index - 1]
    if (prevAttendee.last_name[0].toLowerCase() !== attendee.last_name[0].toLowerCase()) {
      return attendee.last_name[0].toUpperCase()
    }
    
    return null
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
            
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                Messages
              </h1>
              {eventName && (
                <p className="text-sm text-muted-foreground">
                  {eventName}
                </p>
              )}
            </div>

            <div className="w-9 h-9" /> {/* Spacer for balance */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search attendees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Event Ended Banner */}
        {eventEnded && (
          <div className="mb-6 p-4 bg-muted/50 border border-border rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              This event has ended. Messages are read-only.
            </p>
          </div>
        )}

        {/* Attendees List */}
        {filteredAttendees.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {searchQuery ? "No people match your search" : "No attendees found"}
            </h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? `No attendees found matching "${searchQuery}"`
                : "There are no other attendees in this event yet."
              }
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredAttendees.map((attendee, index) => {
              const sectionHeader = getSectionHeader(attendee, index)
              
              return (
                <div key={attendee.id}>
                  {/* Section Header */}
                  {sectionHeader && (
                    <div className="sticky top-16 bg-background/95 backdrop-blur-sm py-2 px-4 border-b border-border">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {sectionHeader}
                      </h2>
                    </div>
                  )}
                  
                  {/* Attendee Row */}
                  <Card
                    className="bg-card border-border cursor-pointer hover:bg-card/80 transition-colors"
                    onClick={() => handleAttendeeClick(attendee)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <PresenceAvatar
                            src={attendee.avatar_url}
                            fallback={`${attendee.first_name[0]}${attendee.last_name[0]}`}
                            isPresent={false}
                            size="md"
                          />
                          {attendee.unread_count > 0 && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#EC874E] rounded-full"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground">
                            {attendee.first_name} {attendee.last_name}
                          </h3>
                          {attendee.job_title && (
                            <p className="text-sm text-muted-foreground">
                              {attendee.job_title}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {attendee.unread_count > 0 && (
                            <span className="bg-[#BF341E] text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                              {attendee.unread_count}
                            </span>
                          )}
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
