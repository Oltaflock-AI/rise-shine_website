import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { categoryMeta } from "@/data/packages";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    "",
    "/about",
    "/packages",
    ...Object.keys(categoryMeta).map((c) => `/packages/${c}`),
    "/services",
    "/contact",
    "/plan-my-trip",
  ];

  return paths.map((path) => ({
    url: `${site.url}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
