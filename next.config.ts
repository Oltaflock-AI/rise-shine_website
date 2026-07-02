import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve AVIF first (smallest), then WebP, then fall back to the original.
    formats: ["image/avif", "image/webp"],
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
