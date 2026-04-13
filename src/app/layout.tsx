import type { Metadata } from "next";
import "./globals.css";
import { ConditionalToaster } from "@/components/ui/conditional-toaster";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { AnalyticsScripts } from "@/components/analytics-scripts";

const site =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:1000");

const shareImage = "/marketing/Intro%20Circle%20Logo%20-%20Transparent.png";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Intro - Conference Networking",
  description: "Connect with the right people at your next conference",
  icons: {
    icon: [{ url: shareImage, type: "image/png" }],
    apple: shareImage,
  },
  openGraph: {
    title: "Intro - Conference Networking",
    description: "Connect with the right people at your next conference",
    images: [{ url: shareImage, width: 600, height: 600, alt: "Intro" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Intro - Conference Networking",
    description: "Connect with the right people at your next conference",
    images: [shareImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="font-body antialiased bg-background text-foreground"
      >
        <PageTransitionWrapper>
        {children}
        </PageTransitionWrapper>
        <AnalyticsScripts />
        <ConditionalToaster />
      </body>
    </html>
  );
}
