import Script from "next/script"

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/**
 * Loads GA4 when NEXT_PUBLIC_GA_MEASUREMENT_ID is set (e.g. G-XXXXXXXXXX).
 * Tracks the top-level Next.js document; use path filters in GA for / vs /home.
 */
export function AnalyticsScripts() {
  if (!gaId) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}');
        `}
      </Script>
    </>
  )
}
