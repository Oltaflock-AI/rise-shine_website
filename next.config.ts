import type { NextConfig } from "next";

/**
 * Permanent redirects from the old riseandshinetravel.com static tour URLs to
 * the new catalogue detail pages — preserves any existing search rankings /
 * backlinks after the rebuild. (`permanent: true` → HTTP 308, treated as a
 * permanent redirect by search engines, like 301.)
 */
const LEGACY_TOUR_REDIRECTS: { from: string; to: string }[] = [
  { from: "/andaman-domestic-tour.html", to: "/packages/domestic/andaman" },
  { from: "/rajasthan-domestic-tour.html", to: "/packages/domestic/rajasthan" },
  { from: "/kerala-domestic-tour.html", to: "/packages/domestic/kerala" },
  { from: "/goa-domestic-tour.html", to: "/packages/domestic/goa" },
  { from: "/golden-triangle-domestic-tour.html", to: "/packages/domestic/golden-triangle" },
  { from: "/thailand-international-tour.html", to: "/packages/international/thailand" },
  { from: "/mauritius-international-tour.html", to: "/packages/international/mauritius" },
  { from: "/hong-kong-macau-shenzhen-international-tour.html", to: "/packages/international/hong-kong" },
  { from: "/mauritius-with-dubai-international-tour.html", to: "/packages/international/mauritius-dubai" },
  { from: "/singapore-with-cruise-tour.html", to: "/packages/cruise/singapore-cruise" },
  { from: "/singapore-bali-with-cruise-tour.html", to: "/packages/cruise/singapore-bali-cruise" },
];

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
      // TBO hotel photography (static HotelDetails Images[] URLs).
      {
        protocol: "https",
        hostname: "www.tboholidays.com",
      },
      {
        protocol: "https",
        hostname: "tboholidays.com",
      },
    ],
  },
  async redirects() {
    return LEGACY_TOUR_REDIRECTS.map((r) => ({
      source: r.from,
      destination: r.to,
      permanent: true,
    }));
  },
};

export default nextConfig;
