import { Suspense } from "react"
import { ConversationView } from "@/components/messages/conversation-view"

export default function ConversationPage() {
  return (
    <Suspense fallback={<div>Loading conversation...</div>}>
      <ConversationView />
    </Suspense>
  )
}
