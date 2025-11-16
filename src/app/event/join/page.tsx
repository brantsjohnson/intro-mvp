import { Suspense } from "react"
import { EventJoinPage } from "@/components/event/event-join-page"

export default function EventJoin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cover bg-center bg-fixed flex items-center justify-center" style={{ backgroundImage: "url('/background.jpg')" }}>Loading...</div>}>
      <EventJoinPage />
    </Suspense>
  )
}
