import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No env file is traced into a server function by Next.js. Vercel's own builder still copies any env file it
  // finds in the project folder into every function, so .vercelignore keeping .env* out of the upload is the main fence.
  outputFileTracingExcludes: { "/*": [".env*", "**/.env*"] },
  // Search engines are told to stay away from every route (D11). This keeps the site out of search. It locks nothing.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
