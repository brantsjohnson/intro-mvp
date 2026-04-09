import Link from "next/link"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchSponsorEventSummariesForUser } from "@/lib/sponsor-auth"
import { createServerComponentClient } from "@/lib/supabase-server"
import { sponsorEventCardClassName } from "@/lib/sponsor-ui"
import { cn } from "@/lib/utils"
import { Calendar, MapPin } from "lucide-react"

export default async function SponsorHomePage() {
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth")
  }

  const events = await fetchSponsorEventSummariesForUser(user.id)

  if (events.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Your sponsored events</h1>
        <Card className="rounded-2xl border-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle>No sponsor access yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              You are not listed as a sponsor for any event. A platform admin can mark your
              attendance as a sponsor from the event&apos;s admin page (Sponsors card).
            </p>
            <p className="text-xs">
              After you join an event as an attendee, an admin can enable sponsor portal access
              without changing your attendee profile.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your sponsored events</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select an event for opportunity signals and your AI matches (read-only).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((e) => (
          <Link key={e.event_id} href={`/sponsor/event/${e.event_id}`}>
            <Card className={cn(sponsorEventCardClassName, "cursor-pointer")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{e.event_name}</CardTitle>
                <p className="font-mono text-xs text-muted-foreground">{e.event_code}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {e.event_location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{e.event_location}</span>
                  </div>
                )}
                {e.event_starts_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>{new Date(e.event_starts_at).toLocaleString()}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
