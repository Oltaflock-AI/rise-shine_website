/**
 * Live Google reviews feed — SERVER ONLY (reads GOOGLE_MAPS_API_KEY).
 *
 * Strategy (Google caps both APIs at 5 reviews max):
 *   1. Legacy Place Details — the only endpoint with `reviews_sort=newest`,
 *      which is the whole point of the live feed. Works when the key's project
 *      has "Places API" (legacy) enabled.
 *   2. Places API (New, v1) — fallback for keys with only "Places API (New)".
 *      No sort control; returns Google's "most relevant" 5, re-sorted newest-first here.
 *   3. Callers fall back to the static testimonials when this returns null
 *      (no key, quota, network) — same degrade pattern as the TBO layer.
 *
 * GOOGLE_PLACE_ID is optional: without it the place is resolved once per
 * revalidation window by text-searching the business NAP from `site.ts`.
 * Results are cached in the Next.js data cache (`revalidate`) — a handful of
 * Places calls per day, regardless of traffic.
 */

import { site } from "@/data/site";

export type GoogleReview = {
  author: string;
  authorUrl?: string;
  rating: number;
  text: string;
  /** e.g. "2 weeks ago" — already localized by Google */
  relativeTime: string;
  /** ISO timestamp, used to sort newest-first */
  publishedAt: string;
};

export type GoogleReviewsFeed = {
  rating: number;
  count: number;
  /** Google Maps URL of the listing (falls back to site.reviews.url) */
  url: string;
  reviews: GoogleReview[];
};

const REVALIDATE_SECONDS = 21_600; // 6h — 4 refreshes/day is plenty for reviews
/** Homepage is a sales surface: only surface 4★+ reviews in the cards. */
const MIN_CARD_RATING = 4;

const SEARCH_QUERY = `${site.name}, ${site.address.line1}, ${site.address.line2}, ${site.address.city}`;

const cache = { init: { next: { revalidate: REVALIDATE_SECONDS, tags: ["google-reviews"] } } };

function apiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

/* ── Legacy Places API (supports reviews_sort=newest) ─────────────────────── */

type LegacyReview = {
  author_name: string;
  author_url?: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number; // unix seconds
};

async function findPlaceIdLegacy(): Promise<string | null> {
  const url =
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
    `?input=${encodeURIComponent(SEARCH_QUERY)}&inputtype=textquery&fields=place_id&key=${apiKey()}`;
  const res = await fetch(url, cache.init);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK") return null;
  return data.candidates?.[0]?.place_id ?? null;
}

async function fetchLegacy(): Promise<GoogleReviewsFeed | null> {
  const placeId = process.env.GOOGLE_PLACE_ID || (await findPlaceIdLegacy());
  if (!placeId) return null;

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${placeId}&fields=rating,user_ratings_total,reviews,url` +
    `&reviews_sort=newest&key=${apiKey()}`;
  const res = await fetch(url, cache.init);
  if (!res.ok) return null;
  const data = await res.json();
  // REQUEST_DENIED here usually means the key only has Places API (New) → try v1.
  if (data.status !== "OK" || !data.result) return null;

  const r = data.result;
  return {
    rating: r.rating ?? site.reviews.rating,
    count: r.user_ratings_total ?? site.reviews.count,
    url: r.url ?? site.reviews.url,
    reviews: (r.reviews ?? []).map(
      (rev: LegacyReview): GoogleReview => ({
        author: rev.author_name,
        authorUrl: rev.author_url,
        rating: rev.rating,
        text: rev.text ?? "",
        relativeTime: rev.relative_time_description,
        publishedAt: new Date(rev.time * 1000).toISOString(),
      }),
    ),
  };
}

/* ── Places API (New, v1) fallback ────────────────────────────────────────── */

type V1Review = {
  rating: number;
  text?: { text?: string };
  relativePublishTimeDescription: string;
  publishTime: string;
  authorAttribution?: { displayName?: string; uri?: string };
};

async function findPlaceIdV1(): Promise<string | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({ textQuery: SEARCH_QUERY }),
    ...cache.init,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.places?.[0]?.id ?? null;
}

async function fetchV1(): Promise<GoogleReviewsFeed | null> {
  const placeId = process.env.GOOGLE_PLACE_ID || (await findPlaceIdV1());
  if (!placeId) return null;

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
    },
    ...cache.init,
  });
  if (!res.ok) return null;
  const data = await res.json();

  return {
    rating: data.rating ?? site.reviews.rating,
    count: data.userRatingCount ?? site.reviews.count,
    url: data.googleMapsUri ?? site.reviews.url,
    reviews: (data.reviews ?? []).map(
      (rev: V1Review): GoogleReview => ({
        author: rev.authorAttribution?.displayName ?? "Google user",
        authorUrl: rev.authorAttribution?.uri,
        rating: rev.rating,
        text: rev.text?.text ?? "",
        relativeTime: rev.relativePublishTimeDescription,
        publishedAt: rev.publishTime,
      }),
    ),
  };
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Newest-first Google reviews with the live aggregate rating, or `null` when
 * the feed is unavailable (missing key / API error) so callers can fall back
 * to the static testimonials. Never throws.
 */
export async function getGoogleReviews(): Promise<GoogleReviewsFeed | null> {
  if (!apiKey()) return null;
  try {
    const feed = (await fetchLegacy()) ?? (await fetchV1());
    if (!feed) return null;
    feed.reviews = feed.reviews
      .filter((r) => r.text.trim().length > 0 && r.rating >= MIN_CARD_RATING)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return feed;
  } catch (err) {
    console.warn("[google-reviews] live feed unavailable:", err);
    return null;
  }
}
