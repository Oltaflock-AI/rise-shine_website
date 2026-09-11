import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd()),

  // The dashboard moved from admin.riseandshinetravel.in to .com on 2026-09-11
  // (the main site serves on .com and redirects .in). Old bookmarks and any
  // reset link mailed before the move still land on .in, so it forwards here
  // in code as well as at the Vercel domain level — one of the two is enough,
  // and neither can be forgotten in a rebuild.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "admin.riseandshinetravel.in" }],
        destination: "https://admin.riseandshinetravel.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
