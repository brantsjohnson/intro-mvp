"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ChevronDown, ChevronUp, ExternalLink, Linkedin, Pencil, Target, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  SPONSOR_PHASE_D_MIGRATION_FILE,
  SPONSOR_PHASE_F_MIGRATION_FILE,
} from "@/lib/sponsor-schema-guard"
import {
  sponsorDisclosureSummaryClassName,
  sponsorKpiCardClassName,
  sponsorKpiHeroClassName,
  sponsorNavPillInactive,
  sponsorOutlineButtonClassName,
  sponsorPrimaryButtonClassName,
  sponsorSectionCardClassName,
} from "@/lib/sponsor-ui"
import { cn } from "@/lib/utils"
import {
  type IntentRow,
  SponsorAudienceIntentChart,
  SponsorOutreachByDayChart,
  SponsorPipelineBarChart,
} from "@/components/sponsor/sponsor-insights-tab"

type RecRow = {
  user_id: string
  display_name: string
  career_title: string | null
  company_name: string | null
  score: number
  reason_tags: string[]
  fit_signals?: string[]
  match_explanation_text: string | null
  current_status: string
  notes: string | null
  lead_id: string | null
  linkedin_url: string | null
}

type SponsorProfile = {
  company_description: string | null
  product_offering: string | null
  ideal_customer_json: {
    industries?: string[]
    roles?: string[]
    company_stages?: string[]
  }
  event_goals: string | null
}

type MatchSummaryInfo = {
  status:
    | "generated"
    | "skipped_no_openai"
    | "skipped_no_profile"
    | "skipped_no_candidates"
    | "migration_required"
    | "openai_or_db_failed"
  openaiConfigured: boolean
  hint?: string
  migrationFile?: string
  candidates?: number
  saved?: number
  skippedCached?: number
}

