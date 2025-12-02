import { Suspense } from "react"
import { EventJoinPage } from "@/components/event/event-join-page"

export default function EventJoin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>}>
      <EventJoinPage />
    </Suspense>
  )
}
