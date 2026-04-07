import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**', // Matches event-assets and other public buckets
      },
    ],
  },
  // Mark puppeteer packages as external to avoid bundling issues in serverless
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  async rewrites() {
    return {
      // Serve the marketing HTML directly at / before Next.js routing kicks in.
      // This avoids an iframe and lets the static file render without any wrapper.
      beforeFiles: [
        { source: '/', destination: '/marketing/index.html' },
      ],
    }
  },
};

export default nextConfig;
