"use client"

import { useState, useEffect, MouseEvent, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { EventJoinScanner } from "@/components/ui/event-join-scanner"
import { Button } from "@/components/ui/button"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { MatchCard } from "@/components/ui/match-card"
import { QRCard } from "@/components/ui/qr-card"
import { QRScanner } from "@/components/ui/qr-scanner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClientComponentClient } from "@/lib/supabase"
import { MessageService } from "@/lib/message-service-simple"
import { User, Profile, Event } from "@/lib/types"
import { toast } from "sonner"
import { 
  Users, 
  MessageSquare, 
  MapPin,
  Calendar,
  Plus,
  QrCode,
  UserPlus,
  ArrowRight
} from "lucide-react"

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
}

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
  
  const router = useRouter()
  const supabase = createClientComponentClient() as any
  const messageService = useMemo(() => new MessageService(), [])
  const unreadPollingRef = useRef<NodeJS.Timeout | null>(null)

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
        toast.error("Failed to load profile")
        return
      }

      const mappedProfile: Profile = {
        id: userRow.user_id,
        first_name: userRow.first_name || "",
        last_name: userRow.last_name || "",
        email: userRow.email || "",
        avatar_url: userRow.photo_url || null,
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

      // Load current event from attendance join events (most recent)
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from("attendance")
        .select("checked_in_at, event_id, events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)

      console.log("Attendance query result:", { attendanceRows, attendanceError, userId: user.id })

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
      toast.error("Failed to load user data")
    } finally {
      setIsLoading(false)
    }
  }

  const loadMatches = async (eventId: string) => {
    if (!user) return
    
    try {
      const { data: edges, error: edgesError } = await supabase
        .from("connections")
        .select("a_id, b_id, match_explanation_text, match_score_breakdown_json, created_at")
        .eq("event_id", eventId)
        .eq("connection_kind", "system_match")
        .or(`a_id.eq.${user.id},b_id.eq.${user.id}`)
        .order("created_at", { ascending: false }) // Get newest matches first

      if (edgesError) {
        console.error("Failed to load matches:", edgesError)
        toast.error(`Failed to load matches (${edgesError.code ?? "error"})`)
        return
      }

      if (!edges) {
        toast.error("Unable to load matches: empty response")
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
        toast.error(`Failed to load match details (${othersError.code ?? "error"})`)
        return
      }

      if (!others) {
        toast.error("Unable to load match details: empty response")
        return
      }

      const otherRows = (others ?? []) as any[]
      const userMap = new Map(otherRows.map((u: any) => [u.user_id, u]))

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
            avatar_url: u.photo_url || null,
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

          return {
            id: e.created_at || `${u.user_id}-${explanation}`,
            summary: structuredExplanation?.reason_summary || explanation,
            bases: matchData.bases || [],
            shared_activities: sharedActivitiesStr,
            dive_deeper: matchData.dive_deeper || "",
            profile,
            is_present: false,
            structured_explanation: structuredExplanation,
            connection_type: structuredExplanation?.connection_type,
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
      console.log(`[loadMatches] Match summaries:`, formatted.map(m => ({ name: `${m.profile.first_name} ${m.profile.last_name}`, summary: m.summary?.substring(0, 50) })))
      
      setMatches(formatted.slice(0, 3))
    } catch (error) {
      console.error("Failed to load matches:", error)
      toast.error("Unexpected error while loading matches")
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
          avatar_url: u.photo_url || null,
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

      const connectedIds = new Set(confirmed.map((c) => c.profile.id))
      const pendingOutgoingIds = new Set(manual.filter(m => m.status === 'pending-outgoing').map(m => m.profile.id))
      const pendingIncomingIds = new Set(manual.filter(m => m.status === 'pending-incoming').map(m => m.profile.id))

      const { data, error } = await supabase
        .from("attendance")
        .select(`
          user_id,
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
            avatar_url: attendee.photo_url || null,
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
          } else if (connectedIds.has(attendeeProfile.id)) {
            status = "connected"
          } else if (pendingIncomingIds.has(attendeeProfile.id)) {
            status = "pending-incoming"
          } else if (pendingOutgoingIds.has(attendeeProfile.id)) {
            status = "pending-outgoing"
          }

          return {
            profile: attendeeProfile,
            status,
            connectionReason: status === "connected" ? (connectionReasonMap.get(attendeeProfile.id) ?? null) : null,
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
        toast.error("Failed to update presence")
        return
      }

      setIsPresent(newPresence)
      toast.success(newPresence ? "You're now marked as present!" : "You're no longer marked as present")
    } catch {
      toast.error("An error occurred")
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
        toast.error("Failed to confirm connection")
        return
      }

      toast.success("Connection confirmed")
      await refreshConnections()
      router.push(`/profile/${item.profile.id}?source=request&eventId=${currentEvent.id}`)
    } catch (error) {
      console.error("Error confirming manual connection:", error)
      toast.error("Failed to confirm connection")
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
        toast.error("Failed to update request")
        return
      }

      toast.success("Request removed")
      await refreshConnections()
    } catch (error) {
      console.error("Error denying manual connection:", error)
      toast.error("Failed to update request")
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
          toast.info("You already have a connection or request with this person")
        } else {
          console.error("Failed to add connection from directory:", error)
          toast.error("Failed to send connection request")
        }
      } else {
        toast.success("Connection request sent")
      }

      await refreshConnections()
    } catch (error) {
      console.error("Error adding connection from directory:", error)
      toast.error("Failed to send connection request")
    }
  }

  const getManualStatusLabel = (item: ManualConnectionItem) => {
    if (item.status === "pending-incoming") {
      return "Pending your response"
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
    if (entry.status === "connected") {
      return "Connected"
    }

    if (entry.status === "pending-incoming") {
      return "Pending your response"
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
        toast.error("Failed to withdraw request")
        return
      }

      toast.success("Connection request withdrawn")
      setWithdrawTarget(null)
      await refreshConnections()
    } catch (error) {
      console.error("Error withdrawing manual connection:", error)
      toast.error("Failed to withdraw request")
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
        <Button
          size="icon"
          variant="ghost"
          onClick={() => router.push(`/profile/${entry.profile.id}?source=connection&eventId=${currentEvent.id}`)}
          aria-label={`View ${entry.profile.first_name} ${entry.profile.last_name}`}
        >
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Button>
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
        toast.error("Please sign in first")
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
        toast.error("Failed to check event. Please try again.")
        return
      }

      if (!event) {
        setIsJoiningEvent(false)
        toast.error("Event not found or inactive")
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
        toast.error("Failed to check membership. Please try again.")
        return
      }

      if (existingMember) {
        setIsJoiningEvent(false)
        toast.error("You're already a member of this event")
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
        toast.error("Failed to join event")
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

      toast.success("Successfully joined event!")
      // After joining from Home, ask networking goals; but if user completes onboarding first, they can come back from Home too
      router.push(`/onboarding?from=event-join&eventId=${event.event_id}`)
    } catch (error) {
      console.error("Error joining event:", error)
      toast.error("An error occurred")
    } finally {
      setIsJoiningEvent(false)
    }
  }

  const handleRefreshData = () => {
    if (user) {
      loadUserData()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            {/* Left: User avatar with presence indicator + Intro wordmark */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/settings")}
                className="focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-full"
              >
                <PresenceAvatar
                  src={profile.avatar_url || undefined}
                  fallback={`${profile.first_name[0]}${profile.last_name[0]}`}
                  isPresent={isPresent}
                  size="md"
                />
              </button>
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
              type="button"
              onClick={() => router.push(`/messages?eventId=${currentEvent?.id || ''}`)}
              className="relative w-10 h-10 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/20 gradient-primary"
              style={{
                border: 'none'
              }}
              aria-label="Open messages"
            >
              <MessageSquare className="h-5 w-5 text-primary-foreground pointer-events-none" />
              {unreadMessageCount > 0 && (
                <span className="pointer-events-none absolute -top-1 -right-1 bg-accent text-accent-foreground text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">

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
                  className="h-1 w-full rounded-full gradient-primary"
                />
                
                {/* Event Details - Compact Format */}
                <div className="text-sm text-muted-foreground space-y-1">
                  {currentEvent.starts_at && (
                    <p>
                      {(() => {
                        const startDate = currentEvent.starts_at ? new Date(currentEvent.starts_at) : null
                        if (!startDate || Number.isNaN(startDate.getTime())) {
                          return "Schedule coming soon"
                        }

                        const rawEndDate = currentEvent.ends_at ? new Date(currentEvent.ends_at) : null
                        const endDate = rawEndDate && !Number.isNaN(rawEndDate.getTime()) ? rawEndDate : null
                        
                        const startDateStr = startDate.toLocaleDateString('en-US', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })
                        const startTimeStr = startDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                          timeZoneName: 'short'
                        })
                        
                        if (endDate) {
                          const endDateStr = endDate.toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })
                          const endTimeStr = endDate.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZoneName: 'short'
                          })
                          
                          // If same day, show: "Nov 2, 2025 @ 9:30 AM - 6:00 PM"
                          // If different day, show: "Nov 2, 2025 @ 9:30 AM - Nov 12, 2025 @ 6:00 PM"
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
                    className="px-8 py-3 rounded-lg text-primary-foreground font-medium text-lg mx-auto block gradient-success"
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
            <div className="space-y-3">
              {/* Title Section */}
              <div className="px-1">
                <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                  <Users className="h-5 w-5" />
                  <span>People You Should Know</span>
                </h2>
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
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center space-x-2">
                    <QrCode className="h-5 w-5" />
                    <span>Add other attendees</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
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
                            className="flex items-center space-x-3 p-3 rounded-lg border border-border bg-card/60"
                          >
                            <PresenceAvatar
                              src={item.profile.avatar_url || undefined}
                              fallback={`${item.profile.first_name[0]}${item.profile.last_name[0]}`}
                              isPresent={false}
                              size="md"
                            />
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-foreground">
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
            )}

            {/* Directory of attendees */}
            {currentEvent && (
              <Card className="bg-card border-border shadow-elevation">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="h-5 w-5" />
                      <span>Directory</span>
                    </CardTitle>
                    {directory.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={directoryFilter === "all" ? "default" : "outline"}
                          onClick={() => setDirectoryFilter("all")}
                        >
                          All attendees
                        </Button>
                        <Button
                          size="sm"
                          variant={directoryFilter === "connected" ? "default" : "outline"}
                          onClick={() => setDirectoryFilter("connected")}
                        >
                          Connected
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
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

                          return (
                            <div
                              key={entry.profile.id}
                              className="flex items-center space-x-3 p-3 rounded-lg border border-border bg-card/60"
                            >
                              <PresenceAvatar
                                src={entry.profile.avatar_url || undefined}
                                fallback={`${entry.profile.first_name[0]}${entry.profile.last_name[0]}`}
                                isPresent={false}
                                size="md"
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-foreground">
                                  {entry.profile.first_name} {entry.profile.last_name}
                                </h3>
                                {entry.profile.job_title && (
                                  <p className="text-sm text-muted-foreground truncate">
                                    {entry.profile.job_title}
                                    {entry.profile.company && ` at ${entry.profile.company}`}
                                  </p>
                                )}
                                {statusLabel && (
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
            )}

        </div>
      </main>

      {/* Joining Event Loading Modal */}
      <Dialog open={isJoiningEvent} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div className="text-center space-y-2">
              <DialogTitle className="text-xl">Joining Event...</DialogTitle>
              <DialogDescription className="text-base pt-2">
                To help you connect with the most helpful people here, we'll ask you only a few questions.
              </DialogDescription>
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
    </div>
  )
}
