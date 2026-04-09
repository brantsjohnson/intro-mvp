/**
 * Shared visual language for the sponsor portal (matches app `--primary` sage #72A557, pill controls).
 * Used by layout, /sponsor, and /sponsor/event/[eventId].
 */

/** Header / "Back" links — current section. */
export const sponsorNavPillActive =
  "inline-flex items-center rounded-full border border-primary bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90"

/** Header / secondary nav — not the active portal section. */
export const sponsorNavPillInactive =
  "inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground"

/** Event picker cards on /sponsor. */
export const sponsorEventCardClassName =
  "h-full rounded-2xl border-2 border-border bg-card transition-all hover:border-primary/50 hover:shadow-md"

/** Primary actions (save, send, message) — overrides GradientButton radius. */
export const sponsorPrimaryButtonClassName =
  "!rounded-full border border-primary bg-primary !text-primary-foreground shadow-sm hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"

/** Secondary / outline actions. */
export const sponsorOutlineButtonClassName =
  "!rounded-full border border-border bg-card !shadow-sm hover:border-primary/40 hover:bg-muted/60"

/** Disclosure / notes row — reads as a tappable chip. */
export const sponsorDisclosureSummaryClassName =
  "cursor-pointer list-none rounded-full border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:border-primary/35 hover:bg-muted/50 [&::-webkit-details-marker]:hidden"

/** Recommendation list row. */
export const sponsorRecRowClassName =
  "space-y-4 rounded-2xl border border-border bg-muted/20 p-3 transition-colors hover:border-primary/30 sm:bg-transparent sm:p-4"

/** Default shell for section cards (profile, people list, outreach panels). */
export const sponsorSectionCardClassName =
  "rounded-2xl border border-border bg-card shadow-sm"

/** KPI metric cards — muted base; deal card uses border-2 border-border for emphasis. */
export const sponsorKpiCardClassName =
  "rounded-2xl border border-border bg-card p-5 shadow-sm"

/** Prominent KPI card for the primary deal/revenue metric. */
export const sponsorKpiHeroClassName =
  "rounded-2xl border-2 border-border bg-card p-5 shadow-md"

/** Highlight / feature card — neutral, no colour tint. */
export const sponsorHighlightCardClassName =
  "rounded-2xl border border-border bg-card shadow-sm"
