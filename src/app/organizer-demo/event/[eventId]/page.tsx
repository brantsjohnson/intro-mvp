"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { OrganizerEventAnalyticsDashboard } from "@/components/organizer/organizer-event-analytics-dashboard"
import type { OrganizerAttendanceRosterRow } from "@/lib/organizer-metrics"
import {
  ORGANIZER_DEMO_EVENT_ID,
  getOrganizerDemoAnalytics,
  getOrganizerDemoMatchesPage,
  getOrganizerDemoRosterPage,
  getOrganizerDemoSponsors,
  type OrganizerDemoMatchRow,
  type OrganizerDemoSponsorRow,
} from "@/lib/organizer-demo-data"
import { ArrowLeft, ChevronDown, ChevronRight, Sparkles, Users } from "lucide-react"

type OrganizerEventMeta = {
  eventName: string | null
  eventStartsAt: string | null
  eventEndsAt: string | null
  eventCode: string | null
}

export default function OrganizerDemoEventPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params?.eventId as string

  const demoAnalytics = useMemo(() => getOrganizerDemoAnalytics(), [])

  const [eventMeta, setEventMeta] = useState<OrganizerEventMeta>({
    eventName: null,
    eventStartsAt: null,
    eventEndsAt: null,
    eventCode: null,
  })

  const handleEventMetaChange = useCallback((next: OrganizerEventMeta) => {
    setEventMeta((prev) => {
      if (
        prev.eventName === next.eventName &&
        prev.eventStartsAt === next.eventStartsAt &&
        prev.eventEndsAt === next.eventEndsAt &&
        prev.eventCode === next.eventCode
      ) {
        return prev
      }
      return next
    })
  }, [])

  const [rosterPage, setRosterPage] = useState(1)
  const [rosterTotal, setRosterTotal] = useState(0)
  const [rosterRows, setRosterRows] = useState<OrganizerAttendanceRosterRow[]>(
    [],
  )

  const [matchesPage, setMatchesPage] = useState(1)
  const [matchesTotal, setMatchesTotal] = useState(0)
  const [matchRows, setMatchRows] = useState<OrganizerDemoMatchRow[]>([])

  const [operationalOpen, setOperationalOpen] = useState(false)
  const [sponsorsOpen, setSponsorsOpen] = useState(false)
  const [sponsors, setSponsors] = useState<OrganizerDemoSponsorRow[]>([])

  const pageSize = 40

  useEffect(() => {
    if (eventId !== ORGANIZER_DEMO_EVENT_ID) {
      router.replace("/organizer-demo")
    }
  }, [eventId, router])

  useEffect(() => {
    if (!operationalOpen || eventId !== ORGANIZER_DEMO_EVENT_ID) return
    const r = getOrganizerDemoRosterPage(rosterPage, pageSize)
    setRosterTotal(r.total)
    setRosterRows(r.rows)
  }, [eventId, operationalOpen, rosterPage, pageSize])

  useEffect(() => {
    if (!operationalOpen || eventId !== ORGANIZER_DEMO_EVENT_ID) return
    const m = getOrganizerDemoMatchesPage(matchesPage, pageSize)
    setMatchesTotal(m.total)
    setMatchRows(m.rows)
  }, [eventId, operationalOpen, matchesPage, pageSize])

  useEffect(() => {
    if (!sponsorsOpen || eventId !== ORGANIZER_DEMO_EVENT_ID) return
    setSponsors(getOrganizerDemoSponsors())
  }, [eventId, sponsorsOpen])

  if (!eventId) return null

  if (eventId !== ORGANIZER_DEMO_EVENT_ID) {
    return null
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Link href="/organizer-demo">
          <GradientButton variant="outline" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </GradientButton>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {eventMeta.eventName?.trim() || "Event"}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {eventMeta.eventStartsAt ? (
              <span>Starts {new Date(eventMeta.eventStartsAt).toLocaleString()}</span>
            ) : null}
            {eventMeta.eventEndsAt ? (
              <span>Ends {new Date(eventMeta.eventEndsAt).toLocaleString()}</span>
            ) : null}
            <span className="min-w-0 text-[11px]">
              <span className="text-muted-foreground">Join code </span>
              <span className="font-mono font-semibold tracking-wide text-foreground/90">
                {eventMeta.eventCode?.trim() || "—"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <OrganizerEventAnalyticsDashboard
        eventId={eventId}
        onForbidden={() => {}}
        showEventHeader={false}
        onEventMetaChange={handleEventMetaChange}
        demoAnalytics={demoAnalytics}
      />

      <div id="organizer-operational-data" className="scroll-mt-8">
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              onClick={() => setOperationalOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left rounded-lg -m-2 p-2 hover:bg-muted/50 transition-colors"
            >
              <CardTitle className="flex items-center gap-2 text-base">
                {operationalOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <Users className="h-4 w-4" />
                Operational data
              </CardTitle>
              <span className="text-xs text-muted-foreground shrink-0">
                Guest list and suggested pairs
              </span>
            </button>
          </CardHeader>
          {operationalOpen ? (
            <CardContent className="space-y-8 text-xs">
              <div>
                <h3 className="text-sm font-medium mb-2 flex flex-row items-center justify-between">
                  <span>Attendee roster</span>
                  <span className="flex gap-2">
                    <GradientButton
                      variant="outline"
                      size="sm"
                      disabled={rosterPage <= 1}
                      onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </GradientButton>
                    <GradientButton
                      variant="outline"
                      size="sm"
                      disabled={rosterPage * pageSize >= rosterTotal}
                      onClick={() => setRosterPage((p) => p + 1)}
                    >
                      Next
                    </GradientButton>
                  </span>
                </h3>
                <p className="text-muted-foreground mb-2">
                  Page {rosterPage} — {rosterTotal} total
                </p>
                <div className="overflow-x-auto rounded border border-border outline-surface-inset">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="p-2">Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">Onboarding</th>
                        <th className="p-2">Business need</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterRows.map((r) => (
                        <tr key={r.user_id} className="border-b border-border/80">
                          <td className="p-2">
                            {[r.first_name, r.last_name].filter(Boolean).join(" ") ||
                              "—"}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {r.email ?? "—"}
                          </td>
                          <td className="p-2">
                            {r.onboarding_completed ? "Yes" : "No"}
                          </td>
                          <td
                            className="p-2 max-w-[200px] truncate"
                            title={r.business_need_preview ?? ""}
                          >
                            {r.business_need_preview ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 flex flex-row items-center justify-between">
                  <span>Suggested pairs</span>
                  <span className="flex gap-2">
                    <GradientButton
                      variant="outline"
                      size="sm"
                      disabled={matchesPage <= 1}
                      onClick={() => setMatchesPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </GradientButton>
                    <GradientButton
                      variant="outline"
                      size="sm"
                      disabled={matchesPage * pageSize >= matchesTotal}
                      onClick={() => setMatchesPage((p) => p + 1)}
                    >
                      Next
                    </GradientButton>
                  </span>
                </h3>
                <p className="text-muted-foreground mb-2">
                  Suggested introductions — page {matchesPage} of{" "}
                  {matchesTotal}
                </p>
                <div className="overflow-x-auto rounded border border-border outline-surface-inset">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="p-2">A</th>
                        <th className="p-2">B</th>
                        <th className="p-2">Score</th>
                        <th className="p-2">Ref</th>
                        <th className="p-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchRows.map((r) => (
                        <tr key={r.connection_id} className="border-b border-border/80">
                          <td className="p-2">{r.a_display}</td>
                          <td className="p-2">{r.b_display}</td>
                          <td className="p-2 font-mono">
                            {r.match_score != null ? r.match_score.toFixed(3) : "—"}
                          </td>
                          <td className="p-2 font-mono">
                            {r.match_algorithm_version ?? "—"}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {r.created_at
                              ? new Date(r.created_at).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          ) : null}
        </Card>
      </div>

      <div id="organizer-sponsors" className="scroll-mt-8">
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              onClick={() => setSponsorsOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left rounded-lg -m-2 p-2 hover:bg-muted/50 transition-colors"
            >
              <CardTitle className="flex items-center gap-2 text-base">
                {sponsorsOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <Sparkles className="h-4 w-4" />
                Sponsors
              </CardTitle>
              <span className="text-xs text-muted-foreground shrink-0">
                Goals and outreach stats (no message content)
              </span>
            </button>
          </CardHeader>
          {sponsorsOpen ? (
            <CardContent className="space-y-4 text-xs">
              {sponsors.length === 0 ? (
                <p className="text-muted-foreground">No demo sponsors.</p>
              ) : (
                <ul className="space-y-4">
                  {sponsors.map((s) => (
                    <li
                      key={s.user_id}
                      className="rounded-md border border-border p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-sm">{s.display_name}</span>
                        {s.active_recently && (
                          <span className="text-[10px] uppercase text-green-600">Active (24h)</span>
                        )}
                      </div>
                      {(s.company_name || s.company_summary) && (
                        <p className="text-muted-foreground">
                          {[s.company_name, s.company_summary].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {s.product_offering && (
                        <p>
                          <span className="font-medium text-foreground">Offering: </span>
                          {s.product_offering}
                        </p>
                      )}
                      {s.event_goals && (
                        <p>
                          <span className="font-medium text-foreground">Event goals: </span>
                          {s.event_goals}
                        </p>
                      )}
                      <p className="text-muted-foreground font-mono">
                        Msgs {s.messages_sent} · Replies {s.replied} · LinkedIn {s.linkedin} · Met{" "}
                        {s.met}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
