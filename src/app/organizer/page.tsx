import Link from "next/link"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchOrganizerEventSummariesForUser } from "@/lib/organizer-auth"
import { createServerComponentClient } from "@/lib/supabase-server"
import { Calendar, MapPin } from "lucide-react"

export default async function OrganizerHomePage() {
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth")
  }

  const events = await fetchOrganizerEventSummariesForUser(user.id)

  if (events.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Your events</h1>
        <Card>
          <CardHeader>
            <CardTitle>No organizer access yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              You do not have any events assigned. An administrator must add you to{" "}
              <code className="rounded bg-muted px-1">event_organizers</code> or{" "}
              <code className="rounded bg-muted px-1">organizer_memberships</code>{" "}
              for an organization linked to your events.
            </p>
            <p className="text-xs">
              After running migration{" "}
              <code className="rounded bg-muted px-1">
                20260408_phase_b_organizer_access.sql
              </code>
              , insert rows via Supabase SQL or Table Editor.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your events</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select an event for attendee and match insights (read-only).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((e) => (
          <Link key={e.event_id} href={`/organizer/event/${e.event_id}`}>
            <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{e.event_name}</CardTitle>
                <p className="font-mono text-xs text-muted-foreground">
                  {e.event_code}
                </p>
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
