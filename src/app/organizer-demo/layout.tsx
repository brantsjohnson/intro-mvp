import Link from "next/link"

export default function OrganizerDemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link
              href="/organizer-demo"
              className="text-sm font-semibold tracking-tight hover:text-primary shrink-0"
            >
              Organizer demo
            </Link>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200 shrink-0">
              Fictional data
            </span>
            <Link
              href="/home?demo=1"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline truncate"
            >
              Attendee demo
            </Link>
            <Link
              href="/auth"
              className="text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
              Sign in
            </Link>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block shrink-0">
            Read-only preview
          </p>
        </div>
      </header>
      <div className="container mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  )
}
