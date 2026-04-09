"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  sponsorDisclosureSummaryClassName,
  sponsorHighlightCardClassName,
  sponsorSectionCardClassName,
} from "@/lib/sponsor-ui"
import { cn } from "@/lib/utils"

/** Matches organizer dashboard semantic fills ([globals.css](globals.css) --chart-* tokens). */
const C_SAGE = "var(--chart-1)"
const C_AMBER = "var(--chart-3)"
const CHART_FILLS = [C_SAGE, "var(--chart-2)", C_AMBER, "var(--chart-4)"] as const

export type SponsorRoiInsightSlice = {
  engaged_leads_total: number
  funnel: { id: string; label: string; count: number }[]
  outreach_by_day: { date: string; count: number }[]
  top_topics: { tag: string; count: number }[]
  qualified_leads?: number
  strong_fits?: number
  potential_deals_low?: number
  potential_deals_high?: number
  top_reason_tags?: string[]
  top_industries?: string[]
}

export type IntentRow = { key: string; label: string; count: number }

function chartTooltipProps() {
  return {
    contentStyle: {
      borderRadius: 8,
      border: "1px solid hsl(var(--border))",
      background: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      fontSize: 12,
    },
  }
}

/** Pipeline / lead-status funnel — vertical bars (used on Event insights and My outreach). */
export function SponsorPipelineBarChart({
  funnel,
  totalAttendees,
  className,
}: {
  funnel: { id: string; label: string; count: number }[]
  totalAttendees?: number
  className?: string
}) {
  const data = funnel.map((f) => ({
    name: f.label,
    count: f.count,
  }))
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-8 text-center">No pipeline data yet.</p>
    )
  }
  return (
    <div className={cn("w-full", className)}>
      <div className="h-[280px] min-h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 24, right: 8, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={72} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v: number) => [v, "Count"]} labelFormatter={(l) => String(l)} {...chartTooltipProps()} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_FILLS[i % CHART_FILLS.length]!} />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {totalAttendees != null && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Out of {totalAttendees.toLocaleString()} attendees
        </p>
      )}
    </div>
  )
}

