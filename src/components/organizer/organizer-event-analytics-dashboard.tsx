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

/**
 * Per-chart semantic fills pulled from globals.css tokens.
 * Sage   = attendance / goals  (brand, who showed up & why)
 * Wine   = job roles           (who people are)
 * Amber  = connection activity (what happened)
 * Navy   = algorithmic quality (suggestion scoring)
 */
const C_SAGE  = "var(--chart-1)" // #72A557
const C_WINE  = "var(--chart-2)" // #99424E
const C_AMBER = "var(--chart-3)" // #c4782a
const C_NAVY  = "var(--chart-4)" // #1b3a6b

/** Used by "How they connected" bubbles — just 3 well-spaced hues. */
const BUBBLE_FILLS = [C_SAGE, C_AMBER, C_WINE] as const

function humanizeKeySegment(k: string): string {
  return k
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

// ─── Bubble chart ────────────────────────────────────────────────────────────

type BubbleChartItem = { name: string; value: number; key: string }

interface BubbleData {
  x: number; y: number; r: number
  name: string; value: number; key: string; color: string
}

function wrapBubbleText(text: string, maxWidth: number, fontSize: number): string[] {
  const approxCharW = fontSize * 0.56
  const maxChars = Math.max(1, Math.floor(maxWidth / approxCharW))
  const words = text.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (test.length <= maxChars) {
      cur = test
    } else {
      if (cur) lines.push(cur)
      cur = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

function packBubbles(items: BubbleChartItem[], W: number, H: number): BubbleData[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const n = sorted.length
  const maxVal = Math.max(sorted[0].value, 1)
  const pad = 8

  // Initial radii — intentionally generous; we scale down if they don't fit
  const rawMaxR = Math.min(W, H) / (n === 1 ? 2.2 : n === 2 ? 3.0 : 1.9 + n * 0.38) - pad
  const minR = Math.max(22, rawMaxR * 0.36)
  let radii = sorted.map(item =>
    Math.round(minR + Math.sqrt(item.value / maxVal) * (rawMaxR - minR)),
  )

  const cx = W / 2, cy = H / 2
  let positions: { x: number; y: number }[]

  if (n === 1) {
    positions = [{ x: cx, y: cy }]
  } else if (n === 2) {
    const gap = 10
    const totalNeeded = radii[0] + radii[1] + gap
    const available = W - 2 * pad
    if (totalNeeded > available) {
      const scale = available / totalNeeded
      radii = radii.map(r => Math.max(minR, Math.round(r * scale)))
    }
    positions = [
      { x: cx - radii[0] / 2 - gap / 2, y: cy },
      { x: cx + radii[1] / 2 + gap / 2, y: cy },
    ]
  } else {
    // Find min orbit radius so adjacent circles don't overlap
    let minOrbit = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const req = (radii[i] + radii[j] + 10) / (2 * Math.sin(Math.PI / n))
      if (req > minOrbit) minOrbit = req
    }
    const maxOrbit = Math.min(W, H) / 2 - Math.max(...radii) - pad

    // If bubbles don't fit, scale radii down proportionally
    if (minOrbit > maxOrbit && maxOrbit > 0) {
      const scale = maxOrbit / minOrbit
      radii = radii.map(r => Math.max(minR, Math.round(r * scale)))
      // Recompute minOrbit after scaling
      minOrbit = 0
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const req = (radii[i] + radii[j] + 10) / (2 * Math.sin(Math.PI / n))
        if (req > minOrbit) minOrbit = req
      }
    }

    const orbit = Math.max(0, Math.min(minOrbit, Math.min(W, H) / 2 - Math.max(...radii) - pad))
    const startAngle = n % 2 === 1 ? -Math.PI / 2 : 0
    positions = radii.map((_, i) => {
      const angle = startAngle + (2 * Math.PI * i) / n
      return { x: cx + orbit * Math.cos(angle), y: cy + orbit * Math.sin(angle) }
    })
  }

  return sorted.map((item, i) => ({
    x: positions[i].x, y: positions[i].y, r: radii[i],
    name: item.name, value: item.value, key: item.key,
                    color: BUBBLE_FILLS[i % BUBBLE_FILLS.length] as string,
  }))
}

function CategoryBubbleChart({ items }: { items: BubbleChartItem[] }) {
  // Use a generous computation space; viewBox is tightened to the actual cluster
  const SPACE = 320
  const bubbles = useMemo(() => packBubbles(items, SPACE, SPACE), [items])
  if (bubbles.length === 0) return null

  // Tight bounding box so the SVG fills its container rather than leaving dead space
  const margin = 6
  const minX = Math.min(...bubbles.map(b => b.x - b.r)) - margin
  const maxX = Math.max(...bubbles.map(b => b.x + b.r)) + margin
  const minY = Math.min(...bubbles.map(b => b.y - b.r)) - margin
  const maxY = Math.max(...bubbles.map(b => b.y + b.r)) + margin
  const vbW = maxX - minX
  const vbH = maxY - minY

  return (
    <div className="flex flex-col h-full gap-2">
      <svg
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        className="w-full flex-1 min-h-0"
        preserveAspectRatio="xMidYMid meet"
      >
        {bubbles.map((b) => {
          const fs = Math.min(11, Math.max(8, b.r * 0.22))
          const valFs = Math.min(15, Math.max(10, b.r * 0.30))
          const lines = b.r >= 28 ? wrapBubbleText(b.name, b.r * 1.7, fs) : []
          const lineH = fs * 1.3
          const totalH = lines.length * lineH + (lines.length > 0 ? 4 + valFs : valFs)
          const topY = b.y - totalH / 2
          return (
            <g key={b.key}>
              <title>{b.name}: {b.value}</title>
              <circle
                cx={b.x} cy={b.y} r={b.r}
                fill={b.color} stroke="rgba(58,56,53,0.12)" strokeWidth={1.5}
              />
              {lines.map((line, li) => (
                <text
                  key={li} x={b.x} y={topY + li * lineH + lineH / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize={fs}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {line}
                </text>
              ))}
              <text
                x={b.x}
                y={topY + lines.length * lineH + (lines.length > 0 ? 4 : 0) + valFs / 2}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize={valFs} fontWeight={700}
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {b.value}
              </text>
            </g>
          )
        })}
      </svg>
      {/* Legend row */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 pb-1 shrink-0">
        {bubbles.map((b) => (
          <div key={b.key} className="flex items-center gap-1 text-[10px] text-muted-foreground leading-tight min-w-0">
            <span className="inline-block shrink-0 rounded-full w-2 h-2" style={{ background: b.color }} />
            <span className="truncate max-w-[96px]">{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
    <div className="overflow-x-auto rounded-md border border-border outline-surface-inset">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="sticky top-0 z-[1] bg-muted/80 backdrop-blur-sm">
          <tr className="border-b border-border">
            <th className="p-2 pl-3 font-medium">Name</th>
            <th className="p-2 font-medium">Email</th>
            <th className="p-2 font-medium">Intent</th>
            <th className="p-2 font-medium">Job title</th>
            <th className="p-2 pr-3 font-medium">Industries</th>
            <th className="p-2 pr-3 font-medium text-right">Conn.</th>
            <th className="p-2 pr-3 font-medium">Signup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-b border-border/70">
              <td className="p-2 pl-3 align-top">{r.display_name}</td>
              <td className="p-2 align-top text-muted-foreground break-words max-w-[min(200px,40vw)]">
                {r.email ?? "—"}
              </td>
              <td className="p-2 align-top max-w-[160px] break-words">
                {r.intent_labels.length ? r.intent_labels.join(", ") : "—"}
              </td>
              <td className="p-2 align-top max-w-[140px] break-words">
                {r.career_title?.trim()
                  ? r.career_title
                  : r.career_role_label
                    ? `(${r.career_role_label})`
                    : "—"}
              </td>
              <td className="p-2 pr-3 align-top min-w-[120px] max-w-[220px] break-words whitespace-normal">
                {r.industry_tags.length
                  ? r.industry_tags.slice(0, 4).join(", ")
                  : "—"}
              </td>
              <td className="p-2 pr-3 align-top text-right tabular-nums">
                {r.connection_degree}
              </td>
              <td className="p-2 pr-3 align-top">
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
  showEventHeader = true,
  onEventMetaChange,
  /** When set, skips API fetch (e.g. public `/organizer-demo` with fictional data). */
  demoAnalytics = null,
}: {
  eventId: string
  onForbidden: () => void
  showEventHeader?: boolean
  onEventMetaChange?: (meta: {
    eventName: string | null
    eventStartsAt: string | null
    eventEndsAt: string | null
    eventCode: string | null
  }) => void
  demoAnalytics?: OrganizerEventAnalytics | null
}) {
  const [analytics, setAnalytics] = useState<OrganizerEventAnalytics | null>(
    () => demoAnalytics ?? null,
  )
  const [loading, setLoading] = useState(!demoAnalytics)
  const [drilldown, setDrilldown] = useState<DrilldownState>(null)

  const load = useCallback(async () => {
    if (demoAnalytics) {
      setAnalytics(demoAnalytics)
      setLoading(false)
      return
    }
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
  }, [eventId, onForbidden, demoAnalytics])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    onEventMetaChange?.(
      analytics
        ? {
            eventName: analytics.event_name ?? null,
            eventStartsAt: analytics.event_starts_at ?? null,
            eventEndsAt: analytics.event_ends_at ?? null,
            eventCode: analytics.event_code ?? null,
          }
        : {
            eventName: null,
            eventStartsAt: null,
            eventEndsAt: null,
            eventCode: null,
          },
    )
  }, [analytics, onEventMetaChange])

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
      case "role": {
        const rk = drilldown.filterKey
        if (!rk) return rows
        return rows.filter((r) => r.career_role_key === rk)
      }
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
      case "role": {
        const key = drilldown.filterKey
        const label =
          analytics.career_role_counts.find((x) => x.key === key)?.label ??
          (key ? humanizeKeySegment(key) : "")
        return {
          title: key ? `Job function: ${label}` : "Job functions",
          subtitle:
            "From profile job titles, grouped into common functions. One bucket per guest.",
        }
      }
      case "method":
        return {
          title: "How people connected",
          subtitle: "What started each connection, like QR or the directory.",
        }
      case "histogram": {
        const avg = analytics.avg_match_score
        return {
          title: "Match quality breakdown",
          subtitle: `Avg. ${avg !== null ? `${Math.round(avg * 100)}%` : "—"} — full score distribution across all suggested introductions.`,
        }
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

  const roleChartHeightPx = useMemo(() => {
    const n = analytics?.career_role_counts?.length ?? 0
    return Math.min(520, Math.max(260, n * 34 + 80))
  }, [analytics?.career_role_counts?.length])

  // Bubble chart items — computed before any early returns so hooks stay stable
  const methodBubbleItems = useMemo(
    () =>
      (analytics?.connection_method_counts ?? []).map((x) => ({
        name: x.label,
        value: x.count,
        key: x.key,
      })),
    [analytics?.connection_method_counts],
  )

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
          <CardSkeleton className="h-72 lg:col-span-3" />
          <CardSkeleton className="h-72 lg:col-span-3" />
          <CardSkeleton className="h-72 lg:col-span-6" />
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

  const { kpis, funnel, intent_counts, industry_top, career_role_counts } =
    analytics
  const { connection_method_counts, match_score_histogram, connection_depth, avg_match_score } =
    analytics

  const hasAttendees = kpis.total_attendees > 0
  const funnelBase = funnel[0]?.count ?? 0

  return (
    <>
      <div className="space-y-6">
        {showEventHeader ? (
          <div className="rounded-xl border border-border bg-card/40 shadow-sm outline-surface-inset-comfortable">
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
              <span className="min-w-0 text-[11px]">
                <span className="text-muted-foreground">Join code </span>
                <span className="font-mono font-semibold tracking-wide text-foreground/90">
                  {analytics.event_code?.trim() || "—"}
                </span>
              </span>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground border-t border-border/60 pt-3">
              Totals follow your guest list and connections.
            </p>
          </div>
        ) : null}

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
            subtitle="Goals picked at signup — guests can pick multiple"
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
                    fill={C_NAVY}
                    onClick={(_, idx) => {
                      const row = [...intent_counts].reverse()[idx] as
                        | (typeof intent_counts)[0]
                        | undefined
                      if (row) openDrilldown({ kind: "intent", filterKey: row.key })
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
          <ChartCard
            title="Average connection strength"
            subtitle="Score of suggested introductions — higher fits better"
            className="lg:col-span-3"
            onClick={() => openDrilldown({ kind: "histogram" })}
            empty={avg_match_score === null}
          >
            <div className="flex h-[300px] flex-col items-center justify-center gap-2 px-2">
              <span
                className="font-bold tabular-nums leading-none"
                style={{ fontSize: "clamp(2.25rem, 8vw, 3.25rem)", color: C_NAVY }}
              >
                {avg_match_score !== null
                  ? `${Math.round(avg_match_score * 100)}%`
                  : "—"}
              </span>
              <div className="w-full max-w-[140px] px-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((avg_match_score ?? 0) * 100)}%`,
                      background: C_NAVY,
                    }}
                  />
                </div>
              </div>
              <p className="text-center text-[10px] text-muted-foreground leading-snug max-w-[11rem]">
                Mean match quality across system-suggested links
              </p>
            </div>
          </ChartCard>

          <ChartCard
            title="How they connected"
            subtitle="What started each link"
            className="lg:col-span-3"
            onClick={() => openDrilldown({ kind: "method" })}
            empty={!hasAttendees || methodBubbleItems.length === 0}
          >
            <div className="h-[300px] w-full">
              <CategoryBubbleChart items={methodBubbleItems} />
            </div>
          </ChartCard>

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
                    fill={C_SAGE}
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
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
          <ChartCard
            title="Roles"
            subtitle="Job function at the event"
            className="lg:col-span-6"
            ignoreClicksInsideChart
            onClick={() => openDrilldown({ kind: "role" })}
            empty={!hasAttendees || career_role_counts.length === 0}
          >
            <div
              className="w-full"
              style={{ height: roleChartHeightPx }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[...career_role_counts].reverse()}
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={132}
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar
                    dataKey="count"
                    radius={[0, 6, 6, 0]}
                    fill={C_WINE}
                    onClick={(_, idx) => {
                      const row = [...career_role_counts].reverse()[idx] as
                        | (typeof career_role_counts)[0]
                        | undefined
                      if (row) {
                        openDrilldown({ kind: "role", filterKey: row.key })
                      }
                    }}
                  />
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
                    fill={C_AMBER}
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
          <div className="mb-4 overflow-hidden rounded-md border border-border outline-surface-inset">
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
                  <Bar dataKey="count" fill={C_NAVY} radius={[0, 6, 6, 0]} />
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
                  <Bar dataKey="count" fill={C_SAGE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

        {drilldown?.kind === "method" && (
          <div className="mb-4 overflow-hidden rounded-md border border-border outline-surface-inset">
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
                <Bar dataKey="count" fill={C_NAVY} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 overflow-hidden rounded-md border border-border outline-surface-inset">
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
                  <Bar dataKey="count" fill={C_AMBER} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

        {drilldown?.kind === "role" && (
          <>
            {!drilldown.filterKey ? (
              <div className="mb-4 overflow-hidden rounded-md border border-border outline-surface-inset">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="p-2 text-left">Job function</th>
                      <th className="p-2 text-right">Guests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {career_role_counts.map((r) => (
                      <tr key={r.key} className="border-t border-border/70">
                        <td className="p-2">{r.label}</td>
                        <td className="p-2 text-right tabular-nums">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
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
            <div className="overflow-hidden rounded-md border border-border outline-surface-inset">
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
          <InsightsTable rows={filteredInsights} />
        )}
      </AnalyticsSlideOver>
    </>
  )
}