export default function SponsorEventDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params?.eventId as string

  const [forbidden, setForbidden] = useState(false)

  const [profile, setProfile] = useState<SponsorProfile | null>(null)
  const [profileDismissed, setProfileDismissed] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [companyDesc, setCompanyDesc] = useState("")
  const [productOffering, setProductOffering] = useState("")
  const [eventGoals, setEventGoals] = useState("")
  const [icpIndustries, setIcpIndustries] = useState("")
  const [icpRoles, setIcpRoles] = useState("")
  const [icpStages, setIcpStages] = useState("")
  const [sponsorshipInvestment, setSponsorshipInvestment] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)

  const [recsLoading, setRecsLoading] = useState(true)
  const [needsProfileFlag, setNeedsProfileFlag] = useState(false)
  const [recommendations, setRecommendations] = useState<RecRow[]>([])
  const [showAll, setShowAll] = useState(false)

  /** Side panel state */
  const [selectedRec, setSelectedRec] = useState<RecRow | null>(null)
  const [panelNotes, setPanelNotes] = useState("")

  const [msgOpen, setMsgOpen] = useState(false)
  const [msgTarget, setMsgTarget] = useState<RecRow | null>(null)
  const [msgBody, setMsgBody] = useState("")
  const [msgSending, setMsgSending] = useState(false)

  const [insightsLoading, setInsightsLoading] = useState(true)
  const [connectionTypes, setConnectionTypes] = useState<IntentRow[]>([])
  const [totalAttendees, setTotalAttendees] = useState(0)

  const [roiLoading, setRoiLoading] = useState(true)
  const [roi, setRoi] = useState<{
    messages_sent: number
    replies_received: number
    linkedin_logged: number
    met_marked: number
    engaged_leads_total: number
    outreach_by_day: { date: string; count: number }[]
    funnel: { id: string; label: string; count: number }[]
    top_topics: { tag: string; count: number }[]
    qualified_leads?: number
    strong_fits?: number
    potential_deals_low?: number
    potential_deals_high?: number
    top_reason_tags?: string[]
    top_industries?: string[]
    outreach_table: Array<{
      lead_id: string
      attendee_user_id: string
      display_name: string
      status: string
      notes: string | null
      updated_at: string | null
    }>
    migrationRequired?: boolean
    migrationHint?: string
  } | null>(null)

  const [sponsorMigrationRequired, setSponsorMigrationRequired] = useState(false)
  const [sponsorMigrationHint, setSponsorMigrationHint] = useState<string | null>(null)
  const [matchSummaryInfo, setMatchSummaryInfo] = useState<MatchSummaryInfo | null>(null)

  const recsHydratedRef = useRef(false)

  const patchRecommendationRow = useCallback((userId: string, patch: Partial<RecRow>) => {
    setRecommendations((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, ...patch } : r)),
    )
    setSelectedRec((prev) =>
      prev?.user_id === userId ? { ...prev, ...patch } : prev,
    )
  }, [])

  const loadProfile = useCallback(async () => {
    const res = await fetch(`/api/sponsor/profile?eventId=${encodeURIComponent(eventId)}`)
    if (res.status === 403) { setForbidden(true); return }
    if (!res.ok) return
    const data = await res.json()
    if (data.migrationRequired === true) {
      setSponsorMigrationRequired(true)
      setSponsorMigrationHint(
        (h) => (data.migrationHint as string | undefined) ?? h ?? SPONSOR_PHASE_D_MIGRATION_FILE,
      )
    }
    const p = data.profile as SponsorProfile | null
    setProfile(p)
    if (p) {
      setCompanyDesc(p.company_description ?? "")
      setProductOffering(p.product_offering ?? "")
      setEventGoals(p.event_goals ?? "")
      setIcpIndustries((p.ideal_customer_json?.industries ?? []).join(", "))
      setIcpRoles((p.ideal_customer_json?.roles ?? []).join(", "))
      setIcpStages((p.ideal_customer_json?.company_stages ?? []).join(", "))
    }
  }, [eventId])

  const loadRecommendations = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true
      if (!silent) setRecsLoading(true)
      try {
        const res = await fetch(`/api/sponsor/recommendations?eventId=${encodeURIComponent(eventId)}`)
        if (res.status === 403) { setForbidden(true); setMatchSummaryInfo(null); return }
        if (!res.ok) { setMatchSummaryInfo(null); return }
        const data = await res.json()
        if (data.migrationRequired === true) {
          setSponsorMigrationRequired(true)
          setSponsorMigrationHint(
            (h) => (data.migrationHint as string | undefined) ?? h ?? SPONSOR_PHASE_D_MIGRATION_FILE,
          )
        }
        setNeedsProfileFlag(data.needsProfile === true)
        const next = (data.recommendations ?? []) as RecRow[]
        if (silent) {
          setRecommendations((prev) => {
            const prevIds = new Set(prev.map((r) => r.user_id))
            const added = next.filter((r) => !prevIds.has(r.user_id))
            if (added.length > 0) {
              toast.message(
                added.length === 1
                  ? "1 new person added to your list."
                  : `${added.length} new people added to your list.`,
                { duration: 4500 },
              )
            }
            return next
          })
        } else {
          setRecommendations(next)
        }
        const ms = data.matchSummaryInfo as MatchSummaryInfo | undefined
        setMatchSummaryInfo(ms ?? null)
        if (process.env.NODE_ENV === "development" && ms) {
          console.info("[Sponsor] Match summaries status:", ms)
        }
        recsHydratedRef.current = true
      } finally {
        if (!silent) setRecsLoading(false)
      }
    },
    [eventId],
  )

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true)
    const res = await fetch(`/api/sponsor/event-insights?${new URLSearchParams({ eventId })}`)
    if (res.status === 403) { setForbidden(true); setInsightsLoading(false); return }
    if (!res.ok) { setInsightsLoading(false); return }
    const data = await res.json()
    setTotalAttendees(typeof data.total_attendees === "number" ? data.total_attendees : 0)
    setConnectionTypes(data.connection_types ?? [])
    setInsightsLoading(false)
  }, [eventId])

  const loadRoi = useCallback(async () => {
    setRoiLoading(true)
    const res = await fetch(`/api/sponsor/roi-summary?eventId=${encodeURIComponent(eventId)}`)
    if (res.status === 403) { setForbidden(true); setRoiLoading(false); return }
    if (!res.ok) { setRoiLoading(false); return }
    const data = await res.json()
    if (data.migrationRequired === true) {
      setSponsorMigrationRequired(true)
      setSponsorMigrationHint(
        (h) => (data.migrationHint as string | undefined) ?? h ?? SPONSOR_PHASE_D_MIGRATION_FILE,
      )
    }
    setRoi(data)
    setRoiLoading(false)
  }, [eventId])

  useEffect(() => { if (!eventId) return; void loadProfile() }, [eventId, loadProfile])
  useEffect(() => {
    if (!eventId || forbidden) return
    recsHydratedRef.current = false
    void loadRecommendations()
  }, [eventId, forbidden, loadRecommendations])
  useEffect(() => { if (!eventId || forbidden) return; void loadInsights() }, [eventId, forbidden, loadInsights])
  useEffect(() => { if (!eventId || forbidden) return; void loadRoi() }, [eventId, forbidden, loadRoi])

  const profileReady = useMemo(() => {
    const industries = icpIndustries.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    const roles = icpRoles.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    const stages = icpStages.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    return productOffering.trim().length > 0 || industries.length > 0 || roles.length > 0 || stages.length > 0
  }, [productOffering, icpIndustries, icpRoles, icpStages])

  const profileSet = profile !== null

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const payload: Record<string, unknown> = {
        eventId,
        company_description: companyDesc,
        product_offering: productOffering,
        event_goals: eventGoals,
        ideal_customer_json: {
          industries: icpIndustries.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
          roles: icpRoles.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
          company_stages: icpStages.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
        },
      }
      const investRaw = sponsorshipInvestment.trim()
      if (investRaw !== "") {
        const n = parseFloat(investRaw.replace(/[^0-9.-]/g, ""))
        if (Number.isFinite(n) && n >= 0) payload.sponsorship_cost = n
      }
      const res = await fetch("/api/sponsor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Could not save profile"); return }
      setProfile(data.profile)
      setProfileEditing(false)
      toast.success("Profile saved")
      setSponsorshipInvestment("")
      await loadRecommendations({ silent: recsHydratedRef.current })
      await loadRoi()
    } finally {
      setSavingProfile(false)
    }
  }

  const openMessage = (row: RecRow) => {
    setMsgTarget(row)
    setMsgBody("")
    setMsgOpen(true)
  }

  const sendMessage = async () => {
    if (!msgTarget || !msgBody.trim()) return
    setMsgSending(true)
    try {
      const res = await fetch("/api/sponsor/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, action: "message", attendeeUserId: msgTarget.user_id, messageBody: msgBody.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Failed to send"); return }
      toast.success("Message sent")
      setMsgOpen(false)
      patchRecommendationRow(msgTarget.user_id, { current_status: "messaged" })
      await loadRoi()
      if (data.conversationId) {
        router.push(`/messages/conversation?eventId=${encodeURIComponent(eventId)}&threadId=${encodeURIComponent(data.conversationId)}`)
      }
    } finally {
      setMsgSending(false)
    }
  }

  const postOutreach = async (
    action: "linkedin" | "met",
    attendeeUserId: string,
    opts?: { openLinkedInUrl?: string },
  ) => {
    if (opts?.openLinkedInUrl) window.open(opts.openLinkedInUrl, "_blank", "noopener,noreferrer")
    const res = await fetch("/api/sponsor/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, action, attendeeUserId }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || "Failed"); return }
    if (action === "linkedin") {
      toast.success(opts?.openLinkedInUrl ? "Opened profile — LinkedIn logged" : "LinkedIn logged")
      patchRecommendationRow(attendeeUserId, { current_status: "linkedin" })
    } else {
      toast.success("Marked as met")
      patchRecommendationRow(attendeeUserId, { current_status: "met" })
    }
    await loadRoi()
  }

  const saveNotes = async (attendeeUserId: string, notes: string) => {
    const res = await fetch("/api/sponsor/outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, attendeeUserId, notes }),
    })
    if (!res.ok) { const data = await res.json(); toast.error(data.error || "Could not save notes"); return }
    toast.success("Notes saved")
    patchRecommendationRow(attendeeUserId, { notes })
    await loadRoi()
  }

  if (!eventId) return null

  if (forbidden) {
    return (
      <Card className={sponsorSectionCardClassName}>
        <CardHeader><CardTitle>Access denied</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>You are not a sponsor for this event.</p>
          <GradientButton variant="outline" className={sponsorOutlineButtonClassName} onClick={() => router.push("/sponsor")}>
            Back to your events
          </GradientButton>
        </CardContent>
      </Card>
    )
  }

  const STATUS_LABELS: Record<string, string> = {
    recommended: "Recommended",
    messaged: "Messaged",
    reached_out: "Reached out",
    replied: "Replied",
    connected: "Connected",
    linkedin: "LinkedIn",
    met: "Met",
    contacted_later: "Following up",
    closed_deal: "Closed",
  }
  const statusLabel = (s: string) => STATUS_LABELS[s] ?? s

  const visibleRecs = showAll ? recommendations : recommendations.slice(0, 10)
  const hasMoreRecs = recommendations.length > 10
  const hasOutreachActivity = roi !== null && roi.outreach_by_day.some((d) => d.count > 0)
  const profileFormVisible = (!profileSet && !profileDismissed) || profileEditing

  const formatDeal = (low?: number, high?: number) => {
    if (!low && !high) return "—"
    const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`
    if (low && high && low !== high) return `${fmt(low)}–${fmt(high)}`
    return fmt(low ?? high ?? 0)
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Your event dashboard</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          See who to approach, track your conversations, and measure your results.
        </p>
      </div>

      {/* Migration warning */}
      {sponsorMigrationRequired && (
        <div role="status" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-medium">Sponsor data tables are not on this database yet</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/80">
            Apply the Phase D migration in Supabase, then reload.{" "}
            <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs break-all">
              {sponsorMigrationHint ?? SPONSOR_PHASE_D_MIGRATION_FILE}
            </code>
          </p>
        </div>
      )}

      {/* ── KPI STRIP ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={cn(sponsorKpiHeroClassName, "col-span-2 sm:col-span-1")}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Potential deals</p>
          {roiLoading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-muted" />
          ) : (
            <p className="mt-1 text-3xl font-bold tabular-nums leading-none sm:text-2xl">
              {formatDeal(roi?.potential_deals_low, roi?.potential_deals_high)}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Estimated from your strong matches — not a revenue guarantee.
          </p>
        </div>

        <div className={sponsorKpiCardClassName}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Strong matches</p>
          {roiLoading ? <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-muted" /> : (
            <p className="mt-1 text-3xl font-bold tabular-nums leading-none sm:text-2xl">{roi?.strong_fits ?? "—"}</p>
          )}
        </div>

        <div className={sponsorKpiCardClassName}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reached so far</p>
          {roiLoading ? <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-muted" /> : (
            <p className="mt-1 text-3xl font-bold tabular-nums leading-none sm:text-2xl">{roi?.engaged_leads_total ?? "—"}</p>
          )}
        </div>

        <div className={sponsorKpiCardClassName}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Replies received</p>
          {roiLoading ? <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-muted" /> : (
            <p className="mt-1 text-3xl font-bold tabular-nums leading-none sm:text-2xl">{roi?.replies_received ?? "—"}</p>
          )}
        </div>
      </div>

      {/* ── PROFILE SETUP / EDIT ─────────────────────────────────── */}
      {profileFormVisible ? (
        <Card className={sponsorSectionCardClassName}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5" />
              {profileSet ? "Edit your targeting" : "Set up your profile for better match suggestions"}
            </CardTitle>
            {!profileSet && (
              <p className="text-xs text-muted-foreground">
                Optional — fill in later. Without it we still show you attendees.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>What does your company do?</Label>
              <Textarea value={companyDesc} onChange={(e) => setCompanyDesc(e.target.value)} placeholder="Brief description of your company" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>What are you selling or promoting here?</Label>
              <Textarea value={productOffering} onChange={(e) => setProductOffering(e.target.value)} placeholder="What you are pitching or demoing" rows={2} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>What industries are your best customers in?</Label>
                <Input value={icpIndustries} onChange={(e) => setIcpIndustries(e.target.value)} placeholder="fintech, saas, healthcare" />
              </div>
              <div className="space-y-2">
                <Label>What job titles do you usually sell to?</Label>
                <Input value={icpRoles} onChange={(e) => setIcpRoles(e.target.value)} placeholder="founder, vp sales, cto" />
              </div>
              <div className="space-y-2">
                <Label>What size or stage of company do you target?</Label>
                <Input value={icpStages} onChange={(e) => setIcpStages(e.target.value)} placeholder="seed, series a" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>What do you want to get out of this event?</Label>
              <Textarea value={eventGoals} onChange={(e) => setEventGoals(e.target.value)} placeholder="e.g. Book demos, find design partners..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Sponsorship investment (optional)</Label>
              <Input type="text" inputMode="decimal" value={sponsorshipInvestment} onChange={(e) => setSponsorshipInvestment(e.target.value)} placeholder="Amount for this event (not shown after save)" className="max-w-md" />
              <p className="text-[11px] text-muted-foreground">Used only for organizer reporting. Leave blank if you prefer not to share.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <GradientButton onClick={saveProfile} disabled={savingProfile} className={cn(sponsorPrimaryButtonClassName, "min-h-11 px-6 sm:min-h-10")}>
                {savingProfile ? "Saving…" : "Save"}
              </GradientButton>
              {!profileSet && (
                <GradientButton variant="outline" type="button" className={cn(sponsorOutlineButtonClassName, "min-h-11 sm:min-h-10")} onClick={() => setProfileDismissed(true)}>
                  Fill in later
                </GradientButton>
              )}
              {profileSet && profileEditing && (
                <GradientButton variant="outline" type="button" className={cn(sponsorOutlineButtonClassName, "min-h-11 sm:min-h-10")} onClick={() => setProfileEditing(false)}>
                  Cancel
                </GradientButton>
              )}
            </div>
          </CardContent>
        </Card>
      ) : !profileSet && profileDismissed ? (
        <p className="text-xs text-muted-foreground">
          <button type="button" className="underline hover:text-foreground" onClick={() => setProfileDismissed(false)}>
            Set up your profile
          </button>{" "}for better match suggestions.
        </p>
      ) : null}

      {/* ── PIPELINE ─────────────────────────────────────────────── */}
      {!roiLoading && roi && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Pipeline</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Everyone you&apos;ve been recommended to connect with, by relationship stage.
          </p>
          <Card className={sponsorSectionCardClassName}>
            <CardContent className="pt-4">
              <SponsorPipelineBarChart funnel={roi.funnel} />
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── TOP 10 WARM LEADS ───────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Top {Math.min(recommendations.length || 10, 10)} warm leads
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The people most worth a conversation — click any row for details.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Export to CRM — coming soon */}
            <button
              type="button"
              disabled
              title="CRM integration coming soon"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60 shadow-sm"
              onClick={() => toast.info("CRM integration coming soon.")}
            >
              <Upload className="h-3 w-3" />
              Export to CRM
            </button>
            {profileSet && !profileEditing && (
              <button
                type="button"
                onClick={() => {
                  const p = profile!
                  setCompanyDesc(p.company_description ?? "")
                  setProductOffering(p.product_offering ?? "")
                  setEventGoals(p.event_goals ?? "")
                  setIcpIndustries((p.ideal_customer_json?.industries ?? []).join(", "))
                  setIcpRoles((p.ideal_customer_json?.roles ?? []).join(", "))
                  setIcpStages((p.ideal_customer_json?.company_stages ?? []).join(", "))
                  setSponsorshipInvestment("")
                  setProfileEditing(true)
                }}
                className={cn(sponsorNavPillInactive, "inline-flex items-center gap-1.5 text-xs")}
              >
                <Pencil className="h-3 w-3" />
                Edit targeting
              </button>
            )}
          </div>
        </div>

        {/* Match summary warning */}
        {matchSummaryInfo &&
          ["skipped_no_openai", "skipped_no_profile", "skipped_no_candidates", "migration_required", "openai_or_db_failed"].includes(matchSummaryInfo.status) && (
            <div role="status" className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Why summaries aren&apos;t ready yet</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{matchSummaryInfo.hint ?? "Check the server logs for details."}</p>
              {matchSummaryInfo.status === "migration_required" && (
                <code className="mt-2 block rounded bg-amber-500/20 px-1.5 py-1 text-[11px] break-all">
                  {matchSummaryInfo.migrationFile ?? SPONSOR_PHASE_F_MIGRATION_FILE}
                </code>
              )}
            </div>
          )}

        {needsProfileFlag && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-500">
            Add your profile above for smarter rankings (optional).
          </p>
        )}

        {/* Compact lead table */}
        {recsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attendees yet.</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[2fr_1fr_auto]">
                <span>Name / Role</span>
                <span className="hidden sm:block">Company</span>
                <span className="text-right">Status</span>
              </div>

              {visibleRecs.map((r, i) => (
                <button
                  key={r.user_id}
                  type="button"
                  onClick={() => {
                    setSelectedRec(r)
                    setPanelNotes(r.notes ?? "")
                  }}
                  className={cn(
                    "grid w-full grid-cols-[1fr_auto] gap-x-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 sm:grid-cols-[2fr_1fr_auto]",
                    i < visibleRecs.length - 1 && "border-b border-border/60",
                  )}
                >
                  {/* Name + role */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-snug">{r.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.career_title || "—"}</p>
                  </div>

                  {/* Company — hidden on mobile */}
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-sm text-muted-foreground">{r.company_name || "—"}</p>
                    <MatchBar score={r.score} />
                  </div>

                  {/* Status badge */}
                  <div className="flex flex-col items-end justify-center gap-1">
                    <StatusBadge status={r.current_status} />
                    <MatchBar score={r.score} className="sm:hidden" />
                  </div>
                </button>
              ))}
            </div>

            {hasMoreRecs && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground"
              >
                {showAll ? (
                  <><ChevronUp className="h-4 w-4" />Show fewer</>
                ) : (
                  <><ChevronDown className="h-4 w-4" />See all {recommendations.length} people</>
                )}
              </button>
            )}
          </>
        )}
      </section>

      {/* ── ACTIVITY ─────────────────────────────────────────────── */}
      {hasOutreachActivity && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Your outreach activity</h2>
          <Card className={sponsorSectionCardClassName}>
            <CardContent className="pt-4">
              <SponsorOutreachByDayChart outreachByDay={roi!.outreach_by_day} />
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── AUDIENCE OVERVIEW ─────────────────────────────────────── */}
      {!insightsLoading && connectionTypes.length > 0 && (
        <section>
          <details className="rounded-2xl border border-border bg-card shadow-sm">
            <summary className={cn(sponsorDisclosureSummaryClassName, "rounded-2xl px-5 py-4 text-sm font-semibold text-foreground")}>
              Audience overview
            </summary>
            <div className="px-5 pb-5 pt-2">
              <p className="mb-4 text-sm text-muted-foreground">What this audience is looking for</p>
              <SponsorAudienceIntentChart
                connectionTypes={connectionTypes}
                totalAttendees={totalAttendees}
                profileReady={profileReady}
              />
            </div>
          </details>
        </section>
      )}

      {/* ── LEAD DETAIL SIDE PANEL ───────────────────────────────── */}
      <Sheet open={!!selectedRec} onOpenChange={(o) => { if (!o) setSelectedRec(null) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          {selectedRec && (
            <>
              <SheetHeader className="border-b border-border px-6 py-5">
                <SheetTitle className="text-lg font-bold">{selectedRec.display_name}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {[selectedRec.career_title, selectedRec.company_name].filter(Boolean).join(" · ") || "—"}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <StatusBadge status={selectedRec.current_status} />
                  <MatchBar score={selectedRec.score} showLabel />
                </div>
              </SheetHeader>

              <div className="flex-1 space-y-5 px-6 py-5">
                {/* Why they're a fit */}
                {(selectedRec.match_explanation_text || (selectedRec.fit_signals?.length ?? 0) > 0) && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Why connect
                    </p>
                    {selectedRec.match_explanation_text ? (
                      <p className="text-sm leading-relaxed text-foreground/80 italic">
                        {selectedRec.match_explanation_text}
                      </p>
                    ) : (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {selectedRec.fit_signals!.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <GradientButton
                      size="sm"
                      className={cn(sponsorPrimaryButtonClassName, "h-10")}
                      onClick={() => { openMessage(selectedRec); setSelectedRec(null) }}
                    >
                      Message
                    </GradientButton>
                    {selectedRec.linkedin_url ? (
                      <GradientButton
                        size="sm"
                        variant="outline"
                        className={cn(sponsorOutlineButtonClassName, "h-10 gap-1.5")}
                        onClick={() => postOutreach("linkedin", selectedRec.user_id, { openLinkedInUrl: selectedRec.linkedin_url ?? undefined })}
                      >
                        <Linkedin className="h-3.5 w-3.5" />
                        LinkedIn
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </GradientButton>
                    ) : (
                      <GradientButton
                        size="sm"
                        variant="outline"
                        className={cn(sponsorOutlineButtonClassName, "h-10")}
                        onClick={() => postOutreach("linkedin", selectedRec.user_id)}
                      >
                        Log LinkedIn
                      </GradientButton>
                    )}
                    <GradientButton
                      size="sm"
                      variant="outline"
                      className={cn(sponsorOutlineButtonClassName, "h-10")}
                      onClick={() => postOutreach("met", selectedRec.user_id)}
                    >
                      Mark met
                    </GradientButton>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <Textarea
                    value={panelNotes}
                    onChange={(e) => setPanelNotes(e.target.value)}
                    placeholder="Add notes about this person…"
                    rows={4}
                    className="resize-none"
                  />
                  <GradientButton
                    size="sm"
                    variant="outline"
                    type="button"
                    className={cn(sponsorOutlineButtonClassName, "mt-2")}
                    onClick={() => saveNotes(selectedRec.user_id, panelNotes)}
                  >
                    Save notes
                  </GradientButton>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── MESSAGE DIALOG ───────────────────────────────────────── */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {msgTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            placeholder="Write your message…"
            rows={5}
            className="min-h-[120px]"
          />
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <GradientButton variant="outline" className={sponsorOutlineButtonClassName} onClick={() => setMsgOpen(false)}>
              Cancel
            </GradientButton>
            <GradientButton
              onClick={sendMessage}
              disabled={msgSending || !msgBody.trim()}
              className={cn(sponsorPrimaryButtonClassName, "min-h-11 w-full sm:w-auto")}
            >
              {msgSending ? "Sending…" : "Send"}
            </GradientButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Thin horizontal fill bar representing match strength. */
function MatchBar({ score, showLabel, className }: { score: number; showLabel?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, score))
  const barColor = pct >= 65 ? "bg-primary" : pct >= 35 ? "bg-[var(--chart-3)]" : "bg-muted-foreground/40"
  return (
    <div className={cn("group relative flex items-center gap-1.5", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border sm:w-20">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-xs text-muted-foreground">Match strength</span>}
      {!showLabel && (
        <span className="pointer-events-none absolute -top-7 left-0 hidden whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md group-hover:block">
          Match strength: {score}/100
        </span>
      )}
    </div>
  )
}

/** Small coloured status pill. */
function StatusBadge({ status }: { status: string }) {
  const STATUS_LABELS: Record<string, string> = {
    recommended: "Recommended",
    messaged: "Messaged",
    reached_out: "Reached out",
    replied: "Replied",
    connected: "Connected",
    linkedin: "LinkedIn",
    met: "Met",
    contacted_later: "Following up",
    closed_deal: "Closed",
  }
  const ACTIVE_STATUSES = new Set(["messaged", "replied", "connected", "linkedin", "met", "closed_deal"])
  const label = STATUS_LABELS[status] ?? status
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
        ACTIVE_STATUSES.has(status)
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  )
}
