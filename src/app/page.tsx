import type { Metadata } from "next"

const title = "Intro — Prove Event ROI"
const description =
  "Intro matches attendees and sponsors to the right people, records who they meet, and syncs follow-ups to CRM so event-driven pipeline is visible. Prove event ROI without rebuilding your stack."

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    locale: "en_US",
    siteName: "Intro",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  alternates: {
    canonical: "/",
  },
}

export default function Home() {
  return (
    <iframe
      src="/marketing/index.html"
      title="Intro — Prove Event ROI"
      className="fixed inset-0 w-full h-full border-0 bg-background"
      allow="clipboard-write"
    />
  )
}
