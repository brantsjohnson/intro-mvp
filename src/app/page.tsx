import { redirect } from "next/navigation"

// The rewrite in next.config.ts serves /marketing/index.html directly at /.
// This component is a safety fallback only.
export default function Home() {
  redirect("/marketing/index.html")
}
