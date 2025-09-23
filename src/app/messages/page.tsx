import { Suspense } from "react"
import { MessagesPage } from "@/components/messages/messages-page"

export default function Messages() {
  return (
    <Suspense fallback={<div>Loading messages...</div>}>
      <MessagesPage />
    </Suspense>
  )
}
