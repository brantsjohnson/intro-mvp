import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerComponentClient } from "@/lib/supabase-server"

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth")
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/organizer"
              className="text-sm font-semibold tracking-tight hover:text-primary"
            >
              Organizer
            </Link>
            <Link
              href="/home"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to app
            </Link>
          </div>
          <p className="truncate text-xs text-muted-foreground max-w-[50%] text-right">
            Read-only dashboard
          </p>
        </div>
      </header>
      <div className="container mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  )
}
