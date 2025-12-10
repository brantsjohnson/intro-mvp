"use client"

import { useState, useEffect, MouseEvent, useCallback, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { Button } from "@/components/ui/button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { MatchCard } from "@/components/ui/match-card"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClientComponentClient } from "@/lib/supabase"
import { MessageService } from "@/lib/message-service-simple"
import { User, Profile, Event } from "@/lib/types"
import { getAvatarUrl } from "@/lib/utils"
import { decryptEventCode } from "@/lib/event-code-encryption"
import { haptics } from "@/lib/haptics"
import { 
  Users, 
  MessageSquare, 
  MapPin,
  Calendar,
  XIcon,
  Plus,
  QrCode,
  UserPlus,
  ArrowRight,
  RefreshCw
} from "lucide-react"
import { UserGuide, type GuideStep } from "@/components/ui/user-guide"

interface StructuredMatchExplanation {
  connection_type: string
  reason_title: string
  reason_summary: string
  shared_tags: string[]
  helpfulness_bullets: string[]
  suggested_icebreaker: string
}

interface MatchWithProfile {
  id: string
  summary: string
  bases: string[]
  shared_activities: string
  dive_deeper: string
  profile: Profile
  is_present: boolean
  structured_explanation?: StructuredMatchExplanation
  connection_type?: string
  algorithm_version?: string | null
}

interface ConnectionWithProfile {
  id: string
  source: string
  created_at: string
  profile: Profile
  connection_reason?: string
}

type ManualConnectionStatus = "pending-incoming" | "pending-outgoing" | "confirmed"

interface ManualConnectionItem {
  id: string
  eventId: string
  aId: string
  bId: string
  connectionKind: string
  profile: Profile
  status: ManualConnectionStatus
  createdAt: string
  userAddMethod?: string | null
  createdByUserId?: string | null
}

type DirectoryPersonStatus = "self" | "connected" | "pending-incoming" | "pending-outgoing" | "available"

interface DirectoryPerson {
  profile: Profile
  status: DirectoryPersonStatus
  connectionReason?: string | null
  isPresent?: boolean
}

// Guide steps configuration
const guideSteps: GuideStep[] = [
  {
    id: "suggested-connections",
    targetSelector: '[data-guide="suggested-connections"]',
    title: "People You Should Know",
    subtext: "The top three matches will appear here. They are matched based on the information you provided.",
    position: "auto",
    highlightShape: "rounded"
  },
  {
    id: "qr-section",
    targetSelector: '[data-guide="qr-section"]',
    title: "Skip the small talk",
    subtext: "Scan someone's QR code to see their profile and what you have in common. This does not add them on LinkedIn.",
    position: "auto",
    highlightShape: "rounded"
  },
  {
    id: "directory",
    targetSelector: '[data-guide="directory"]',
    title: "Who you've met",
    subtext: "Find all those you connected with during the event to help you follow up afterward.",
    position: "auto",
    highlightShape: "pill"
  },
  {
    id: "all-attendees-btn",
    targetSelector: '[data-guide="all-attendees-btn"]',
    title: "Who is here",
    subtext: "You can see all additional attendees beyond those you've connected with.",
    position: "auto",
    highlightShape: "pill"
  },
  {
    id: "profile-avatar",
    targetSelector: '[data-guide="profile-avatar"]',
    title: "Your settings",
    subtext: "Add or switch to another event or edit your information here.",
    position: "auto",
    highlightShape: "circle"
  },
  {
    id: "messages-icon",
    targetSelector: '[data-guide="messages-icon"]',
    title: "Message Attendees",
    subtext: "Message attendees to coordinate meeting. You'll be notified via email when you have a new message.",
    position: "auto",
    highlightShape: "circle"
  }
]

export function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [matches, setMatches] = useState<MatchWithProfile[]>([])
  const [connections, setConnections] = useState<ConnectionWithProfile[]>([])
  const [manualConnections, setManualConnections] = useState<ManualConnectionItem[]>([])
  const [directory, setDirectory] = useState<DirectoryPerson[]>([])
  const [directoryFilter, setDirectoryFilter] = useState<"all" | "connected">("connected")
  const [isPresent, setIsPresent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [isJoiningEvent, setIsJoiningEvent] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [withdrawTarget, setWithdrawTarget] = useState<ManualConnectionItem | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const lastConnectionCheckRef = useRef<string | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient() as any
  const messageService = useMemo(() => new MessageService(), [])
  const unreadPollingRef = useRef<NodeJS.Timeout | null>(null)
  const [hasProcessedAutoJoin, setHasProcessedAutoJoin] = useState(false)

  const filteredDirectory = useMemo(() => {
    if (directoryFilter === "connected") {
      return directory.filter((entry) => entry.status === "connected")
    }

    return directory.filter((entry) => entry.status !== "self")
  }, [directory, directoryFilter])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
      }
    }
    
    // Initial check
    getUser()
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      console.log('Auth state changed:', event, session?.user?.id)
      if (session?.user) {
        setUser(session.user)
      } else if (event === 'SIGNED_OUT') {
        router.push("/auth")
      }
    })
    
    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase.auth])

  useEffect(() => {
    if (user) {
      loadUserData()
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle auto-join with encrypted code
  useEffect(() => {
    const handleAutoJoin = async () => {
      if (!user || hasProcessedAutoJoin || isLoading) return

      const encryptedCode = searchParams.get('code')
      if (!encryptedCode) return

      setHasProcessedAutoJoin(true)

      try {
        // Decrypt the event code
        const eventCode = decryptEventCode(encryptedCode)
        
        if (!eventCode) {
          console.error('Invalid encrypted event code')
          // Remove invalid code from URL
          router.replace('/home')
          return
        }

        // Check if user is already in this event
        const { data: event } = await supabase
          .from("events")
          .select("event_id")
          .eq("event_code", eventCode.toUpperCase())
          .maybeSingle()

        if (!event) {
          router.replace('/home')
          return
        }

        const { data: existingMember } = await supabase
          .from("attendance")
          .select("event_id")
          .eq("event_id", event.event_id)
          .eq("user_id", user.id)
          .maybeSingle()

        if (existingMember) {
          // Already in event - redirect to onboarding with eventId (remove code from URL)
          router.replace(`/onboarding?eventId=${event.event_id}&from=auto-join`)
          return
        }

        // Auto-join the event (inline logic to avoid scope issues)
        setIsJoiningEvent(true)
        try {
          // Join the event
          const { error: joinError } = await supabase
            .from("attendance")
            .insert({
              event_id: event.event_id,
              user_id: user.id,
              checked_in_at: new Date().toISOString()
            })

          if (joinError) {
            router.replace('/home')
            return
          }

          // Trigger match refresh for the new user (in background)
          try {
            await fetch('/api/refresh-matches', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                eventId: event.event_id, 
                newUserId: user.id 
              }),
            })
          } catch (error) {
            console.error('Failed to refresh matches for new user:', error)
            // Don't show error to user, this is a background process
          }

          // Redirect to onboarding (code will be removed from URL)
          router.replace(`/onboarding?from=event-join&eventId=${event.event_id}`)
        } finally {
          setIsJoiningEvent(false)
        }
      } catch (error) {
        console.error('Error in auto-join:', error)
        router.replace('/home')
      }
    }

    handleAutoJoin()
  }, [user, searchParams, hasProcessedAutoJoin, isLoading, router, supabase])

  const loadUnreadCount = useCallback(async () => {
    if (!currentEvent || !user) {
      setUnreadMessageCount(0)
      return
    }

    try {
      const threads = await messageService.getThreads(currentEvent.id)

      const count = threads.reduce((total, thread) => {
        const incomingTimestamps = thread.incoming_message_timestamps ?? []

        if (typeof window === "undefined") {
          return total + incomingTimestamps.length
        }

        const lastSeen = window.localStorage.getItem(`conversation:lastSeen:${thread.id}`)
        if (!lastSeen) {
          return total + incomingTimestamps.length
        }

        const lastSeenDate = new Date(lastSeen)
        const unreadForThread = incomingTimestamps.filter((timestamp) => {
          const ts = new Date(timestamp)
          return !Number.isNaN(ts.getTime()) && ts > lastSeenDate
        }).length

        return total + unreadForThread
      }, 0)

      setUnreadMessageCount(count)
    } catch (error) {
      console.error("Error loading unread count:", error)
    }
  }, [currentEvent, user, messageService])

  // Load unread message count when current event changes
  useEffect(() => {
    void loadUnreadCount()

    if (!currentEvent) {
      if (unreadPollingRef.current) {
        clearInterval(unreadPollingRef.current)
        unreadPollingRef.current = null
      }
      return
    }

    const subscription = messageService.subscribeToMessages(currentEvent.id, () => {
      void loadUnreadCount()
    })

    if (unreadPollingRef.current) {
      clearInterval(unreadPollingRef.current)
    }

    unreadPollingRef.current = setInterval(() => {
      if (document.hidden) return
      void loadUnreadCount()
    }, 5000)

    return () => {
      subscription.unsubscribe()
      if (unreadPollingRef.current) {
        clearInterval(unreadPollingRef.current)
        unreadPollingRef.current = null
      }
    }
  }, [currentEvent, loadUnreadCount, messageService])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleLastSeenUpdate = () => {
      void loadUnreadCount()
    }

    window.addEventListener("conversation:lastSeen", handleLastSeenUpdate)
    return () => {
      window.removeEventListener("conversation:lastSeen", handleLastSeenUpdate)
    }
  }, [loadUnreadCount])

  // Refresh data when page comes into focus (e.g., after returning from event join)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        loadUserData()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for new QR code connections and automatically open profiles
  useEffect(() => {
    if (!user || !currentEvent) return

    // Subscribe to new connections for this user
    const connectionChannel = supabase
      .channel(`qr-connections-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connections',
          filter: `event_id=eq.${currentEvent.id}`,
        },
        async (payload: any) => {
          const newConnection = payload.new
          const [aId, bId] = newConnection.a_id < newConnection.b_id 
            ? [newConnection.a_id, newConnection.b_id]
            : [newConnection.b_id, newConnection.a_id]
          
          // Check if this connection involves the current user
          const isInvolved = aId === user.id || bId === user.id
          const isQRConnection = newConnection.user_add_method === 'qr'
          
          if (isInvolved && isQRConnection && newConnection.connection_kind === 'user_added') {
            // Determine the other user's ID
            const otherUserId = aId === user.id ? bId : aId
            
            // Prevent duplicate navigation (check if we already navigated to this user)
            const connectionKey = `${newConnection.connection_id}-${otherUserId}`
            if (lastConnectionCheckRef.current === connectionKey) {
              return
            }
            lastConnectionCheckRef.current = connectionKey
            
            // Only auto-navigate if we're on the home page (not already viewing a profile)
            const currentPath = window.location.pathname
            if (currentPath === '/home' || currentPath.startsWith('/home?')) {
              // Small delay to ensure connection is fully processed
              setTimeout(() => {
                router.push(`/profile/${otherUserId}?source=qr&eventId=${currentEvent.id}`)
              }, 500)
            }
          }
        }
      )
      .subscribe()

    return () => {
      connectionChannel.unsubscribe()
    }
  }, [user, currentEvent, router, supabase])


  const loadUserData = async () => {
    if (!user) return
    
    try {
      // Load user row and map to legacy Profile shape used by UI
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("user_id, first_name, last_name, email, photo_url, career_title, company_name")
        .eq("user_id", user.id)
        .single()

      if (userError) {
        return
      }

      const avatarUrl = getAvatarUrl(userRow.photo_url)
      console.log('[loadUserData] Avatar URL conversion:', {
        original: userRow.photo_url,
        originalType: typeof userRow.photo_url,
        converted: avatarUrl,
        convertedType: typeof avatarUrl,
        userId: userRow.user_id,
        isFullUrl: userRow.photo_url?.startsWith('http'),
        isStoragePath: userRow.photo_url && !userRow.photo_url.startsWith('http')
      })
      
      const mappedProfile: Profile = {
        id: userRow.user_id,
        first_name: userRow.first_name || "",
        last_name: userRow.last_name || "",
        email: userRow.email || "",
        avatar_url: avatarUrl,
        job_title: userRow.career_title || null,
        company: userRow.company_name || null,
        what_do_you_do: null,
        location: null,
        linkedin_url: null,
        mbti: null,
        enneagram: null,
        networking_goals: null,
        hobbies: null,
        expertise_tags: null,
        consent: true,
      }
      setProfile(mappedProfile)

      // Check for saved event preference first
      const savedEventId = typeof window !== 'undefined' 
        ? localStorage.getItem(`current_event_id_${user.id}`)
        : null

      // Load current event - prefer saved preference, otherwise most recent
      let attendanceRows: any[] | null = null
      let attendanceError: any = null

      if (savedEventId) {
        // Try to load the saved event preference
        const { data, error } = await supabase
          .from("attendance")
          .select("checked_in_at, event_id, onboarding_completed, why_attending_text, connection_types_selected, connection_followups_json, business_need_text, events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location)")
          .eq("user_id", user.id)
          .eq("event_id", savedEventId)
          .limit(1)
        
        attendanceRows = data
        attendanceError = error

        // If saved event not found, fall back to most recent
        if (!attendanceRows || attendanceRows.length === 0) {
          console.log("Saved event not found, falling back to most recent event")
          if (typeof window !== 'undefined') {
            localStorage.removeItem(`current_event_id_${user.id}`)
          }
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("attendance")
            .select("checked_in_at, event_id, onboarding_completed, why_attending_text, connection_types_selected, connection_followups_json, business_need_text, events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
          
          attendanceRows = fallbackData
          attendanceError = fallbackError
        }
      } else {
        // Load most recent event
        const { data, error } = await supabase
          .from("attendance")
          .select("checked_in_at, event_id, onboarding_completed, why_attending_text, connection_types_selected, connection_followups_json, business_need_text, events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
        
        attendanceRows = data
        attendanceError = error
      }

      console.log("Attendance query result:", { 
        attendanceRows, 
        attendanceError, 
        userId: user.id,
        savedEventId,
        usingSavedPreference: !!savedEventId
      })

      if (attendanceError) {
        console.error("Error loading attendance:", attendanceError)
        // Clear current event if there's an error
        setCurrentEvent(null)
        setIsPresent(false)
        setMatches([])
      } else if (attendanceRows && attendanceRows.length > 0) {
        const row: any = attendanceRows[0]
        if (row?.events) {
          const mappedEvent: Event = {
            id: row.events.event_id,
            name: row.events.event_name,
            code: row.events.event_code,
            starts_at: row.events.event_starts_at,
            ends_at: row.events.event_ends_at,
            location: row.events.event_location,
            header_image_url: null,
            is_active: true,
            matchmaking_enabled: true,
          }
          setCurrentEvent(mappedEvent)
          setIsPresent(!!row.checked_in_at)
          
          // Recreate attendance record from onboarding data on reload
          // This ensures derived fields (tags, summaries, embeddings) are regenerated
          if (row.onboarding_completed && (row.why_attending_text || row.connection_types_selected)) {
            console.log("Recreating attendance record from onboarding data on reload")
            try {
              // Call derive-attendance to regenerate derived fields from onboarding data
              await fetch('/api/derive-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  eventId: row.events.event_id, 
                  userId: user.id 
                })
              }).catch(error => {
                console.error('Error recreating attendance on reload (background):', error)
                // Don't show error to user, this is background processing
              })
            } catch (error) {
              console.error('Error calling derive-attendance on reload:', error)
            }
          }
          
          loadMatches(mappedEvent.id)
          const connectionData = await loadConnections(mappedEvent.id)
          await loadDirectory(mappedEvent.id, connectionData)
        } else {
          // No event data, clear everything
          setCurrentEvent(null)
          setIsPresent(false)
          setMatches([])
          setConnections([])
          setManualConnections([])
          setDirectory([])
        }
      } else {
        // No event membership found, clear everything
        console.log("No event membership found for user:", user.id)
        setCurrentEvent(null)
        setIsPresent(false)
        setMatches([])
        setConnections([])
        setManualConnections([])
        setDirectory([])
      }

    } catch {
    } finally {
      setIsLoading(false)
    }
  }

  const loadMatches = async (eventId: string) => {
    if (!user) return
    
    try {
      const { data: edges, error: edgesError } = await supabase
        .from("connections")
        .select("a_id, b_id, match_explanation_text, match_score_breakdown_json, created_at, match_algorithm_version")
        .eq("event_id", eventId)
        .eq("connection_kind", "system_match")
        .or(`a_id.eq.${user.id},b_id.eq.${user.id}`)
        .order("created_at", { ascending: false }) // Get newest matches first

      if (edgesError) {
        console.error("Failed to load matches:", edgesError)
        return
      }

      if (!edges) {
        return
      }

      const edgesList = (edges ?? []) as any[]

      console.log(`[loadMatches] Loaded ${edgesList.length} match records from database`)

      // Deduplicate by user pair - keep only the most recent match per (a_id, b_id) pair
      const matchMap = new Map<string, any>()
      for (const edge of edgesList) {
        const pairKey = edge.a_id < edge.b_id ? `${edge.a_id}-${edge.b_id}` : `${edge.b_id}-${edge.a_id}`
        const existing = matchMap.get(pairKey)
        
        // Keep the most recent match (since we ordered by created_at DESC, first one is newest)
        if (!existing || new Date(edge.created_at) > new Date(existing.created_at)) {
          matchMap.set(pairKey, edge)
        }
      }

      const deduplicatedEdges = Array.from(matchMap.values())
      console.log(`[loadMatches] After deduplication: ${deduplicatedEdges.length} unique matches`)

      if (deduplicatedEdges.length === 0) {
        setMatches([])
        return
      }

      const otherUserIds = deduplicatedEdges.map(e => (e.a_id === user.id ? e.b_id : e.a_id)).filter(Boolean) as string[]
      const uniqueOtherIds = Array.from(new Set(otherUserIds))

      if (uniqueOtherIds.length === 0) {
        setMatches([])
        return
      }

      const { data: others, error: othersError } = await supabase
        .from("users")
        .select("user_id, first_name, last_name, career_title, company_name, photo_url")
        .in("user_id", uniqueOtherIds)

      if (othersError) {
        console.error("Failed to load other users for connections:", othersError)
        return
      }

      if (!others) {
        return
      }

      // Load attendance/presence data for matched users
      const { data: attendanceData, error: attendanceError } = await supabase
        .from("attendance")
        .select("user_id, checked_in_at")
        .eq("event_id", eventId)
        .in("user_id", uniqueOtherIds)

      if (attendanceError) {
        console.warn("Failed to load attendance data for matches:", attendanceError)
      }

      const otherRows = (others ?? []) as any[]
      const userMap = new Map(otherRows.map((u: any) => [u.user_id, u]))
      const attendanceMap = new Map((attendanceData || []).map((a: any) => [a.user_id, a.checked_in_at]))

      const formatted: MatchWithProfile[] = deduplicatedEdges
        .map(e => {
          const otherId = e.a_id === user.id ? e.b_id : e.a_id
          const u = otherId ? userMap.get(otherId) : null
          if (!u) return null
          
          // Parse match data from JSON or use fallback
          let matchData: {
            summary?: string
            why_meet?: string
            shared_activities?: string[] | string
            dive_deeper?: string
            bases?: string[]
          } = {}
          
          if (e.match_score_breakdown_json && typeof e.match_score_breakdown_json === 'object') {
            matchData = e.match_score_breakdown_json as typeof matchData
          }
          
          // Handle shared_activities - could be array or string
          let sharedActivitiesStr = ""
          if (matchData.shared_activities) {
            if (Array.isArray(matchData.shared_activities)) {
              sharedActivitiesStr = matchData.shared_activities.join(" ")
            } else {
              sharedActivitiesStr = matchData.shared_activities
            }
          }
          
          const profile: Profile = {
            id: u.user_id,
            first_name: u.first_name || "",
            last_name: u.last_name || "",
            email: "",
            avatar_url: getAvatarUrl(u.photo_url),
            job_title: u.career_title || null,
            company: u.company_name || null,
            what_do_you_do: null,
            location: null,
            linkedin_url: null,
            mbti: null,
            enneagram: null,
            networking_goals: null,
            hobbies: null,
            expertise_tags: null,
            consent: true,
          }
          
          const explanation = e.match_explanation_text || matchData.summary || ""
          const structuredExplanation = (matchData as any).structured_explanation as StructuredMatchExplanation | undefined
          const algorithmVersion = e.match_algorithm_version || null
          const isAIMatch = algorithmVersion === "v4_ai_decision_tree"

          return {
            id: e.created_at || `${u.user_id}-${explanation}`,
            summary: structuredExplanation?.reason_summary || explanation,
            bases: matchData.bases || [],
            shared_activities: sharedActivitiesStr,
            dive_deeper: matchData.dive_deeper || "",
            profile,
            is_present: Boolean(attendanceMap.get(otherId)),
            structured_explanation: structuredExplanation,
            connection_type: structuredExplanation?.connection_type,
            algorithm_version: algorithmVersion,
          }
        })
        .filter(Boolean) as MatchWithProfile[]

      // Sort by created_at (newest first) - already sorted from query, but ensure it
      formatted.sort((a, b) => {
        const aTime = new Date(a.id).getTime()
        const bTime = new Date(b.id).getTime()
        return bTime - aTime // Descending (newest first)
      })
      
      console.log(`[loadMatches] Final matches: ${formatted.length}, showing top 3`)
      console.log(`[loadMatches] Match summaries:`, formatted.map(m => ({ 
        name: `${m.profile.first_name} ${m.profile.last_name}`, 
        summary: m.summary?.substring(0, 50),
        algorithm: m.algorithm_version || 'unknown',
        isAI: m.algorithm_version === "v4_ai_decision_tree" ? "AI" : m.algorithm_version === "v3_persona_intelligence" ? "Rule-based" : "Unknown"
      })))
      
      setMatches(formatted.slice(0, 3))
    } catch (error) {
      console.error("Failed to load matches:", error)
    }
  }

  const loadConnections = async (eventId: string): Promise<{ confirmed: ConnectionWithProfile[]; manual: ManualConnectionItem[] }> => {
    if (!user) {
      setConnections([])
      setManualConnections([])
      return { confirmed: [], manual: [] }
    }
    
    try {
      const { data: edges, error: edgesError } = await supabase
        .from("connections")
        .select("event_id, a_id, b_id, user_add_method, created_at, connection_kind, created_by_user_id")
        .eq("event_id", eventId)
        .or(`a_id.eq.${user.id},b_id.eq.${user.id}`)

      if (edgesError || !edges) {
        console.error("Failed to load connections:", edgesError)
        setConnections([])
        setManualConnections([])
        return { confirmed: [], manual: [] }
      }

      const edgesList = (edges ?? []) as any[]

      if (edgesList.length === 0) {
        setConnections([])
        setManualConnections([])
        return { confirmed: [], manual: [] }
      }

      const otherUserIds = edgesList.map((e: any) => (e.a_id === user.id ? e.b_id : e.a_id)).filter(Boolean) as string[]
      const uniqueOtherIds = Array.from(new Set(otherUserIds))

      if (uniqueOtherIds.length === 0) {
        setConnections([])
        setManualConnections([])
        return { confirmed: [], manual: [] }
      }

      const { data: others, error: othersError } = await supabase
        .from("users")
        .select("user_id, first_name, last_name, career_title, company_name, photo_url")
        .in("user_id", uniqueOtherIds)

      if (othersError || !others) {
        console.error("Failed to load other users for connections:", othersError)
        setConnections([])
        setManualConnections([])
        return { confirmed: [], manual: [] }
      }

      const otherRows = (others ?? []) as any[]
      const userMap = new Map(otherRows.map((u: any) => [u.user_id, u]))

      const confirmedConnections: ConnectionWithProfile[] = []
      const manualList: ManualConnectionItem[] = []

      edgesList.forEach((e: any) => {
        const otherId = e.a_id === user.id ? e.b_id : e.a_id
        if (!otherId) {
          return
        }

        const u = userMap.get(otherId) as any
        if (!u) {
          return
        }

        const profile: Profile = {
          id: u.user_id,
          first_name: u.first_name || "",
          last_name: u.last_name || "",
          email: "",
          avatar_url: getAvatarUrl(u.photo_url),
          job_title: u.career_title || null,
          company: u.company_name || null,
          what_do_you_do: null,
          location: null,
          linkedin_url: null,
          mbti: null,
          enneagram: null,
          networking_goals: null,
          hobbies: null,
          expertise_tags: null,
          consent: true,
        }

        const [pairedA, pairedB] = e.a_id < e.b_id ? [e.a_id, e.b_id] : [e.b_id, e.a_id]
        const isPending = e.connection_kind === 'user_request_pending'
        const initiatedByCurrentUser = e.created_by_user_id === user.id

        if (isPending) {
          manualList.push({
            id: `${pairedA}-${pairedB}-pending`,
            eventId: e.event_id,
            aId: pairedA,
            bId: pairedB,
            connectionKind: e.connection_kind,
            profile,
            status: initiatedByCurrentUser ? "pending-outgoing" : "pending-incoming",
            createdAt: e.created_at || new Date().toISOString(),
            userAddMethod: e.user_add_method,
            createdByUserId: e.created_by_user_id,
          })
          return
        }

        if (e.user_add_method === 'qr' || e.user_add_method === 'manual_add' || e.user_add_method === 'manual_directory') {
          manualList.push({
            id: `${pairedA}-${pairedB}-manual`,
            eventId: e.event_id,
            aId: pairedA,
            bId: pairedB,
            connectionKind: e.connection_kind,
            profile,
            status: "confirmed",
            createdAt: e.created_at || new Date().toISOString(),
            userAddMethod: e.user_add_method,
            createdByUserId: e.created_by_user_id,
          })
        }

        const reason = e.user_add_method === 'qr'
          ? 'QR Code Connection'
          : e.user_add_method === 'manual_directory'
            ? 'Manual Connection'
            : (e.connection_kind === 'system_match' ? 'AI Match' : 'Manual Add')

        confirmedConnections.push({
          id: `${e.a_id}-${e.b_id}-${e.created_at}`,
          source: e.user_add_method || (e.connection_kind === 'system_match' ? 'match' : 'manual'),
          created_at: e.created_at || new Date().toISOString(),
          profile,
          connection_reason: reason
        })
      })

      confirmedConnections.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      manualList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      const pendingManualList = manualList.filter((item) => item.status !== "confirmed")

      setConnections(confirmedConnections)
      setManualConnections(pendingManualList)

      return { confirmed: confirmedConnections, manual: pendingManualList }
    } catch (error) {
      console.error("Failed to load connections:", error)
      setConnections([])
      setManualConnections([])
      return { confirmed: [], manual: [] }
    }
  }

  const loadDirectory = async (
    eventId: string,
    connectionData?: { confirmed: ConnectionWithProfile[]; manual: ManualConnectionItem[] }
  ) => {
    if (!user) {
      setDirectory([])
      return
    }

    try {
      const confirmed = connectionData?.confirmed ?? connections
      const manual = connectionData?.manual ?? manualConnections
      const connectionReasonMap = new Map(
        confirmed.map((connection) => [connection.profile.id, connection.connection_reason ?? null])
      )

      // Get IDs of people we've actually met or messaged (not just system matches)
      const actuallyConnectedIds = new Set(
        confirmed
          .filter(c => 
            c.source === 'met' || 
            c.source === 'manual_add' || 
            c.source === 'qr' || 
            c.source === 'manual_directory'
          )
          .map((c) => c.profile.id)
      )
      
      const pendingOutgoingIds = new Set(manual.filter(m => m.status === 'pending-outgoing').map(m => m.profile.id))
      const pendingIncomingIds = new Set(manual.filter(m => m.status === 'pending-incoming').map(m => m.profile.id))

      // Check for users we've messaged (conversations exist)
      const { data: conversationsData } = await supabase
        .from("conversations")
        .select("participant_user_ids")
        .eq("event_id", eventId)
        .contains("participant_user_ids", [user.id])

      const messagedUserIds = new Set<string>()
      if (conversationsData) {
        conversationsData.forEach((conv: any) => {
          const participantIds = conv.participant_user_ids || []
          const otherUserId = participantIds.find((id: string) => id !== user.id)
          if (otherUserId) {
            messagedUserIds.add(otherUserId)
          }
        })
      }

      const { data, error } = await supabase
        .from("attendance")
        .select(`
          user_id,
          checked_in_at,
          users:user_id (
            user_id,
            first_name,
            last_name,
            career_title,
            company_name,
            photo_url
          )
        `)
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })

      if (error || !data) {
        console.error("Failed to load directory:", error)
        setDirectory([])
        return
      }

      const formatted = data
        .map((row: any) => {
          const attendee = row?.users
          if (!attendee) {
            return null
          }

          const attendeeProfile: Profile = {
            id: attendee.user_id,
            first_name: attendee.first_name || "",
            last_name: attendee.last_name || "",
            email: "",
            avatar_url: getAvatarUrl(attendee.photo_url),
            job_title: attendee.career_title || null,
            company: attendee.company_name || null,
            what_do_you_do: null,
            location: null,
            linkedin_url: null,
            mbti: null,
            enneagram: null,
            networking_goals: null,
            hobbies: null,
            expertise_tags: null,
            consent: true,
          }

          let status: DirectoryPersonStatus = "available"
          if (attendeeProfile.id === user.id) {
            status = "self"
          } else {
            // Only show as "connected" if they've actually met OR messaged
            const hasActuallyMet = actuallyConnectedIds.has(attendeeProfile.id)
            const hasMessaged = messagedUserIds.has(attendeeProfile.id)
            
            if (hasActuallyMet || hasMessaged) {
              status = "connected"
            } else if (pendingIncomingIds.has(attendeeProfile.id)) {
              status = "pending-incoming"
            } else if (pendingOutgoingIds.has(attendeeProfile.id)) {
              status = "pending-outgoing"
            }
          }

          return {
            profile: attendeeProfile,
            status,
            connectionReason: status === "connected" ? (connectionReasonMap.get(attendeeProfile.id) ?? null) : null,
            isPresent: !!row.checked_in_at,
          } as DirectoryPerson
        })
        .filter(Boolean) as DirectoryPerson[]

      formatted.sort((a, b) => a.profile.first_name.localeCompare(b.profile.first_name))
      setDirectory(formatted)
    } catch (error) {
      console.error("Failed to load directory:", error)
      setDirectory([])
    }
  }

  const refreshConnections = async () => {
    if (!currentEvent) return
    const data = await loadConnections(currentEvent.id)
    await loadDirectory(currentEvent.id, data)
  }

  const togglePresence = async () => {
    if (!currentEvent || !user) return

    setIsLoading(true)
    try {
      const newPresence = !isPresent
      const { error } = await (supabase as any)
        .from("attendance")
        .update({ checked_in_at: newPresence ? new Date().toISOString() : null })
        .eq("event_id", currentEvent.id)
        .eq("user_id", user.id)

      if (error) {
        return
      }

      setIsPresent(newPresence)
    } catch {
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth")
  }

  const handleMatchClick = (match: MatchWithProfile) => {
    if (currentEvent) {
      router.push(`/profile/${match.profile.id}?source=suggested&eventId=${currentEvent.id}`)
    } else {
      router.push(`/profile/${match.profile.id}`)
    }
  }

  const handleQRScan = () => {
    haptics.scan()
    setIsQRScannerOpen(true)
  }

  const handleConnectionCreated = async () => {
    // Refresh matches and connections when a new connection is created
    if (currentEvent) {
      loadMatches(currentEvent.id)
      await refreshConnections()
    }
  }

  const handleConfirmManualConnection = async (item: ManualConnectionItem) => {
    if (!currentEvent) return
    try {
      const [aId, bId] = item.aId < item.bId ? [item.aId, item.bId] : [item.bId, item.aId]
      const { error } = await supabase
        .from("connections")
        .update({
          connection_kind: "user_added",
          user_add_method: item.userAddMethod ?? "manual_directory",
        })
        .eq("event_id", item.eventId)
        .eq("a_id", aId)
        .eq("b_id", bId)
        .eq("connection_kind", item.connectionKind)

      if (error) {
        console.error("Failed to confirm manual connection:", error)
        return
      }

      await refreshConnections()
      router.push(`/profile/${item.profile.id}?source=request&eventId=${currentEvent.id}`)
    } catch (error) {
      console.error("Error confirming manual connection:", error)
    }
  }

  const handleDenyManualConnection = async (item: ManualConnectionItem) => {
    try {
      const [aId, bId] = item.aId < item.bId ? [item.aId, item.bId] : [item.bId, item.aId]
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("event_id", item.eventId)
        .eq("a_id", aId)
        .eq("b_id", bId)
        .eq("connection_kind", item.connectionKind)

      if (error) {
        console.error("Failed to deny manual connection:", error)
        return
      }

      await refreshConnections()
    } catch (error) {
      console.error("Error denying manual connection:", error)
    }
  }

  const handleAddFromDirectory = async (entry: DirectoryPerson) => {
    if (!currentEvent || !user) return
    if (entry.status !== "available") {
      return
    }

    const otherUserId = entry.profile.id
    if (!otherUserId || otherUserId === user.id) {
      return
    }

    const [aId, bId] = user.id < otherUserId ? [user.id, otherUserId] : [otherUserId, user.id]

    try {
      const { error } = await supabase
        .from("connections")
        .insert({
          event_id: currentEvent.id,
          a_id: aId,
          b_id: bId,
          connection_kind: "user_request_pending",
          user_add_method: "manual_directory",
          created_by_user_id: user.id,
        })

      if (error) {
        const duplicate = error.message?.toLowerCase().includes("duplicate")
        if (duplicate) {
        } else {
          console.error("Failed to add connection from directory:", error)
        }
      } else {
      }

      await refreshConnections()
    } catch (error) {
      console.error("Error adding connection from directory:", error)
    }
  }

  const getManualStatusLabel = (item: ManualConnectionItem) => {
    if (item.status === "pending-incoming") {
      return undefined
    }
    if (item.status === "pending-outgoing") {
      return undefined
    }
    if (item.status === "confirmed") {
      return "Connected"
    }
    return undefined
  }

  const getDirectoryStatusLabel = (entry: DirectoryPerson) => {
    // Omit "Connected" status label
    if (entry.status === "connected") {
      return undefined
    }

    if (entry.status === "pending-incoming") {
      return undefined
    }

    if (entry.status === "pending-outgoing") {
      return undefined
    }

    return undefined
  }

  const handleWithdrawManualConnection = async () => {
    if (!withdrawTarget) return

    try {
      setIsWithdrawing(true)
      const [aId, bId] = withdrawTarget.aId < withdrawTarget.bId
        ? [withdrawTarget.aId, withdrawTarget.bId]
        : [withdrawTarget.bId, withdrawTarget.aId]

      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("event_id", withdrawTarget.eventId)
        .eq("a_id", aId)
        .eq("b_id", bId)
        .eq("connection_kind", withdrawTarget.connectionKind)

      if (error) {
        console.error("Failed to withdraw manual connection:", error)
        return
      }

      setWithdrawTarget(null)
      await refreshConnections()
    } catch (error) {
      console.error("Error withdrawing manual connection:", error)
    } finally {
      setIsWithdrawing(false)
    }
  }

  const renderDirectoryAction = (entry: DirectoryPerson) => {
    if (entry.status === "self") {
      return <span className="text-xs font-medium text-muted-foreground">You</span>
    }

    if (entry.status === "connected") {
      return currentEvent ? (
        <div className="flex-shrink-0">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : null
    }

    if (entry.status === "pending-incoming") {
      return <span className="text-xs font-medium text-muted-foreground">Review in Added & Pending</span>
    }

    if (entry.status === "pending-outgoing") {
      return <span className="text-xs font-medium text-muted-foreground">Pending</span>
    }

    return (
      <Button size="sm" onClick={() => handleAddFromDirectory(entry)}>
        Add
      </Button>
    )
  }

  const handleJoinEvent = async (eventCode: string) => {
    setIsJoiningEvent(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsJoiningEvent(false)
        return
      }

      // First, get the event by code
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("event_code", eventCode.toUpperCase())
        .maybeSingle()

      if (eventError) {
        console.error("Event query error:", eventError)
        setIsJoiningEvent(false)
        return
      }

      if (!event) {
        setIsJoiningEvent(false)
        return
      }

      // Check if user is already a member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from("attendance")
        .select("event_id, user_id")
        .eq("event_id", event.event_id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (memberCheckError) {
        console.error("Error checking membership:", memberCheckError)
        setIsJoiningEvent(false)
        return
      }

      if (existingMember) {
        setIsJoiningEvent(false)
        return
      }

      // Join the event
      const { error: joinError } = await supabase
        .from("attendance")
        .insert({
          event_id: event.event_id,
          user_id: user.id,
          checked_in_at: new Date().toISOString()
        })

      if (joinError) {
        setIsJoiningEvent(false)
        return
      }

      // Success haptic feedback
      haptics.success()

      // Trigger match refresh for the new user (in background)
      try {
        await fetch('/api/refresh-matches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            eventId: event.event_id, 
            newUserId: user.id 
          }),
        })
      } catch (error) {
        console.error('Failed to refresh matches for new user:', error)
        // Don't show error to user, this is a background process
      }

      // After joining from Home, ask networking goals; but if user completes onboarding first, they can come back from Home too
      router.push(`/onboarding?from=event-join&eventId=${event.event_id}`)
    } catch (error) {
      console.error("Error joining event:", error)
    } finally {
      setIsJoiningEvent(false)
    }
  }

  const handleRefreshData = () => {
    if (user) {
      loadUserData()
    }
  }

  const handleRefreshMatches = async () => {
    if (!user || !currentEvent || !currentEvent.matchmaking_enabled) {
      return
    }

    setIsRefreshing(true)

    try {
      const response = await fetch('/api/match-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId: currentEvent.id,
          userId: user.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to refresh matches' }))
        throw new Error(errorData.error || 'Failed to refresh matches')
      }

      const result = await response.json()
      
      // Wait a moment for the matchmaker to complete processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Reload matches
      await loadMatches(currentEvent.id)
      
    } catch (error: any) {
      console.error('Error refreshing matches:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
          <p className="text-xs text-muted-foreground mt-2">Do not refresh this page. Could take 30 seconds.</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please complete your profile setup</p>
          <GradientButton onClick={() => router.push("/onboarding")}>
            Complete Setup
          </GradientButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            {/* Left: User avatar with presence indicator */}
            <button
              data-guide="profile-avatar"
              onClick={() => router.push("/settings")}
              className="focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-2xl transition-all hover:shadow-[0px_3px_4px_rgba(0,0,0,0.2)]"
            >
              <PresenceAvatar
                src={profile.avatar_url || undefined}
                fallback={`${profile.first_name[0] || ''}${profile.last_name[0] || ''}`}
                isPresent={isPresent}
                size="md"
              />
            </button>
            
            {/* Center: Intro wordmark */}
            <div className="flex-1 text-center">
              <h1 
                className="text-2xl font-bold text-accent"
                style={{ 
                  fontFamily: 'Changa One, cursive'
                }}
              >
                INTRO
              </h1>
            </div>
            
            {/* Right: Message icon with gradient and unread badge */}
            <button
              data-guide="messages-icon"
              type="button"
              onClick={() => router.push(`/messages?eventId=${currentEvent?.id || ''}`)}
              className="relative w-12 h-12 rounded-2xl flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/20 bg-primary transition-all hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]"
              style={{
                border: 'none'
              }}
              aria-label="Open messages"
            >
              <MessageSquare className="h-6 w-6 text-white pointer-events-none" />
              {unreadMessageCount > 0 && (
                <span className="pointer-events-none absolute -top-1 -right-1 bg-accent text-white text-xs rounded-xl px-2 py-1 min-w-[20px] text-center">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* JOIN EVENT Section - Show when no event is selected */}
          {!currentEvent && (
            <div className="max-w-md mx-auto">
              <EventJoinScanner
                onJoinEvent={handleJoinEvent}
                onScanQR={() => {}} // QR scanning is handled internally by EventJoinScanner
                isLoading={isJoiningEvent}
              />
            </div>
          )}

          {/* Event Title and Presence Section */}
          {currentEvent && (
            <Card className="bg-card border-border shadow-elevation">
              <CardContent className="p-4 text-center space-y-4">
                {/* Event Title */}
                <h2 className="text-2xl font-semibold text-foreground">
                  {currentEvent.name}
                </h2>
                
                {/* Gradient Separator Line */}
                <div 
                  className="h-1 w-full rounded-full bg-primary"
                />
                
                {/* Event Details - Compact Format */}
                <div className="text-sm text-muted-foreground space-y-1">
                  {currentEvent.starts_at && (
                    <p>
                      {(() => {
                        // Parse datetime string directly without timezone conversion
                        // Times are stored as "YYYY-MM-DDTHH:mm" and should be displayed as-is
                        const parseDateTime = (dateTimeStr: string | null) => {
                          if (!dateTimeStr) return null
                          
                          // Handle both "YYYY-MM-DDTHH:mm" and "YYYY-MM-DDTHH:mm:ss" formats
                          const match = dateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/)
                          if (!match) return null
                          
                          const [, year, month, day, hour, minute] = match
                          return {
                            year: parseInt(year, 10),
                            month: parseInt(month, 10),
                            day: parseInt(day, 10),
                            hour: parseInt(hour, 10),
                            minute: parseInt(minute, 10)
                          }
                        }
                        
                        const startParts = parseDateTime(currentEvent.starts_at)
                        if (!startParts) {
                          return "Schedule coming soon"
                        }

                        const endParts = currentEvent.ends_at ? parseDateTime(currentEvent.ends_at) : null
                        
                        // Format date
                        const formatDate = (parts: { year: number; month: number; day: number }) => {
                          const date = new Date(parts.year, parts.month - 1, parts.day)
                          return date.toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })
                        }
                        
                        // Format time (12-hour format)
                        const formatTime = (parts: { hour: number; minute: number }) => {
                          const hour12 = parts.hour % 12 || 12
                          const ampm = parts.hour >= 12 ? 'PM' : 'AM'
                          const minuteStr = String(parts.minute).padStart(2, '0')
                          return `${hour12}:${minuteStr} ${ampm}`
                        }
                        
                        const startDateStr = formatDate(startParts)
                        const startTimeStr = formatTime(startParts)
                        
                        if (endParts) {
                          const endDateStr = formatDate(endParts)
                          const endTimeStr = formatTime(endParts)
                          
                          // If same day, show: "December 9, 2025 @ 9:00 PM - 11:00 PM"
                          // If different day, show: "December 9, 2025 @ 9:00 PM - December 10, 2025 @ 11:00 PM"
                          if (startDateStr === endDateStr) {
                            return `${startDateStr} @ ${startTimeStr} - ${endTimeStr}`
                          } else {
                            return `${startDateStr} @ ${startTimeStr} - ${endDateStr} @ ${endTimeStr}`
                          }
                        } else {
                          return `${startDateStr} @ ${startTimeStr}`
                        }
                      })()}
                    </p>
                  )}
                  {currentEvent.location && (
                    <p className="font-medium">Location: {currentEvent.location}</p>
                  )}
                </div>
                
                {/* I'm Here Button - Only show if not present */}
                {!isPresent && (
                  <button
                    onClick={togglePresence}
                    disabled={isLoading}
                    className="px-8 py-3 rounded-concave text-white font-medium text-lg mx-auto block bg-primary transition-all hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]"
                    style={{
                      border: 'none'
                    }}
                  >
                    I'm Here
                  </button>
                )}
                
                {/* Instructions - Only show if not present */}
                {!isPresent && (
                  <p className="text-muted-foreground text-center text-sm">
                    Let your Intro matches know you're at the conference
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* People You Should Know - Only show when event exists */}
          {currentEvent && (
            <div className="space-y-3 pt-2" data-guide="suggested-connections">
              {/* Title Section */}
              <div className="px-1">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                    <Users className="h-5 w-5" />
                    <span>People You Should Know</span>
                  </h2>
                  {currentEvent.matchmaking_enabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefreshMatches}
                      disabled={isRefreshing}
                      className="h-8 w-8 p-0 hidden"
                      title="Refresh matches"
                    >
                      <RefreshCw 
                        className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} 
                      />
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Matches Container */}
              <div className="space-y-2">
                {matches.length > 0 ? (
                  matches.map((match, index) => (
                    <MatchCard
                      key={`${match.id}-${match.profile.id}-${index}`}
                      name={`${match.profile.first_name} ${match.profile.last_name}`}
                      jobTitle={match.profile.job_title || ''}
                      company={match.profile.company || ''}
                      avatarUrl={match.profile.avatar_url || undefined}
                      matchBases={match.bases}
                      summary={match.summary}
                      isPresent={match.is_present}
                      onClick={() => handleMatchClick(match)}
                      structuredExplanation={match.structured_explanation}
                      connectionType={match.connection_type}
                    />
                  ))
                ) : currentEvent && !currentEvent.matchmaking_enabled ? (
                  <Card className="bg-card border-border shadow-elevation">
                    <CardContent className="text-center py-4">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Waiting for matchmaking to begin
                      </h3>
                      <p className="text-muted-foreground max-w-md mx-auto leading-relaxed text-sm">
                        The event organizer will start the AI matchmaking process soon. Check back later for personalized introductions!
                      </p>
                      <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-card border-border shadow-elevation">
                    <CardContent className="text-center py-4">
                      <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <h3 className="text-base font-medium text-foreground mb-2">
                        No matches yet
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        Matches will appear here once the event starts and matching is run.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Add Other Attendees Section - Only show when event exists */}
          {currentEvent && (
            <div className="space-y-3 pt-2">
              {/* Title Section */}
              <div className="px-1 space-y-2">
                <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                  <QrCode className="h-5 w-5" />
                  <span>Add other attendees</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Skip the small talk by scanning another attendees QR code to see what you have in common.
                </p>
              </div>
              
              {/* Content */}
              <Card className="bg-card border-border shadow-elevation" data-guide="qr-section">
                <CardContent className="p-4 space-y-4">
                  <QRCard onScanClick={handleQRScan} eventId={currentEvent.id} />

                  {manualConnections.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Added & Pending
                      </h3>
                      {manualConnections.map((item) => {
                        const statusLabel = getManualStatusLabel(item)

                        return (
                          <div
                            key={item.id}
                            className="flex items-center space-x-3 px-3 py-4 rounded-lg border border-border bg-card/60"
                          >
                            <PresenceAvatar
                              src={item.profile.avatar_url || undefined}
                              fallback={`${item.profile.first_name[0]}${item.profile.last_name[0]}`}
                              isPresent={false}
                              size="md"
                            />
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-foreground">
                                {item.profile.first_name} {item.profile.last_name}
                              </h3>
                              {item.profile.job_title && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {item.profile.job_title}
                                  {item.profile.company && ` at ${item.profile.company}`}
                                </p>
                              )}
                              {statusLabel && (
                              <p className="text-xs text-muted-foreground mt-1">{statusLabel}</p>
                              )}
                            </div>
                            {item.status === "pending-incoming" ? (
                              <div className="flex items-center space-x-2">
                                <Button
                                  size="sm"
                                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation()
                                    handleConfirmManualConnection(item)
                                  }}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation()
                                    handleDenyManualConnection(item)
                                  }}
                                >
                                  Deny
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setWithdrawTarget(item)
                                }}
                                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                              >
                                Pending
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Directory of attendees */}
          {currentEvent && (
            <div className="space-y-3 pt-2">
              {/* Title Section */}
              <div className="px-1">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                    <Users className="h-5 w-5" />
                    <span>Directory</span>
                  </h2>
                  {directory.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        data-guide="all-attendees-btn"
                        size="sm"
                        variant={directoryFilter === "all" ? "default" : "outline"}
                        onClick={() => setDirectoryFilter("all")}
                      >
                        All attendees
                      </Button>
                      <Button
                        data-guide="directory"
                        size="sm"
                        variant={directoryFilter === "connected" ? "default" : "outline"}
                        onClick={() => setDirectoryFilter("connected")}
                      >
                        Connected
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <Card className="bg-card border-border shadow-elevation">
                <CardContent className="p-4 space-y-3">
                  {directory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      As attendees complete their profiles, you'll see them here.
                    </p>
                  ) : (
                    <>
                      {filteredDirectory.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {directoryFilter === "connected"
                            ? "No confirmed connections yet. As people accept your requests, they'll show here."
                            : "No attendees match this filter yet."}
                        </p>
                      ) : (
                        filteredDirectory.map((entry) => {
                          const statusLabel = getDirectoryStatusLabel(entry)
                          // Don't show "Connected" label when filter is set to "connected" (redundant)
                          const shouldShowStatusLabel = statusLabel && !(directoryFilter === "connected" && entry.status === "connected")
                          
                          // Make container clickable for connected users
                          const isClickable = entry.status === "connected" && currentEvent
                          const handleContainerClick = () => {
                            if (isClickable) {
                              router.push(`/profile/${entry.profile.id}?source=connection&eventId=${currentEvent.id}`)
                            }
                          }

                          return (
                            <div
                              key={entry.profile.id}
                              onClick={handleContainerClick}
                              className={`flex items-center space-x-3 px-3 py-4 rounded-lg border border-border bg-card/60 ${
                                isClickable ? "cursor-pointer hover:bg-card/80 transition-colors" : ""
                              }`}
                            >
                              <PresenceAvatar
                                src={entry.profile.avatar_url || undefined}
                                fallback={`${entry.profile.first_name[0]}${entry.profile.last_name[0]}`}
                                isPresent={entry.isPresent || false}
                                size="md"
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-foreground">
                                  {entry.profile.first_name} {entry.profile.last_name}
                                </h3>
                                {entry.profile.job_title && (
                                  <p className="text-sm text-muted-foreground truncate">
                                    {entry.profile.job_title}
                                    {entry.profile.company && ` at ${entry.profile.company}`}
                                  </p>
                                )}
                                {shouldShowStatusLabel && (
                                  <p className="text-xs text-muted-foreground mt-1">{statusLabel}</p>
                                )}
                              </div>
                              {renderDirectoryAction(entry)}
                            </div>
                          )
                        })
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </main>

      {/* Joining Event Loading Modal */}
      <Dialog open={isJoiningEvent} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogClose
            className="absolute -top-3 -right-3 z-50 rounded-2xl bg-background p-2 opacity-90 transition-all hover:opacity-100 hover:scale-110 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden border border-border shadow-md"
          >
            <XIcon className="h-4 w-4 text-foreground" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div className="text-center space-y-2">
              <DialogTitle className="text-xl">Joining Event...</DialogTitle>
              <DialogDescription className="text-base pt-2">
                To help you connect with the most helpful people here, we'll ask you only a few questions.
              </DialogDescription>
              <p className="text-xs text-muted-foreground mt-4">
                This may take 30 seconds to load. Do not refresh.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Modal */}
      <Dialog
        open={Boolean(withdrawTarget)}
        onOpenChange={(open) => {
          if (!open && !isWithdrawing) {
            setWithdrawTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw connection request?</DialogTitle>
            <DialogDescription>
              This will remove your pending request with{" "}
              {withdrawTarget
                ? `${withdrawTarget.profile.first_name} ${withdrawTarget.profile.last_name}`
                : "this attendee"}
              . They'll no longer see your request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWithdrawTarget(null)}
              disabled={isWithdrawing}
            >
              Cancel
            </Button>
            <Button onClick={handleWithdrawManualConnection} disabled={isWithdrawing}>
              {isWithdrawing ? "Withdrawing..." : "Withdraw request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onConnectionCreated={handleConnectionCreated}
      />

      {/* First-time user guide */}
      {currentEvent && (
        <UserGuide
          steps={guideSteps}
          storageKey="intro-homepage-guide-completed"
        />
      )}
    </div>
  )
}