/** Outreach actions per day — vertical bars (My outreach). */
export function SponsorOutreachByDayChart({
  outreachByDay,
  className,
}: {
  outreachByDay: { date: string; count: number }[]
  className?: string
}) {
  if (outreachByDay.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-8 text-center">No actions yet.</p>
    )
  }
  const data = outreachByDay.map((d) => ({ name: d.date, count: d.count }))
  return (
    <div className={cn("h-[260px] w-full min-h-[180px]", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip formatter={(v: number) => [v, "Actions"]} {...chartTooltipProps()} />
          <Bar dataKey="count" fill={C_AMBER} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="count"
              position="top"
              formatter={(v: number) => (v === 0 ? "" : v)}
              style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Standalone audience intent horizontal bar chart — used in the audience overview section. */
export function SponsorAudienceIntentChart({
  connectionTypes,
  totalAttendees,
  profileReady,
}: {
  connectionTypes: IntentRow[]
  totalAttendees: number
  profileReady: boolean
}) {
  void totalAttendees
  void profileReady
  const intentRows = connectionTypes.map((t) => ({ label: t.label, count: t.count }))
  if (intentRows.length === 0) {
    return <p className="text-xs text-muted-foreground py-6">No intent data yet.</p>
  }
  return (
    <div
      className="w-full min-h-[200px]"
      style={{ height: Math.min(420, 28 * intentRows.length + 80) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={[...intentRows].reverse()}
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 10 }} interval={0} />
          <Tooltip formatter={(v: number) => [v, "Attendees"]} {...chartTooltipProps()} />
          <Bar dataKey="count" fill={C_AMBER} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function buildOpportunityNarrative(input: {
  profileReady: boolean
  totalAttendees: number
  qualifiedLeads: number
  topIndustries: string[]
  topReasonTags: string[]
}): string {
  const { profileReady, totalAttendees, qualifiedLeads, topIndustries, topReasonTags } =
    input
  if (!profileReady) {
    return "Add your offering and ideal customer under Reach out so we can estimate how this audience lines up with what you sell."
  }
  if (totalAttendees === 0) {
    return "No non-sponsor attendees are recorded for this event yet."
  }
  if (qualifiedLeads === 0) {
    return "No attendees met the fit threshold yet for this event. Try refining your ideal customer or offering."
  }
  const industryPhrase =
    topIndustries.length > 0 ? topIndustries.join(" and ") : "various backgrounds"
  const reasonPhrase =
    topReasonTags.length > 0
      ? topReasonTags.join(", ").toLowerCase()
      : "needs aligned with your offering"
  return `${qualifiedLeads} attendee${qualifiedLeads === 1 ? "" : "s"} at this event matched your target profile — primarily people connected to ${industryPhrase}, with signals around ${reasonPhrase}.`
}

export function SponsorInsightsTab({
  roiLoading,
  roi,
  insightsLoading,
  connectionTypes,
  totalAttendees,
  profileReady,
}: {
  roiLoading: boolean
  roi: SponsorRoiInsightSlice | null
  insightsLoading: boolean
  connectionTypes: IntentRow[]
  totalAttendees: number
  profileReady: boolean
}) {
  const funnel = roi?.funnel ?? []
  const qualifiedLeads = roi?.qualified_leads ?? 0
  const strongFits = roi?.strong_fits ?? 0
  const dealsLow = roi?.potential_deals_low ?? 0
  const dealsHigh = roi?.potential_deals_high ?? 0
  const topIndustries = roi?.top_industries ?? []
  const topReasonTags = roi?.top_reason_tags ?? []

  const narrative = buildOpportunityNarrative({
    profileReady,
    totalAttendees,
    qualifiedLeads,
    topIndustries,
    topReasonTags: topReasonTags,
  })

  const intentRows = connectionTypes.map((t) => ({ label: t.label, count: t.count }))

  return (
    <div className="space-y-6">
      <Card className={sponsorHighlightCardClassName}>
        <CardHeader>
          <CardTitle className="text-base">Opportunity at this event</CardTitle>
          <p className="text-xs text-muted-foreground">
            Based on attendee profiles and your offering (conservative estimate).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {roiLoading && !roi ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="rounded-xl border border-border/80 shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground text-xs">Qualified leads (fit ≥ 30)</p>
                    <p className="text-2xl font-semibold tabular-nums">{qualifiedLeads}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border border-border/80 shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground text-xs">Strong fits (fit ≥ 60)</p>
                    <p className="text-2xl font-semibold tabular-nums">{strongFits}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border border-border/80 shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground text-xs">Potential deals (range)</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {strongFits === 0 ? "0" : `${dealsLow}–${dealsHigh}`}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      From strong fits; not a guarantee of revenue.
                    </p>
                  </CardContent>
                </Card>
              </div>
              <p className="text-sm text-foreground/90">{narrative}</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className={sponsorSectionCardClassName}>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
          <p className="text-xs text-muted-foreground">
            Where each recommended contact sits today.
          </p>
        </CardHeader>
        <CardContent>
          {roiLoading && !roi ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Loading…</p>
          ) : (
            <SponsorPipelineBarChart funnel={funnel} />
          )}
        </CardContent>
      </Card>

      <details className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <summary
          className={cn(
            sponsorDisclosureSummaryClassName,
            "mx-3 my-3 flex items-center gap-2 px-4 py-3 text-left",
          )}
        >
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Audience intent</span>
          <span className="text-xs font-normal text-muted-foreground">
            — what this audience said they were looking for
          </span>
        </summary>
        <div className="border-t px-4 pb-4 pt-2">
          {insightsLoading ? (
            <p className="text-xs text-muted-foreground py-6">Loading…</p>
          ) : intentRows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6">No intent data yet.</p>
          ) : (
            <div
              className="w-full min-h-[200px]"
              style={{ height: Math.min(420, 28 * intentRows.length + 80) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[...intentRows].reverse()}
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 10 }} interval={0} />
                  <Tooltip formatter={(v: number) => [v, "Attendees"]} {...chartTooltipProps()} />
                  <Bar dataKey="count" fill={C_AMBER} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
