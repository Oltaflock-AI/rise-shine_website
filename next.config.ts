import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Remote photography used across the marketing pages.
    // (Localize into /public for full perf control before launch.)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
