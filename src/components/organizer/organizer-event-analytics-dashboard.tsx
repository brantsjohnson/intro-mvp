"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, parseISO } from "date-fns"

import { AnalyticsSlideOver } from "@/components/organizer/analytics-slide-over"
import { Card, CardContent } from "@/components/ui/card"
import { GradientButton } from "@/components/ui/gradient-button"
import type { OrganizerEventAnalytics } from "@/lib/organizer-metrics"
import { cn } from "@/lib/utils"

const CHART_FILL = "#72A557"
const PIE_COLORS = ["#72A557", "#5a8a46", "#8fb87a", "#4a7a3d", "#a8c98f", "#3d6634"]

function formatEventWhen(iso: string | null): string | null {
  if (!iso) return null
  try {
    return format(parseISO(iso), "MMM d, yyyy h:mm a")
  } catch {
    return iso
  }
}

type DrilldownState =
  | null
  | {
      kind:
        | "kpi_attendees"
        | "kpi_connections"
        | "kpi_matched"
        | "kpi_avg_conn"
        | "funnel"
        | "intent"
        | "industry"
        | "role"
        | "method"
        | "histogram"
        | "depth"
      filterKey?: string
    }

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/40 animate-pulse",
        className,
      )}
    />
  )
}

function ChartCard({
  title,
  subtitle,
  onClick,
  ignoreClicksInsideChart,
  children,
  className,
  empty,
}: {
  title: string
  subtitle?: string
  onClick?: () => void
  /** When true, clicks on the Recharts SVG won't fire the card onClick (bar/slice handlers only). */
  ignoreClicksInsideChart?: boolean
  children: ReactNode
  className?: string
  empty?: boolean
}) {
  const handleCardClick = (e: MouseEvent) => {
    if (!onClick) return
    if (
      ignoreClicksInsideChart &&
      (e.target as HTMLElement).closest(".recharts-wrapper")
    ) {
      return
    }
    onClick()
  }

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-sm",
        onClick && "cursor-pointer transition-colors hover:border-primary/40",
        className,
      )}
      onClick={handleCardClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4 pt-4">
        <div className="mb-3 flex flex-col gap-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground/90">{subtitle}</p>
          ) : null}
        </div>
        {empty ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data for this event yet.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function KpiCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  onClick?: () => void
}) {
  return (
    <Card
      className={cn(
        "shadow-sm transition-colors",
        onClick && "cursor-pointer hover:border-primary/40",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function InsightsTable({
  rows,
}: {
  rows: OrganizerEventAnalytics["attendee_insights"]
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No guests in this view.
      </p>
    )
  }
  return (
    <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr className="border-b border-border">
            <th className="p-2 font-medium">Name</th>
            <th className="p-2 font-medium">Email</th>
            <th className="p-2 font-medium">Intent</th>
            <th className="p-2 font-medium">Industries</th>
            <th className="p-2 font-medium text-right">Conn.</th>
            <th className="p-2 font-medium">Signup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-b border-border/70">
              <td className="p-2 align-top">{r.display_name}</td>
              <td className="p-2 align-top text-muted-foreground">
                {r.email ?? "—"}
              </td>
              <td className="p-2 align-top max-w-[140px]">
                {r.intent_labels.length ? r.intent_labels.join(", ") : "—"}
              </td>
              <td className="p-2 align-top max-w-[120px]">
                {r.industry_tags.length
                  ? r.industry_tags.slice(0, 4).join(", ")
                  : "—"}
              </td>
              <td className="p-2 align-top text-right tabular-nums">
                {r.connection_degree}
              </td>
              <td className="p-2 align-top">
                {r.onboarding_completed ? "Yes" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OrganizerEventAnalyticsDashboard({
  eventId,
  onForbidden,
}: {
  eventId: string
  onForbidden: () => void
}) {
  const [analytics, setAnalytics] = useState<OrganizerEventAnalytics | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [drilldown, setDrilldown] = useState<DrilldownState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `/api/organizer/event-analytics?eventId=${encodeURIComponent(eventId)}`,
    )
    if (res.status === 403) {
      onForbidden()
      setLoading(false)
      return
    }
    if (!res.ok) {
      setAnalytics(null)
      setLoading(false)
      return
    }
    const data = (await res.json()) as OrganizerEventAnalytics
    setAnalytics(data)
    setLoading(false)
  }, [eventId, onForbidden])

  useEffect(() => {
    load()
  }, [load])

  const openDrilldown = useCallback((next: DrilldownState) => {
    setDrilldown(next)
  }, [])

  const closeDrilldown = useCallback(() => setDrilldown(null), [])

  const filteredInsights = useMemo(() => {
    if (!analytics || !drilldown) return []
    const rows = analytics.attendee_insights
    switch (drilldown.kind) {
      case "kpi_attendees":
      case "funnel":
        return rows
      case "kpi_matched":
        return rows.filter((r) => r.had_system_match)
      case "intent": {
        const intentKey = drilldown.filterKey
        if (!intentKey) return rows
        return rows.filter((r) => r.intents.includes(intentKey))
      }
      case "industry":
        if (!drilldown.filterKey) return rows
        return rows.filter((r) =>
          r.industry_tags.includes(drilldown.filterKey!.toLowerCase()),
        )
      case "role":
        return rows
      case "depth":
        if (!drilldown.filterKey) return rows
        const b = drilldown.filterKey
        return rows.filter((r) => {
          const d = r.connection_degree
          if (b === "0") return d === 0
          if (b === "1") return d === 1
          if (b === "2") return d === 2
          if (b === "3") return d === 3
          if (b === "4") return d === 4
          if (b === "5+") return d >= 5
          return true
        })
      case "kpi_connections":
      case "kpi_avg_conn":
      case "method":
      case "histogram":
        return rows
      default:
        return rows
    }
  }, [analytics, drilldown])

  const drilldownMeta = useMemo(() => {
    if (!drilldown || !analytics) return { title: "", subtitle: "" }
    const d = analytics.definitions
    switch (drilldown.kind) {
      case "kpi_attendees":
        return {
          title: "All guests",
          subtitle: "Everyone on the list for this event.",
        }
      case "kpi_connections":
        return {
          title: "Total connections",
          subtitle: d.total_connections,
        }
      case "kpi_matched":
        return {
          title: "Guests with suggestions",
          subtitle: d.pct_attendees_matched,
        }
      case "kpi_avg_conn":
        return {
          title: "Connections per guest",
          subtitle: d.avg_connections_per_attendee,
        }
      case "funnel":
        return {
          title: "Funnel",
          subtitle: d.funnel_steps,
        }
      case "intent": {
        const label =
          analytics.intent_counts.find((x) => x.key === drilldown.filterKey)
            ?.label ?? "Connection intents"
        return {
          title: drilldown.filterKey ? label : "Why they came",
          subtitle:
            "From signup. One guest can pick more than one goal.",
        }
      }
      case "industry": {
        const tag = drilldown.filterKey
        const label =
          analytics.industry_top.find((x) => x.tag === tag)?.label ??
          (tag ? tag : "Industries")
        return {
          title: tag ? `Industry: ${label}` : "Top industries",
          subtitle: "From profiles. Each guest counted once per topic.",
        }
      }
      case "role":
        return {
          title: "Roles",
          subtitle: "Based on goals guests picked at signup.",
        }
      case "method":
        return {
          title: "How people connected",
          subtitle: "What started each connection, like QR or the directory.",
        }
      case "histogram":
        return {
          title: "Suggestion strength",
          subtitle:
            "Higher means a closer fit. Only suggested introductions.",
        }
      case "depth":
        return {
          title: "Connections per guest",
          subtitle: "How many connections each guest had.",
        }
      default:
        return { title: "", subtitle: "" }
    }
  }, [drilldown, analytics])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardSkeleton className="h-80 lg:col-span-7" />
          <CardSkeleton className="h-80 lg:col-span-5" />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardSkeleton className="h-72 lg:col-span-6" />
          <CardSkeleton className="h-72 lg:col-span-3" />
          <CardSkeleton className="h-72 lg:col-span-3" />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardSkeleton className="h-72 lg:col-span-6" />
          <CardSkeleton className="h-72 lg:col-span-6" />
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Could not load analytics for this event.
        </CardContent>
      </Card>
    )
  }

  const { kpis, funnel, intent_counts, industry_top, role_intent_counts } =
    analytics
  const { connection_method_counts, match_score_histogram, connection_depth } =
    analytics

  const hasAttendees = kpis.total_attendees > 0
  const funnelBase = funnel[0]?.count ?? 0

  const donutDataRole = role_intent_counts.map((x) => ({
    name: x.label,
    value: x.count,
    key: x.key,
  }))

  const donutDataMethod = connection_method_counts.map((x) => ({
    name: x.label,
    value: x.count,
    key: x.key,
  }))

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card/40 px-4 py-4 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight">
            {analytics.event_name?.trim() || "Event"}
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {formatEventWhen(analytics.event_starts_at) ? (
              <span>Starts {formatEventWhen(analytics.event_starts_at)}</span>
            ) : null}
            {formatEventWhen(analytics.event_ends_at) ? (
              <span>Ends {formatEventWhen(analytics.event_ends_at)}</span>
            ) : null}
            <span className="font-mono text-[11px] opacity-80">{eventId}</span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground border-t border-border/60 pt-3">
            Totals follow your guest list and connections.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Guests"
            value={String(kpis.total_attendees)}
            hint="On your list"
            onClick={() => openDrilldown({ kind: "kpi_attendees" })}
          />
          <KpiCard
            label="Connections"
            value={String(kpis.total_connections)}
            hint="Not counting open requests"
            onClick={() => openDrilldown({ kind: "kpi_connections" })}
          />
          <KpiCard
            label="With suggestions"
            value={
              kpis.pct_attendees_matched != null
                ? `${kpis.pct_attendees_matched}%`
                : "—"
            }
            hint="Share of guests who got an intro idea"
            onClick={() => openDrilldown({ kind: "kpi_matched" })}
          />
          <KpiCard
            label="Avg per guest"
            value={
              kpis.avg_connections_per_attendee != null
                ? String(kpis.avg_connections_per_attendee)
                : "—"
            }
            hint="Connections divided by guests"
            onClick={() => openDrilldown({ kind: "kpi_avg_conn" })}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
          <ChartCard
            title="Funnel"
            className="lg:col-span-7"
            onClick={() => openDrilldown({ kind: "funnel" })}
            empty={!hasAttendees}
          >
            <div className="space-y-3">
              {funnel.map((step) => {
                const pct =
                  funnelBase > 0
                    ? Math.round((step.count / funnelBase) * 1000) / 10
                    : 0
                return (
                  <div key={step.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-foreground/90">
                        {step.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {step.count}{" "}
                        <span className="text-muted-foreground/80">
                          ({pct}% of guests)
                        </span>
                        {step.pct_of_previous != null ? (
                          <span className="ml-2 text-muted-foreground/70">
                            {step.pct_of_previous}% of last step
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="h-9 overflow-hidden rounded-md bg-muted/60">
                      <div
                        className="h-full rounded-md bg-primary transition-all"
                        style={{
                          width: `${funnelBase > 0 ? (step.count / funnelBase) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </ChartCard>

          <ChartCard
            title="Why they came"
            subtitle="Connection goals"
            className="lg:col-span-5"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "intent" })}
            empty={!hasAttendees || intent_counts.length === 0}
          >
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[...intent_counts].reverse()}
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={118}
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 6, 6, 0]}
                    fill={CHART_FILL}
                    onClick={(_, idx) => {
                      const row = [...intent_counts].reverse()[idx] as
                        | (typeof intent_counts)[0]
                        | undefined
                      if (row) {
                        openDrilldown({
                          kind: "intent",
                          filterKey: row.key,
                        })
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
          <ChartCard
            title="Top industries"
            subtitle="In the room"
            className="lg:col-span-6"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "industry" })}
            empty={!hasAttendees || industry_top.length === 0}
          >
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[...industry_top].slice(0, 10).reverse()}
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={100}
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar
                    dataKey="count"
                    radius={[0, 6, 6, 0]}
                    fill={CHART_FILL}
                    onClick={(_, idx) => {
                      const arr = [...industry_top].slice(0, 10).reverse()
                      const row = arr[idx] as
                        | (typeof industry_top)[0]
                        | undefined
                      if (row) {
                        openDrilldown({
                          kind: "industry",
                          filterKey: row.tag,
                        })
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Roles"
            className="lg:col-span-3"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "role" })}
            empty={!hasAttendees || donutDataRole.length === 0}
          >
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutDataRole}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {donutDataRole.map((_, i) => (
                      <Cell
                        key={`r-${i}`}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="How they connected"
            className="lg:col-span-3"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "method" })}
            empty={!hasAttendees || donutDataMethod.length === 0}
          >
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutDataMethod}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {donutDataMethod.map((_, i) => (
                      <Cell
                        key={`m-${i}`}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <ChartCard
            title="Suggestion strength"
            subtitle="Higher fits better"
            className="lg:col-span-6"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "histogram" })}
            empty={
              !hasAttendees ||
              !match_score_histogram.some((b) => b.count > 0)
            }
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={match_score_histogram} margin={{ top: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="bin_label"
                    tick={{ fontSize: 10 }}
                    angle={-15}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" fill={CHART_FILL} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Connection depth"
            subtitle="Per guest"
            className="lg:col-span-6"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "depth" })}
            empty={!hasAttendees}
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={connection_depth} margin={{ top: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar
                    dataKey="count"
                    fill={CHART_FILL}
                    radius={[6, 6, 0, 0]}
                    onClick={(_, idx) => {
                      const row = connection_depth[idx] as
                        | (typeof connection_depth)[0]
                        | undefined
                      if (row) {
                        openDrilldown({
                          kind: "depth",
                          filterKey: row.bucket,
                        })
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Need the full list? Open operational data below.
            </p>
            <GradientButton variant="outline" size="sm" type="button" asChild>
              <a href="#organizer-operational-data">Jump to tables</a>
            </GradientButton>
          </CardContent>
        </Card>
      </div>

      <AnalyticsSlideOver
        open={drilldown != null}
        onOpenChange={(o) => !o && closeDrilldown()}
        title={drilldownMeta.title}
        subtitle={drilldownMeta.subtitle}
      >
        {drilldown?.kind === "funnel" && (
          <div className="mb-4 overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-2 text-left">Step</th>
                  <th className="p-2 text-right">Count</th>
                  <th className="p-2 text-right">% of guests</th>
                  <th className="p-2 text-right">% of last step</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((s) => (
                  <tr key={s.id} className="border-t border-border/70">
                    <td className="p-2">{s.label}</td>
                    <td className="p-2 text-right tabular-nums">{s.count}</td>
                    <td className="p-2 text-right tabular-nums">
                      {funnelBase > 0
                        ? `${Math.round((s.count / funnelBase) * 1000) / 10}%`
                        : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {s.pct_of_previous != null ? `${s.pct_of_previous}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {drilldown?.kind === "intent" &&
          (drilldown.filterKey ? (
            <InsightsTable rows={filteredInsights} />
          ) : (
            <div className="mb-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[...intent_counts].reverse()}
                  margin={{ left: 8, right: 16 }}
                >
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_FILL} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

        {drilldown?.kind === "industry" &&
          (drilldown.filterKey ? (
            <InsightsTable rows={filteredInsights} />
          ) : (
            <div className="mb-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[...industry_top].slice(0, 12).reverse()}
                  margin={{ left: 8, right: 16 }}
                >
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={110}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_FILL} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

        {drilldown?.kind === "method" && (
          <div className="mb-4 overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-2 text-left">Path</th>
                  <th className="p-2 text-right">Connections</th>
                </tr>
              </thead>
              <tbody>
                {connection_method_counts.map((r) => (
                  <tr key={r.key} className="border-t border-border/70">
                    <td className="p-2">{r.label}</td>
                    <td className="p-2 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {drilldown?.kind === "histogram" && (
          <div className="mb-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={match_score_histogram}>
                <XAxis dataKey="bin_label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_FILL} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-left">Range</th>
                    <th className="p-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {match_score_histogram.map((b) => (
                    <tr key={b.bin_label} className="border-t border-border/70">
                      <td className="p-2 tabular-nums">{b.bin_label}</td>
                      <td className="p-2 text-right tabular-nums">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {drilldown?.kind === "depth" &&
          (drilldown.filterKey ? (
            <InsightsTable rows={filteredInsights} />
          ) : (
            <div className="mb-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={connection_depth}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_FILL} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

        {drilldown?.kind === "role" && (
          <>
            <div className="mb-4 overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-right">Attendees</th>
                  </tr>
                </thead>
                <tbody>
                  {role_intent_counts.map((r) => (
                    <tr key={r.key} className="border-t border-border/70">
                      <td className="p-2">{r.label}</td>
                      <td className="p-2 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <InsightsTable rows={filteredInsights} />
          </>
        )}

        {drilldown?.kind === "kpi_attendees" && (
          <InsightsTable rows={filteredInsights} />
        )}

        {drilldown?.kind === "kpi_matched" && (
          <InsightsTable rows={filteredInsights} />
        )}

        {drilldown?.kind === "kpi_connections" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {analytics.definitions.total_connections}
            </p>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-left">Path</th>
                    <th className="p-2 text-right">Connections</th>
                  </tr>
                </thead>
                <tbody>
                  {connection_method_counts.map((r) => (
                    <tr key={r.key} className="border-t border-border/70">
                      <td className="p-2">{r.label}</td>
                      <td className="p-2 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {drilldown?.kind === "kpi_avg_conn" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {analytics.definitions.avg_connections_per_attendee}
            </p>
            <InsightsTable rows={filteredInsights} />
          </div>
        )}
      </AnalyticsSlideOver>
    </>
  )
}
