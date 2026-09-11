/**
 * Google Business Profile listing — SERVER ONLY (reads GOOGLE_MAPS_API_KEY).
 *
 * Feeds the listing card beside the office map on /contact: name, address,
 * rating, hours, phone and the Google Maps / directions / write-a-review
 * links. Places API (New, v1) only — the legacy Place Details endpoint is not
 * enabled on the project's key (it answers REQUEST_DENIED), which is also why
 * `google-reviews.ts` ends up on its v1 fallback.
 *
 * No photo on purpose: every photo on the listing is a customer's holiday
 * shot (checked 11-Sep-2026 — mountains, safaris, a skydive), so the card
 * wears the brand header instead. If one is ever wanted, resolve it through
 * `/media?skipHttpRedirect=true` — the direct media URL carries the API key.
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
