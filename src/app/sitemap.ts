import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { categoryMeta } from "@/data/packages";
import { PACKAGE_LIST } from "@/data/catalog";
import { lightItineraries } from "@/data/itineraries";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    "",
    "/about",
    "/packages",
    ...Object.keys(categoryMeta).map((c) => `/packages/${c}`),
    ...PACKAGE_LIST.map((p) => `/packages/${p.category}/${p.key}`),
    ...lightItineraries.map((i) => `/packages/${i.category}/${i.slug}`),
    "/services",
    "/contact",
    "/plan-my-trip",
    "/terms",
    "/refund-policy",
  ];

  return paths.map((path) => ({
    url: `${site.url}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
