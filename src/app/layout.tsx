import type { Metadata } from "next";
import "./globals.css";
import { ConditionalToaster } from "@/components/ui/conditional-toaster";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { AnalyticsScripts } from "@/components/analytics-scripts";

const site =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Intro - Conference Networking",
  description: "Connect with the right people at your next conference",
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
