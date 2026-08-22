/**
 * Display arithmetic for the hotel result cards and room rows.
 *
 * Everything here is presentation-only and derived from `TotalFare` — the one
 * number TBO's portal verification allows us to show (never `NetAmount`). A
 * per-night figure is division, not a different price, so it stays inside the
 * rule: the exact unrounded total is still rendered beside it.
 *
 * Pure (`formatDate` is itself pure string slicing) so
 * `tests/hotel-display.test.ts` can pin it.
 */
import { formatDate } from "./format-date";

/**
 * A cancellation deadline written as the MOMENT it is.
 *
 * TBO's windows routinely open at midnight UTC, and "free until the 22nd" is a
 * different promise from "free until 00:00 on the 22nd" — the second is really
 * the end of the 21st for anyone reading it in India. Say which.
 */
export function formatDeadline(iso: string): string {
  const day = formatDate(iso);
  if (!day) return "";
  const time = iso.slice(11, 16);
  return time && time !== "00:00"
    ? `${day}, ${time} UTC`
    : `${day} (00:00 UTC)`;
}

/**
 * The stay total divided across its nights.
 *
 * NOT divided by rooms. TBO prices a `Rooms[]` entry for the occupancy the
 * Search asked for, and whether that entry covers one room or all of them
 * varies by supplier — so dividing by the room count would invent a number the
 * supplier never quoted. Nights are safe: the stay window is ours, not theirs.
 */
export function perNightFare(totalFare: number, nights: number): number {
  if (!Number.isFinite(totalFare) || totalFare <= 0) return 0;
  const n = Math.max(1, Math.round(nights || 1));
  return totalFare / n;
}

/**
 * Star classes a guest can filter on.
 *
 * `0` means TBO gave us no rating at all — it is NOT "worse than 2 star". The
 * two were bucketed together, so a guest excluding cheap hotels silently lost
 * every unrated property as well, including the ones they were searching for.
 */
export type StarBucket = 5 | 4 | 3 | 2 | 0;

export function starBucket(stars: number): StarBucket {
  if (stars >= 5) return 5;
  if (stars === 4) return 4;
  if (stars === 3) return 3;
  if (stars >= 1) return 2;
  return 0;
}

export const STAR_BUCKET_LABEL: Record<StarBucket, string> = {
  5: "5 star",
  4: "4 star",
  3: "3 star",
  2: "1–2 star",
  0: "Unrated",
};

/** Total pages for `total` items at `perPage`; always at least 1. */
export function pageCount(total: number, perPage: number): number {
  if (perPage <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / perPage));
}

/**
 * One page of results, 1-indexed, clamped — a page number out of range returns
 * the nearest real page rather than an empty list, because the filters can
 * shrink the result set under the page the guest is standing on.
 */
export function pageSlice<T>(items: T[], page: number, perPage: number): T[] {
  if (perPage <= 0) return items;
  const last = pageCount(items.length, perPage);
  const p = Math.min(Math.max(1, Math.round(page || 1)), last);
  return items.slice((p - 1) * perPage, p * perPage);
}

/**
 * Page numbers to render, with `null` standing in for an elision.
 * Always shows the first, the last, and a window around the current page, so
 * the control stays one line wide on a phone for a 200-hotel city.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const c = Math.min(Math.max(1, current), total);
  const out: (number | null)[] = [1];
  const from = Math.max(2, c - 1);
  const to = Math.min(total - 1, c + 1);
  if (from > 2) out.push(null);
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push(null);
  out.push(total);
  return out;
}
