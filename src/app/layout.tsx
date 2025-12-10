import type { Metadata } from "next";
import "./globals.css";
import { ConditionalToaster } from "@/components/ui/conditional-toaster";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";

export const metadata: Metadata = {
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
        <ConditionalToaster />
      </body>
    </html>
  );
}
