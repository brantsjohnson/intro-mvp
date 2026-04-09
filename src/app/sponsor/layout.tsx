import { redirect } from "next/navigation"
import { SponsorHeaderNav } from "@/components/sponsor/sponsor-header-nav"
import { createServerComponentClient } from "@/lib/supabase-server"

export default async function SponsorLayout({
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
        <div className="container mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <SponsorHeaderNav />
        </div>
      </header>
      <div
        className="container mx-auto max-w-5xl px-4 py-6 max-sm:px-5 sm:py-8
          max-sm:[&_[data-slot=card-header]]:px-4
          max-sm:[&_[data-slot=card-content]]:px-4
          max-sm:[&_[data-slot=card-footer]]:px-4"
      >
        {children}
      </div>
    </div>
  )
}
