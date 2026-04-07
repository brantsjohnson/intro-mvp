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
import { SMSNotificationWidget } from "@/components/home/sms-notification-widget"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserGuide, type GuideStep } from "@/components/ui/user-guide"
import { createClientComponentClient } from "@/lib/supabase"
import { MessageService } from "@/lib/message-service-simple"
import { User, Profile, Event } from "@/lib/types"
import { getAvatarUrl, cn } from "@/lib/utils"
import { decryptEventCode } from "@/lib/event-code-encryption"
import {
  mergeInviteFromUrl,
  peekEncryptedInvitePayload,
  peekLegacyPlainEventCode,
  clearPendingEventInvite,
} from "@/lib/pending-event-invite"
import { haptics } from "@/lib/haptics"
import { toast } from "sonner"
import {
  Users,
  MessageSquare,
  QrCode,
  XIcon,
  ArrowRight,
  RefreshCw,
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
    title: "Top 3 Suggestions",
    subtext: "The top three matches will appear here. They are matched based on the information you provided.",
    position: "auto",
    highlightShape: "rounded",
  },
  {
    id: "qr-section",
    targetSelector: '[data-guide="qr-section"]',
    title: "Skip the small talk",
    subtext: "Scan someone's QR code to see their profile and what you have in common. This does not add them on LinkedIn.",
    position: "auto",
    highlightShape: "rounded",
  },
  {
    id: "directory",
    targetSelector: '[data-guide="directory"]',
    title: "Who you've met",
    subtext: "Find all those you connected with during the event to help you follow up afterward.",
    position: "auto",
    highlightShape: "pill",
  },
  {
    id: "all-attendees-btn",
    targetSelector: '[data-guide="all-attendees-btn"]',
    title: "Who is here",
    subtext: "You can see all additional attendees beyond those you've connected with.",
    position: "auto",
    highlightShape: "pill",
  },
  {
    id: "profile-avatar",
    targetSelector: '[data-guide="profile-avatar"]',
    title: "Your settings",
    subtext: "Add or switch to another event or edit your information here.",
    position: "auto",
    highlightShape: "circle",
  },
  {
    id: "messages-icon",
    targetSelector: '[data-guide="messages-icon"]',
    title: "Message Attendees",
    subtext: "Message attendees to coordinate meeting. You'll be notified via email when you have a new message.",
    position: "auto",
    highlightShape: "circle",
  },
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
  const [availableEvents, setAvailableEvents] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [canSwitchEvents, setCanSwitchEvents] = useState(false)
  const [showRefreshButton, setShowRefreshButton] = useState(false)
  const [hasProcessedAutoJoin, setHasProcessedAutoJoin] = useState(false)

  const lastConnectionCheckRef = useRef<string | null>(null)
  const isLoadingUserDataRef = useRef(false)
  const lastLoadedUserIdRef = useRef<string | null>(null)
  const unreadPollingRef = useRef<NodeJS.Timeout | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient() as any
  const messageService = useMemo(() => new MessageService(), [])

  // 6-digit code input state for home page (no QR scanner)
  const [eventCodeInput, setEventCodeInput] = useState<string[]>(["", "", "", "", "", ""])
  const eventCodeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const filteredDirectory = useMemo(() => {
    if (directoryFilter === "connected") {
      return directory.filter((entry) => entry.status === "connected")
    }

    return directory.filter((entry) => entry.status !== "self")
  }, [directory, directoryFilter])

  // Get user + listen for auth changes
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
      }
    }

    // Initial check
    getUser()

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      console.log("Auth state changed:", event, session?.user?.id)
      if (session?.user) {
        setUser(session.user)
      } else if (event === "SIGNED_OUT") {
        router.push("/auth")
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase.auth])

  // Handle auto-join via encrypted code on /home?code=... or session-backed invite (OAuth-safe)
  useEffect(() => {
    const handleAutoJoin = async () => {
      if (!user || hasProcessedAutoJoin || isLoading) return

      mergeInviteFromUrl(searchParams.get("code"), searchParams.get("eventCode"))

      let encryptedCode =
        searchParams.get("code") || peekEncryptedInvitePayload()
      if (!encryptedCode) {
        const legacy = peekLegacyPlainEventCode()
        if (legacy) {
          setHasProcessedAutoJoin(true)
          router.replace(`/event/join?code=${encodeURIComponent(legacy)}`)
        }
        return
      }

      setHasProcessedAutoJoin(true)

      try {
        const eventCode = decryptEventCode(encryptedCode)

        if (!eventCode) {
          console.error("Invalid encrypted event code")
          router.replace("/home")
          return
        }

        const { data: event } = await supabase
          .from("events")
          .select("event_id")
          .eq("event_code", eventCode.toUpperCase())
          .maybeSingle()

        if (!event) {
          router.replace("/home")
          return
        }

        const { data: existingMember } = await supabase
          .from("attendance")
          .select("event_id")
          .eq("event_id", event.event_id)
          .eq("user_id", user.id)
          .maybeSingle()

        if (existingMember) {
          clearPendingEventInvite()
          router.replace(`/onboarding?eventId=${event.event_id}&from=auto-join`)
          return
        }

        setIsJoiningEvent(true)
        try {
          const { error: joinError } = await supabase.from("attendance").insert({
            event_id: event.event_id,
            user_id: user.id,
            checked_in_at: new Date().toISOString(),
          })

          if (joinError) {
            console.error("Error auto-joining event:", joinError)
            router.replace("/home")
            return
          }

          clearPendingEventInvite()

          try {
            await fetch("/api/refresh-matches", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                eventId: event.event_id,
                newUserId: user.id,
              }),
            })
          } catch (error) {
            console.error("Failed to refresh matches for new user:", error)
          }

          router.replace(`/onboarding?from=event-join&eventId=${event.event_id}`)
        } finally {
          setIsJoiningEvent(false)
        }
      } catch (error) {
        console.error("Error in auto-join:", error)
        router.replace("/home")
      }
    }

    handleAutoJoin()
  }, [user, searchParams, hasProcessedAutoJoin, isLoading, router, supabase])

  // Listen for new QR connections and auto-open other attendee profile
  useEffect(() => {
    if (!user || !currentEvent) return

    const connectionChannel = supabase
      .channel(`qr-connections-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connections",
          filter: `event_id=eq.${currentEvent.id}`,
        },
        async (payload: any) => {
          const newConnection = payload.new
          const [aId, bId] = newConnection.a_id < newConnection.b_id
            ? [newConnection.a_id, newConnection.b_id]
            : [newConnection.b_id, newConnection.a_id]

          const isInvolved = aId === user.id || bId === user.id
          const isQRConnection = newConnection.user_add_method === "qr"

          if (isInvolved && isQRConnection && newConnection.connection_kind === "user_added") {
            const otherUserId = aId === user.id ? bId : aId

            const connectionKey = `${newConnection.connection_id}-${otherUserId}`
            if (lastConnectionCheckRef.current === connectionKey) {
              return
            }
            lastConnectionCheckRef.current = connectionKey

            // Navigate to the other user's profile from any page when QR connection is created
            // This ensures both users see each other's profiles when one scans the other's QR code
            const currentPath = window.location.pathname
            // Only navigate if we're not already viewing this user's profile
            if (!currentPath.includes(`/profile/${otherUserId}`)) {
              console.log(`[QR Connection] Navigating to profile of ${otherUserId} from ${currentPath}`)
              setTimeout(() => {
                router.push(`/profile/${otherUserId}?source=qr&eventId=${currentEvent.id}`)
              }, 500)
            }
          }
        },
      )
      .subscribe()

    return () => {
      connectionChannel.unsubscribe()
    }
  }, [user, currentEvent, router, supabase])

  const loadMatches = async (eventId: string) => {
    if (!user) return

    try {
      const { data: edges, error: edgesError } = await supabase
        .from("connections")
        .select(
          "a_id, b_id, match_explanation_text, match_score_breakdown_json, created_at, match_algorithm_version",
        )
        .eq("event_id", eventId)
        .eq("connection_kind", "system_match")
        .or(`a_id.eq.${user.id},b_id.eq.${user.id}`)
        .order("created_at", { ascending: false })

      if (edgesError) {
        console.error("Failed to load matches:", edgesError)
        return
      }

      if (!edges) {
        return
      }

      const edgesList = (edges ?? []) as any[]

      console.log(`[loadMatches] Loaded ${edgesList.length} match records from database`)

      const matchMap = new Map<string, any>()
      for (const edge of edgesList) {
        const pairKey =
          edge.a_id < edge.b_id ? `${edge.a_id}-${edge.b_id}` : `${edge.b_id}-${edge.a_id}`
        const existing = matchMap.get(pairKey)

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

      const otherUserIds = deduplicatedEdges
        .map((e) => (e.a_id === user.id ? e.b_id : e.a_id))
        .filter(Boolean) as string[]
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
      const attendanceMap = new Map(
        (attendanceData || []).map((a: any) => [a.user_id, a.checked_in_at]),
      )

      const formatted: MatchWithProfile[] = deduplicatedEdges
        .map((e) => {
          const otherId = e.a_id === user.id ? e.b_id : e.a_id
          const u = otherId ? userMap.get(otherId) : null
          if (!u) return null

          let matchData: {
            summary?: string
            why_meet?: string
            shared_activities?: string[] | string
            dive_deeper?: string
            bases?: string[]
          } = {}

          if (e.match_score_breakdown_json && typeof e.match_score_breakdown_json === "object") {
            matchData = e.match_score_breakdown_json as typeof matchData
          }

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
          const structuredExplanation = (matchData as any)
            .structured_explanation as StructuredMatchExplanation | undefined
          const algorithmVersion = e.match_algorithm_version || null

          const summary = explanation

          return {
            id: e.created_at || `${u.user_id}-${explanation}`,
            summary,
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

      formatted.sort((a, b) => {
        const aTime = new Date(a.id).getTime()
        const bTime = new Date(b.id).getTime()
        return bTime - aTime
      })

      console.log(`[loadMatches] Final matches: ${formatted.length}, showing top 3`)
      console.log(
        `[loadMatches] Match summaries:`,
        formatted.map((m) => ({
          name: `${m.profile.first_name} ${m.profile.last_name}`,
          summary: m.summary?.substring(0, 50),
          algorithm: m.algorithm_version || "unknown",
          isAI:
            m.algorithm_version === "v4_ai_decision_tree"
              ? "AI"
              : m.algorithm_version === "v3_persona_intelligence"
                ? "Rule-based"
                : "Unknown",
        })),
      )

      setMatches(formatted.slice(0, 3))
    } catch (error) {
      console.error("Failed to load matches:", error)
    }
  }

  const loadConnections = async (
    eventId: string,
  ): Promise<{ confirmed: ConnectionWithProfile[]; manual: ManualConnectionItem[] }> => {
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

      const otherUserIds = edgesList
        .map((e: any) => (e.a_id === user.id ? e.b_id : e.a_id))
        .filter(Boolean) as string[]
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
        const isPending = e.connection_kind === "user_request_pending"
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

        if (
          e.user_add_method === "qr" ||
          e.user_add_method === "manual_add" ||
          e.user_add_method === "manual_directory"
        ) {
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

        const reason =
          e.user_add_method === "qr"
            ? "QR Code Connection"
            : e.user_add_method === "manual_directory"
              ? "Manual Connection"
              : e.connection_kind === "system_match"
                ? "AI Match"
                : "Manual Add"

        confirmedConnections.push({
          id: `${e.a_id}-${e.b_id}-${e.created_at}`,
          source: e.user_add_method || (e.connection_kind === "system_match" ? "match" : "manual"),
          created_at: e.created_at || new Date().toISOString(),
          profile,
          connection_reason: reason,
        })
      })

      confirmedConnections.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      manualList.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

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
    connectionData?: { confirmed: ConnectionWithProfile[]; manual: ManualConnectionItem[] },
  ) => {
    if (!user) {
      setDirectory([])
      return
    }

    try {
      const confirmed = connectionData?.confirmed ?? connections
      const manual = connectionData?.manual ?? manualConnections
      const connectionReasonMap = new Map(
        confirmed.map((connection) => [connection.profile.id, connection.connection_reason ?? null]),
      )

      const actuallyConnectedIds = new Set(
        confirmed
          .filter(
            (c) =>
              c.source === "met" ||
              c.source === "manual_add" ||
              c.source === "qr" ||
              c.source === "manual_directory",
          )
          .map((c) => c.profile.id),
      )

      const pendingOutgoingIds = new Set(
        manual.filter((m) => m.status === "pending-outgoing").map((m) => m.profile.id),
      )
      const pendingIncomingIds = new Set(
        manual.filter((m) => m.status === "pending-incoming").map((m) => m.profile.id),
      )

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
            connectionReason:
              status === "connected" ? connectionReasonMap.get(attendeeProfile.id) ?? null : null,
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

  const loadUserData = useCallback(
    async (source: string = "unknown") => {
      if (!user) {
        console.log(`[loadUserData] Skipped: no user (source: ${source})`)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        console.log(
          `[loadUserData] Skipped: no session yet (source: ${source}, userId: ${user.id})`,
        )
        return
      }

      if (isLoadingUserDataRef.current) {
        console.log(
          `[loadUserData] Skipped: already loading (source: ${source}, userId: ${user.id})`,
        )
        return
      }

      if (lastLoadedUserIdRef.current === user.id && source !== "focus" && source !== "refresh") {
        console.log(
          `[loadUserData] Skipped: already loaded for user (source: ${source}, userId: ${user.id})`,
        )
        return
      }

      console.log(`[loadUserData] Starting (source: ${source}, userId: ${user.id})`)
      isLoadingUserDataRef.current = true

      try {
        const { data: userRow, error: userError } = await supabase
          .from("users")
          .select(
            "user_id, first_name, last_name, email, photo_url, career_title, company_name",
          )
          .eq("user_id", user.id)
          .single()

        if (userError) {
          console.error("[loadUserData] Failed to load profile:", userError)
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

        const preferredEventId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(`preferredEvent:${user.id}`)
            : null

        let query = supabase
          .from("attendance")
          .select(
            "checked_in_at, event_id, onboarding_completed, why_attending_text, connection_types_selected, connection_followups_json, business_need_text, events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location, matching_config)",
          )
          .eq("user_id", user.id)

        if (preferredEventId) {
          query = query.eq("event_id", preferredEventId)
        }

        query = query.order("created_at", { ascending: false })
        let { data: attendanceRows, error: attendanceError } = await query.limit(1)

        if (preferredEventId && (!attendanceRows || attendanceRows.length === 0)) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(`preferredEvent:${user.id}`)
          }

          const { data: fallbackRows, error: fallbackError } = await supabase
            .from("attendance")
            .select(
              "checked_in_at, event_id, onboarding_completed, why_attending_text, connection_types_selected, connection_followups_json, business_need_text, events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location, matching_config)",
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)

          if (!fallbackError && fallbackRows) {
            attendanceRows = fallbackRows
            attendanceError = fallbackError
          }
        }

        console.log(`[loadUserData] Attendance query result (source: ${source}):`, {
          attendanceRows: attendanceRows?.length || 0,
          attendanceError,
          userId: user.id,
        })

        if (attendanceError) {
          console.error("[loadUserData] Error loading attendance:", attendanceError)
          setCurrentEvent(null)
          setIsPresent(false)
          setMatches([])
        } else if (attendanceRows && attendanceRows.length > 0) {
          const row: any = attendanceRows[0]
          
          // Check if event onboarding is incomplete - redirect to onboarding
          if (row?.events && row.onboarding_completed === false) {
            console.log(
              `[loadUserData] Event onboarding incomplete, redirecting to onboarding (eventId: ${row.events.event_id})`,
            )
            router.replace(`/onboarding?eventId=${row.events.event_id}&from=event-join`)
            return
          }
          
          if (row?.events) {
            const matchingConfig = row.events.matching_config as {
              show_refresh_button?: boolean
              logo_url?: string
            } | null
            
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
              logo_url: matchingConfig?.logo_url || null,
            }
            setCurrentEvent(mappedEvent)
            setIsPresent(!!row.checked_in_at)
            setShowRefreshButton(matchingConfig?.show_refresh_button ?? false)

            console.log(
              `[loadUserData] Loading matches for event ${mappedEvent.id} (source: ${source})`,
            )
            await loadMatches(mappedEvent.id)
            const connectionData = await loadConnections(mappedEvent.id)
            await loadDirectory(mappedEvent.id, connectionData)
          } else {
            setCurrentEvent(null)
            setIsPresent(false)
            setMatches([])
            setConnections([])
            setManualConnections([])
            setDirectory([])
          }
        } else {
          console.log(
            `[loadUserData] No event membership found for user: ${user.id} (source: ${source})`,
          )
          setCurrentEvent(null)
          setIsPresent(false)
          setMatches([])
          setConnections([])
          setManualConnections([])
          setDirectory([])
        }

        lastLoadedUserIdRef.current = user.id
        console.log(`[loadUserData] Completed (source: ${source}, userId: ${user.id})`)
      } catch (error) {
        console.error(`[loadUserData] Error (source: ${source}):`, error)
        toast.error("Failed to load user data")
      } finally {
        setIsLoading(false)
        isLoadingUserDataRef.current = false
      }
    },
    [user, supabase],
  )

  useEffect(() => {
    if (user) {
      loadUserData("user-changed")
    }
  }, [user, loadUserData])

  // Load all events user is part of (for event switching)
  const loadUserEvents = useCallback(async () => {
    if (!user) return

    try {
      const { data: userData } = await supabase
        .from("users")
        .select("email")
        .eq("user_id", user.id)
        .single()

      const email = userData?.email || user.email

      const ALLOWED_EMAILS = ["alexisbinch5@gmail.com", "brantshanonjohnson@gmail.com"]
      const canSwitch = email && ALLOWED_EMAILS.includes(email.toLowerCase())
      setCanSwitchEvents(canSwitch || false)

      const { data: attendanceRows, error } = await supabase
        .from("attendance")
        .select(
          `
          event_id,
          events:event_id(
            event_id,
            event_name,
            event_code
          )
        `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error loading user events:", error)
        return
      }

      const events =
        attendanceRows
          ?.map((row: any) => ({
            id: row.events?.event_id,
            name: row.events?.event_name || "Unnamed event",
            code: row.events?.event_code || "",
          }))
          .filter((e: any) => e.id) || []

      setAvailableEvents(events)
    } catch (error) {
      console.error("Error loading user events:", error)
    }
  }, [user, supabase])

  useEffect(() => {
    if (user) {
      loadUserEvents()
    }
  }, [user, loadUserEvents])

  const handleEventSwitch = async (eventId: string) => {
    if (!user || !eventId) return

    if (typeof window !== "undefined") {
      window.localStorage.setItem(`preferredEvent:${user.id}`, eventId)
    }

    const selectedEvent = availableEvents.find((e) => e.id === eventId)
    if (!selectedEvent) {
      toast.error("Event not found")
      return
    }

    const { data: eventData, error: eventError } = await supabase
      .from("attendance")
      .select(`
        checked_in_at,
        event_id,
        onboarding_completed,
        events:event_id(event_id, event_name, event_code, event_starts_at, event_ends_at, event_location, matching_config)
      `)
      .eq("user_id", user.id)
      .eq("event_id", eventId)
      .single()

    if (eventError || !eventData?.events) {
      toast.error("Failed to load event")
      return
    }

    // Check if event onboarding is incomplete - redirect to onboarding
    if (eventData.onboarding_completed === false) {
      console.log(
        `[handleEventSwitch] Event onboarding incomplete, redirecting to onboarding (eventId: ${eventId})`,
      )
      router.replace(`/onboarding?eventId=${eventId}&from=event-join`)
      return
    }

    const row: any = eventData
    const matchingConfig = row.events.matching_config as {
      show_refresh_button?: boolean
      logo_url?: string
    } | null
    
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
      logo_url: matchingConfig?.logo_url || null,
    }

    setCurrentEvent(mappedEvent)
    setIsPresent(!!row.checked_in_at)
    setShowRefreshButton(matchingConfig?.show_refresh_button ?? false)

    await loadMatches(mappedEvent.id)
    const connectionData = await loadConnections(mappedEvent.id)
    await loadDirectory(mappedEvent.id, connectionData)

    toast.success(`Switched to ${mappedEvent.name}`)
  }

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

        const lastSeen = window.localStorage.getItem(
          `conversation:lastSeen:${thread.id}`,
        )
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

  // Unread + subscription
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

  // Refresh when tab regains focus
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        loadUserData("focus")
      }
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [user, loadUserData])

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
        console.error("Error updating presence:", error)
        return
      }

      setIsPresent(newPresence)
    } catch (error) {
      console.error("Error updating presence:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleMatchClick = (match: MatchWithProfile) => {
    if (currentEvent) {
      router.push(
        `/profile/${match.profile.id}?source=suggested&eventId=${currentEvent.id}`,
      )
    } else {
      router.push(`/profile/${match.profile.id}`)
    }
  }

  const handleQRScan = () => {
    haptics.scan()
    setIsQRScannerOpen(true)
  }

  const handleConnectionCreated = async () => {
    if (currentEvent) {
      await loadMatches(currentEvent.id)
      await refreshConnections()
    }
  }

  const handleConfirmManualConnection = async (item: ManualConnectionItem) => {
    if (!currentEvent) return
    try {
      const [aId, bId] =
        item.aId < item.bId ? [item.aId, item.bId] : [item.bId, item.aId]
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
      router.push(
        `/profile/${item.profile.id}?source=request&eventId=${currentEvent.id}`,
      )
    } catch (error) {
      console.error("Error confirming manual connection:", error)
    }
  }

  const handleDenyManualConnection = async (item: ManualConnectionItem) => {
    try {
      const [aId, bId] =
        item.aId < item.bId ? [item.aId, item.bId] : [item.bId, item.aId]
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

    const [aId, bId] =
      user.id < otherUserId ? [user.id, otherUserId] : [otherUserId, user.id]

    try {
      const { error } = await supabase.from("connections").insert({
        event_id: currentEvent.id,
        a_id: aId,
        b_id: bId,
        connection_kind: "user_request_pending",
        user_add_method: "manual_directory",
        created_by_user_id: user.id,
      })

      if (error) {
        const duplicate = error.message?.toLowerCase().includes("duplicate")
        if (!duplicate) {
          console.error("Failed to add connection from directory:", error)
        }
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
      const [aId, bId] =
        withdrawTarget.aId < withdrawTarget.bId
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
      return (
        <span className="text-xs font-medium text-muted-foreground">
          Review in Added &amp; Pending
        </span>
      )
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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setIsJoiningEvent(false)
        return
      }

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

      const { error: joinError } = await supabase.from("attendance").insert({
        event_id: event.event_id,
        user_id: user.id,
        checked_in_at: new Date().toISOString(),
      })

      if (joinError) {
        console.error("Error joining event:", joinError)
        setIsJoiningEvent(false)
        return
      }

      haptics.success()

      try {
        await fetch("/api/refresh-matches", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventId: event.event_id,
            newUserId: user.id,
          }),
        })
      } catch (error) {
        console.error("Failed to refresh matches for new user:", error)
      }

      router.push(`/onboarding?from=event-join&eventId=${event.event_id}`)
    } catch (error) {
      console.error("Error joining event:", error)
    } finally {
      setIsJoiningEvent(false)
    }
  }

  const handleRefreshMatches = async () => {
    if (!user || !currentEvent || !currentEvent.matchmaking_enabled) {
      return
    }

    setIsRefreshing(true)

    try {
      const deriveResponse = await fetch("/api/derive-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: currentEvent.id,
          userId: user.id,
        }),
      })

      if (!deriveResponse.ok) {
        console.warn("derive-attendance failed, continuing with match refresh anyway")
      }

      const response = await fetch("/api/match-incremental", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: currentEvent.id,
          userId: user.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: "Failed to refresh matches",
        }))
        throw new Error(errorData.error || "Failed to refresh matches")
      }

      await response.json()

      await new Promise((resolve) => setTimeout(resolve, 2000))
      await loadMatches(currentEvent.id)
    } catch (error: any) {
      console.error("Error refreshing matches:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
          <p className="text-xs text-muted-foreground mt-2">
            Do not refresh this page. Could take 30 seconds.
          </p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Please complete your profile setup
          </p>
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
            {/* Left: User avatar */}
            <button
              data-guide="profile-avatar"
              onClick={() => router.push("/settings")}
              className="focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-2xl transition-all hover:shadow-[0px_3px_4px_rgba(0,0,0,0.2)]"
            >
              <PresenceAvatar
                src={profile.avatar_url || undefined}
                fallback={`${profile.first_name[0] || ""}${profile.last_name[0] || ""}`}
                isPresent={isPresent}
                size="md"
              />
            </button>

            {/* Center: logo or event switcher */}
            <div className="flex-1 text-center">
              {canSwitchEvents && availableEvents.length > 1 ? (
                <Select
                  value={currentEvent?.id || undefined}
                  onValueChange={handleEventSwitch}
                >
                  <SelectTrigger className="w-full max-w-xs mx-auto border-primary/40 bg-background/80">
                    <SelectValue placeholder="Select event">
                      {currentEvent?.name || "Select event"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-col items-center">
                <h1
                  className="text-2xl font-bold text-accent"
                  style={{
                    fontFamily: "Changa One, cursive",
                  }}
                >
                  INTRO
                </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Beta Test</p>
                </div>
              )}
            </div>

            {/* Right: messages */}
            <button
              data-guide="messages-icon"
              type="button"
              onClick={() =>
                router.push(`/messages?eventId=${currentEvent?.id || ""}`)
              }
              className="relative w-12 h-12 rounded-2xl flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/20 bg-primary transition-all hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]"
              style={{
                border: "none",
              }}
              aria-label="Open messages"
            >
              <MessageSquare className="h-6 w-6 text-white pointer-events-none" />
              {unreadMessageCount > 0 && (
                <span className="pointer-events-none absolute -top-1 -right-1 bg-accent text-white text-xs rounded-xl px-2 py-1 min-w-[20px] text-center">
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* JOIN EVENT when no event yet */}
          {!currentEvent && (
            <div className="max-w-md mx-auto">
              <div className="space-y-6">
                {/* Title and Subtitle */}
                <div className="text-center space-y-2">
                  <p className="text-sm text-foreground">Enter 6 digit code to join.</p>
                </div>

                {/* 6-Digit Code Input - No QR Scanner */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fullCode = eventCodeInput.join('')
                    if (fullCode.length === 6) {
                      handleJoinEvent(fullCode)
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="flex justify-center items-center gap-2">
                    {eventCodeInput.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          eventCodeInputRefs.current[index] = el
                        }}
                        type="text"
                        inputMode="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          const sanitized = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                          if (sanitized.length > 1) {
                            // Handle paste
                            const chars = sanitized.split('').slice(0, 6)
                            const newCode = [...eventCodeInput]
                            chars.forEach((char, i) => {
                              if (index + i < 6) {
                                newCode[index + i] = char
                              }
                            })
                            setEventCodeInput(newCode)
                            const nextIndex = Math.min(index + chars.length, 5)
                            eventCodeInputRefs.current[nextIndex]?.focus()
                          } else {
                            const newCode = [...eventCodeInput]
                            newCode[index] = sanitized
                            setEventCodeInput(newCode)
                            if (sanitized && index < 5) {
                              eventCodeInputRefs.current[index + 1]?.focus()
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !eventCodeInput[index] && index > 0) {
                            eventCodeInputRefs.current[index - 1]?.focus()
                          } else if (e.key === 'ArrowLeft' && index > 0) {
                            eventCodeInputRefs.current[index - 1]?.focus()
                          } else if (e.key === 'ArrowRight' && index < 5) {
                            eventCodeInputRefs.current[index + 1]?.focus()
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault()
                          const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
                          const newCode = [...eventCodeInput]
                          pasted.split('').forEach((char, i) => {
                            if (i < 6) {
                              newCode[i] = char
                            }
                          })
                          setEventCodeInput(newCode)
                          const lastFilledIndex = Math.min(pasted.length - 1, 5)
                          eventCodeInputRefs.current[lastFilledIndex]?.focus()
                        }}
                        className={cn(
                          "w-12 h-14 text-center text-xl font-semibold rounded-lg border-2 bg-muted/40 text-foreground",
                          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
                          "transition-all",
                          digit ? "border-primary" : "border-border"
                        )}
                        disabled={isJoiningEvent}
                      />
                    ))}
                  </div>
                  
                  <div className="flex justify-center">
                    <GradientButton 
                      type="submit"
                      disabled={eventCodeInput.join('').length !== 6 || isJoiningEvent}
                      className="max-w-xs rounded-full py-3 text-base font-medium"
                    >
                      {isJoiningEvent ? (
                        "Joining..."
                      ) : (
                        <>
                          Add Event Code
                          <ArrowRight className="h-5 w-5 ml-2" />
                        </>
                      )}
                    </GradientButton>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Event card */}
          {currentEvent && (
            <Card className="bg-card border-border shadow-elevation">
              <CardContent className="p-4 text-center space-y-4">
                {/* Logo or Title */}
                {currentEvent.logo_url ? (
                  <div className="flex items-center justify-center py-2 px-4">
                    <img
                      src={currentEvent.logo_url}
                      alt={`${currentEvent.name} logo`}
                      className="max-w-full max-h-20 object-contain"
                      onError={(e) => {
                        console.error("Error loading event logo:", currentEvent.logo_url)
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                ) : (
                <h2 className="text-2xl font-semibold text-foreground">
                  {currentEvent.name}
                </h2>
                )}

                <div className="h-1 w-full rounded-full bg-primary" />

                <div className="text-sm text-muted-foreground space-y-1">
                  {currentEvent.starts_at && (
                        <>
                      {(() => {
                        const parseDateTime = (dateTimeStr: string | null) => {
                          if (!dateTimeStr) return null

                          const match = dateTimeStr.match(
                            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
                          )
                          if (!match) return null

                          const [, year, month, day, hour, minute] = match
                          return {
                            year: parseInt(year, 10),
                            month: parseInt(month, 10),
                            day: parseInt(day, 10),
                            hour: parseInt(hour, 10),
                            minute: parseInt(minute, 10),
                          }
                        }

                        const startParts = parseDateTime(currentEvent.starts_at)
                        if (!startParts) {
                              return <p className="whitespace-nowrap">Schedule coming soon</p>
                        }

                        const endParts = currentEvent.ends_at
                          ? parseDateTime(currentEvent.ends_at)
                          : null

                            const formatMonth = (month: number) => {
                              const date = new Date(2000, month - 1, 1)
                              return date.toLocaleDateString("en-US", { month: "long" })
                        }

                        const formatTime = (parts: {
                          hour: number
                          minute: number
                        }) => {
                          const hour12 = parts.hour % 12 || 12
                          const ampm = parts.hour >= 12 ? "PM" : "AM"
                          const minuteStr = String(parts.minute).padStart(2, "0")
                              return `${hour12}:${minuteStr}${ampm}`
                        }

                        const startTimeStr = formatTime(startParts)
                            const endTimeStr = endParts ? formatTime(endParts) : null

                            // Format date range: "December 12" (for single day) or "November 12 - December 1" (for multi-day)
                            let dateRange = ""
                            if (endParts && startParts.month === endParts.month && startParts.day === endParts.day) {
                              // Same day: "December 12"
                              dateRange = `${formatMonth(startParts.month)} ${startParts.day}`
                            } else if (endParts && startParts.month === endParts.month) {
                              // Same month, different days: "November 12-13"
                              dateRange = `${formatMonth(startParts.month)} ${startParts.day}-${endParts.day}`
                            } else if (endParts) {
                              // Different months: "November 12 - December 1"
                              dateRange = `${formatMonth(startParts.month)} ${startParts.day} - ${formatMonth(endParts.month)} ${endParts.day}`
                          } else {
                              // No end date: "November 12"
                              dateRange = `${formatMonth(startParts.month)} ${startParts.day}`
                            }

                            return (
                              <>
                                {endTimeStr ? (
                                  <p className="whitespace-nowrap">Date: {dateRange} from {startTimeStr} - {endTimeStr}</p>
                                ) : (
                                  <>
                                    <p className="whitespace-nowrap">Date: {dateRange}</p>
                                    <p className="whitespace-nowrap">Start: {startTimeStr}</p>
                                  </>
                                )}
                              </>
                            )
                      })()}
                        </>
                  )}
                  {currentEvent.location && (
                        <p className="font-medium whitespace-nowrap">Location: {currentEvent.location}</p>
                  )}
                </div>

                {!isPresent && (
                  <>
                    <button
                      onClick={togglePresence}
                      disabled={isLoading}
                      className="px-8 py-3 rounded-concave text-white font-medium text-lg mx-auto block bg-primary transition-all hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]"
                      style={{
                        border: "none",
                      }}
                    >
                      I&apos;m Here
                    </button>
                    <p className="text-muted-foreground text-center text-sm">
                      Let your Intro matches know you&apos;re at the conference
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* SMS notifications (currently hidden toggle) */}
          {false && currentEvent && <SMSNotificationWidget />}

          {/* Top 3 Suggestions */}
          {currentEvent && (
            <div className="space-y-3 pt-2" data-guide="suggested-connections">
              <div className="px-1">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                    <Users className="h-5 w-5" />
                    <span>Top 3 Suggestions</span>
                  </h2>
                  {false && showRefreshButton && currentEvent.matchmaking_enabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshMatches}
                      disabled={isRefreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                      />
                      {isRefreshing ? "Refreshing..." : "Refresh Matches"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {matches.length > 0 ? (
                  matches.map((match, index) => (
                    <MatchCard
                      key={`${match.id}-${match.profile.id}-${index}`}
                      name={`${match.profile.first_name} ${match.profile.last_name}`}
                      jobTitle={match.profile.job_title || ""}
                      company={match.profile.company || ""}
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
                        The event organizer will start the AI matchmaking process soon.
                        Check back later for personalized introductions!
                      </p>
                      <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" />
                        <div
                          className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"
                          style={{ animationDelay: "0.2s" }}
                        />
                        <div
                          className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"
                          style={{ animationDelay: "0.4s" }}
                        />
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

          {/* Add Other Attendees */}
          {currentEvent && (
            <div className="space-y-3 pt-2">
              <div className="px-1 space-y-2">
                <h2 className="flex items-center space-x-2 text-lg font-semibold text-foreground">
                  <QrCode className="h-5 w-5" />
                  <span>Add other attendees</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Skip the small talk by scanning another attendee&apos;s QR code to see
                  what you have in common.
                </p>
              </div>

              <Card
                className="bg-card border-border shadow-elevation"
                data-guide="qr-section"
              >
                <CardContent className="p-4 space-y-4">
                  <QRCard onScanClick={handleQRScan} eventId={currentEvent.id} />

                  {manualConnections.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Added &amp; Pending
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
                                  {item.profile.company &&
                                    ` at ${item.profile.company}`}
                                </p>
                              )}
                              {statusLabel && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {statusLabel}
                                </p>
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

          {/* Directory */}
          {currentEvent && (
            <div className="space-y-3 pt-2">
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

              <Card className="bg-card border-border shadow-elevation">
                <CardContent className="p-4 space-y-3">
                  {directory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      As attendees complete their profiles, you&apos;ll see them here.
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
                          const shouldShowStatusLabel =
                            statusLabel &&
                            !(directoryFilter === "connected" &&
                              entry.status === "connected")

                          const isClickable = entry.status === "connected" && currentEvent
                          const handleContainerClick = () => {
                            if (isClickable) {
                              router.push(
                                `/profile/${entry.profile.id}?source=connection&eventId=${currentEvent.id}`,
                              )
                            }
                          }

                          return (
                            <div
                              key={entry.profile.id}
                              onClick={handleContainerClick}
                              className={`flex items-center space-x-3 px-3 py-4 rounded-lg border border-border bg-card/60 ${
                                isClickable
                                  ? "cursor-pointer hover:bg-card/80 transition-colors"
                                  : ""
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
                                    {entry.profile.company &&
                                      ` at ${entry.profile.company}`}
                                  </p>
                                )}
                                {shouldShowStatusLabel && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {statusLabel}
                                  </p>
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
          <DialogClose className="absolute -top-3 -right-3 z-50 rounded-2xl bg-background p-2 opacity-90 transition-all hover:opacity-100 hover:scale-110 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden border border-border shadow-md">
            <XIcon className="h-4 w-4 text-foreground" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            <div className="text-center space-y-2">
              <DialogTitle className="text-xl">Joining Event...</DialogTitle>
              <DialogDescription className="text-base pt-2">
                To help you connect with the most helpful people here, we&apos;ll ask you
                only a few questions.
              </DialogDescription>
              <p className="text-xs text-muted-foreground mt-4">
                This may take 30 seconds to load. Do not refresh.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw connection dialog */}
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
              . They&apos;ll no longer see your request.
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
        <UserGuide steps={guideSteps} storageKey="intro-homepage-guide-completed" />
      )}
    </div>
  )
}
