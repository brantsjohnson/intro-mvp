import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ORGANIZER_DEMO_EVENT_ID,
  ORGANIZER_DEMO_TOTAL_ATTENDEES,
  getOrganizerDemoEventSummary,
} from "@/lib/organizer-demo-data"
import { Calendar, MapPin, Users } from "lucide-react"

export default function OrganizerDemoHomePage() {
  const e = getOrganizerDemoEventSummary()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organizer dashboard preview</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Explore the read-only organizer experience with synthetic numbers. This does not use
          your account or any production event — it is safe for screenshots and walkthroughs.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/organizer-demo/event/${ORGANIZER_DEMO_EVENT_ID}`}>
          <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{e.event_name}</CardTitle>
              <p className="font-mono text-xs text-muted-foreground">{e.event_code}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Users className="h-4 w-4 shrink-0" />
                <span>{ORGANIZER_DEMO_TOTAL_ATTENDEES.toLocaleString()} guests (demo)</span>
              </div>
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
      </div>
      <p className="text-xs text-muted-foreground">
        For a real event, sign in and open{" "}
        <Link href="/organizer" className="underline underline-offset-2 hover:text-foreground">
          /organizer
        </Link>{" "}
        after an admin grants access.
      </p>
    </div>
  )
}
