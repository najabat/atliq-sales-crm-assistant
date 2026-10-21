import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No env file is traced into a server function by Next.js. Vercel's own builder still copies any env file it
  // finds in the project folder into every function, so .vercelignore keeping .env* out of the upload is the main fence.
  outputFileTracingExcludes: { "/*": [".env*", "**/.env*"] },
  // Search engines stay out of every route (D11). Link preview bots are allowed in robots.txt so a shared link shows a card (D29).
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
