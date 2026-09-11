/**
 * Google Business Profile listing — SERVER ONLY (reads GOOGLE_MAPS_API_KEY).
 *
 * Feeds the listing card beside the office map on /contact: name, address,
 * rating, hours, phone, the Google Maps / directions / write-a-review links
 * and one cover photo. Places API (New, v1) only — the legacy Place Details
 * endpoint is not enabled on the project's key (it answers REQUEST_DENIED),
 * which is also why `google-reviews.ts` ends up on its v1 fallback.
 *
 * The cover photo goes through `/media?skipHttpRedirect=true`, which answers
 * with a keyless `lh3.googleusercontent.com` URL. The direct media URL needs
 * the API key in the query string, and that must never reach the browser.
 *
 * Cached in the Next.js data cache for 6h (same window as the reviews feed).
 * Returns `null` on any failure so the card falls back to the NAP in
 * `data/site.ts` — the page never depends on Google being up.
 */

import { site } from "@/data/site";
import type { HoursPeriod } from "./opening-hours";

export type GooglePlace = {
  name: string;
  /** Google's category label, e.g. "Travel Agency" */
  category: string | null;
  address: string;
  rating: number;
  count: number;
  phone: { display: string; href: string } | null;
  website: string | null;
  hours: { periods: HoursPeriod[]; weekdays: string[] } | null;
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" */
  status: string | null;
  links: { place: string; directions: string | null; review: string | null };
  photo: { url: string; width: number; height: number; credit: string | null } | null;
};

const REVALIDATE_SECONDS = 21_600;
const SEARCH_QUERY = `${site.name}, ${site.address.line1}, ${site.address.line2}, ${site.address.city}`;
const cache = { next: { revalidate: REVALIDATE_SECONDS, tags: ["google-place"] } };

const FIELD_MASK = [
  "displayName",
  "primaryTypeDisplayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "businessStatus",
  "googleMapsUri",
  "googleMapsLinks",
  "photos",
].join(",");

function apiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

function headers(fieldMask: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey(),
    "X-Goog-FieldMask": fieldMask,
  };
}

async function findPlaceId(): Promise<string | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: headers("places.id"),
    body: JSON.stringify({ textQuery: SEARCH_QUERY }),
    ...cache,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.places?.[0]?.id ?? null;
}

type V1Photo = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName?: string }[];
};

/** Resolve a photo resource to its public CDN URL (no key in it). */
async function resolvePhoto(photo: V1Photo): Promise<GooglePlace["photo"]> {
  const url =
    `https://places.googleapis.com/v1/${photo.name}/media` +
    `?maxWidthPx=900&skipHttpRedirect=true&key=${apiKey()}`;
  const res = await fetch(url, cache);
  if (!res.ok) return null;
  const data = await res.json();
  if (typeof data.photoUri !== "string") return null;
  return {
    url: data.photoUri,
    width: photo.widthPx ?? 900,
    height: photo.heightPx ?? 600,
    credit: photo.authorAttributions?.[0]?.displayName ?? null,
  };
}

/**
 * Prefer a landscape photo — the card's cover is 16:9, and a 3:4 portrait
 * (typical for a phone shot of the office door) crops to a sliver of nothing.
 */
function pickPhoto(photos: V1Photo[]): V1Photo | undefined {
  return (
    photos.find((p) => (p.widthPx ?? 0) > (p.heightPx ?? 0)) ?? photos[0]
  );
}

async function fetchPlace(): Promise<GooglePlace | null> {
  const placeId = process.env.GOOGLE_PLACE_ID || (await findPlaceId());
  if (!placeId) return null;

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: headers(FIELD_MASK),
    ...cache,
  });
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.displayName?.text) return null;

  const photoRes = pickPhoto(d.photos ?? []);
  const photo = photoRes ? await resolvePhoto(photoRes).catch(() => null) : null;

  const intl: string | undefined = d.internationalPhoneNumber;
  const phone = intl
    ? { display: intl, href: `tel:${intl.replace(/[^+\d]/g, "")}` }
    : null;

  const hours = d.regularOpeningHours
    ? {
        periods: (d.regularOpeningHours.periods ?? []) as HoursPeriod[],
        weekdays: (d.regularOpeningHours.weekdayDescriptions ?? []) as string[],
      }
    : null;

  return {
    name: d.displayName.text,
    category: d.primaryTypeDisplayName?.text ?? null,
    address: d.formattedAddress ?? site.address.full,
    rating: d.rating ?? site.reviews.rating,
    count: d.userRatingCount ?? site.reviews.count,
    phone,
    website: d.websiteUri ?? null,
    hours,
    status: d.businessStatus ?? null,
    links: {
      place: d.googleMapsLinks?.placeUri ?? d.googleMapsUri ?? site.reviews.url,
      directions: d.googleMapsLinks?.directionsUri ?? null,
      review: d.googleMapsLinks?.writeAReviewUri ?? null,
    },
    photo,
  };
}

/**
 * The live listing, or `null` when unavailable (no key / API error / quota)
 * so the caller can render the static NAP instead. Never throws.
 */
export async function getGooglePlace(): Promise<GooglePlace | null> {
  if (!apiKey()) return null;
  try {
    return await fetchPlace();
  } catch (err) {
    console.warn("[google-place] listing unavailable:", err);
    return null;
  }
}
