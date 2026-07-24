import "server-only";

/**
 * Google review scores for hotel result cards — SERVER ONLY (reads
 * GOOGLE_MAPS_API_KEY, same key as lib/google-reviews).
 *
 * One Find Place lookup per hotel ("<name>, <city>"), asking only for
 * rating + user_ratings_total. Each lookup is cached in the Next.js data
 * cache for 7 days (ratings drift slowly), so a city's hotel set costs a
 * burst of Places calls once a week — not per search. Lookups carry a
 * per-call timeout and every failure is just a missing entry: the results
 * page renders fine with no rating on a card, and the cache self-heals on
 * later searches. Falls back to the Places API (New) when the legacy API
 * isn't enabled for the key.
 */

export type HotelReviewScore = {
  /** Google rating, 1.0–5.0 */
  rating: number;
  /** Number of Google reviews behind it */
  count: number;
};

const REVALIDATE_SECONDS = 604_800; // 7 days
const PER_CALL_TIMEOUT_MS = 3_000;
/** Results pages price ≤100 hotels; don't ever fan out beyond that. */
const MAX_LOOKUPS = 100;

const cacheInit = { next: { revalidate: REVALIDATE_SECONDS, tags: ["hotel-ratings"] } };

function apiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

export const hotelRatingsConfigured = () => Boolean(apiKey());

/* ── single lookup: legacy Find Place, then Places (New) text search ──────── */

async function findPlaceLegacy(query: string, key: string): Promise<HotelReviewScore | null> {
  const url =
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
    `?input=${encodeURIComponent(query)}&inputtype=textquery` +
    `&fields=rating,user_ratings_total&key=${key}`;
  const res = await fetch(url, { ...cacheInit, signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS) });
  if (!res.ok) return null;
  const j = await res.json();
  if (j?.status !== "OK") return null;
  const c = j.candidates?.[0];
  const rating = Number(c?.rating);
  const count = Number(c?.user_ratings_total);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return { rating, count: Number.isFinite(count) ? count : 0 };
}

async function findPlaceNew(query: string, key: string): Promise<HotelReviewScore | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    ...cacheInit,
    signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const p = j?.places?.[0];
  const rating = Number(p?.rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return { rating, count: Number(p?.userRatingCount) || 0 };
}

async function lookup(query: string, key: string): Promise<HotelReviewScore | null> {
  try {
    return (await findPlaceLegacy(query, key)) ?? (await findPlaceNew(query, key));
  } catch {
    return null; // timeout / network / quota → just no badge on this card
  }
}

/* ── batch ────────────────────────────────────────────────────────────────── */

export async function hotelRatingsBatch(
  hotels: Array<{ code: string; name?: string; city: string }>,
): Promise<Map<string, HotelReviewScore>> {
  const key = apiKey();
  const out = new Map<string, HotelReviewScore>();
  if (!key) return out;

  const targets = hotels
    .filter((h) => h.name && h.name.trim().length > 2)
    .slice(0, MAX_LOOKUPS);

  const results = await Promise.allSettled(
    targets.map(async (h) => {
      const score = await lookup(`${h.name}, ${h.city}`, key);
      return { code: h.code, score };
    }),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.score) out.set(r.value.code, r.value.score);
  }
  return out;
}
