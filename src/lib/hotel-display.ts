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

/**
 * A meal plan a guest can read, or nothing at all.
 *
 * TBO writes these in its own screaming-snake shape — `Room_Only`,
 * `Bed_And_Breakfast`, `HALF_BOARD` — and three separate components each did
 * their own `.replace(/_/g, " ")`, so the results card compared the raw string
 * against the literal "room only", never matched, and printed "Room_Only" on
 * every card in Mumbai.
 *
 * Room-only returns "": it is the ABSENCE of a meal, and a chip saying so is a
 * line of card space spent telling the guest nothing. Where a rate genuinely
 * needs the distinction spelt out — the room page, checkout, the voucher — the
 * caller passes `keepRoomOnly`.
 */
export function mealLabel(raw: string | undefined, keepRoomOnly = false): string {
  const text = (raw ?? "").replace(/_/g, " ").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const lower = text.toLowerCase();
  if (!keepRoomOnly && (lower === "room only" || lower === "roomonly")) return "";
  return lower.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/**
 * A room name a human wrote, from the one TBO sends.
 *
 * The live feed omits the space after a comma on nearly every rate —
 * "Deluxe Room,1 King Bed", "Premier Room,1 King Bed" — so every room card on
 * every hotel read as a typo. Three components each printed the raw string, so
 * fixing it at one call site fixed one page; this is the shared version.
 */
export function roomTitle(raw: string | undefined): string {
  const text = (raw ?? "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;·|-]+$/, "")
    .trim();
  return text || "Room";
}

/**
 * TBO's `RoomSize` as a unit a guest can read.
 *
 * The catalogue writes square feet as a bare "ft" — "355 ft" — which reads as a
 * length, not an area, and is how the room list came to advertise rooms 355
 * feet long. A size with no recognisable unit is assumed to be square feet,
 * which is what TBO uses throughout; anything that is not a number at all is
 * dropped rather than guessed at.
 */
export function roomSizeLabel(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const m = text.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return "";
  const value = m[1].replace(/,/g, "");
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const unit = m[2].toLowerCase().replace(/[^a-z0-9]/g, "");
  if (unit === "sqm" || unit === "m2" || unit === "sqmt" || unit === "sqmtr")
    return `${value} sq m`;
  // "", "ft", "sqft", "sqfeet", "squarefeet" — all square feet in TBO's feed.
  if (unit && !/^(ft|feet|sqft|sqfeet|squarefeet|squareft)$/.test(unit))
    return "";
  return `${value} sq ft`;
}

/**
 * TBO's `Inclusion` — a comma-separated dump — as one readable line.
 *
 * It arrives in whatever case the supplier typed ("breakfast buffet, FREE
 * VALET PARKING") and repeats itself across rates. Sentence case per item, de-
 * duplicated, and capped: past four entries it is a paragraph pretending to be
 * a chip row, and the same facts are in the room's own amenity list.
 */
export function inclusionItems(raw: string | undefined, max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[,;·]/)) {
    const text = part.replace(/\s+/g, " ").trim();
    if (!text || text.length > 40) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key[0].toUpperCase() + key.slice(1));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A supplier's machine key or shouted label as a sentence.
 *
 * TBO writes supplement types as snake_case ("mandatory_tax") and suppliers
 * write descriptions in whatever case they please, so the same fee appeared as
 * "mandatory tax" on the room list and "Mandatory tax" in the rate panel.
 */
export function sentenceCase(raw: string | undefined): string {
  const text = (raw ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

/**
 * The note beside a supplement priced in someone else's money.
 *
 * "(hotel's local currency)" named no currency, and TBO routinely quotes a
 * Dubai hotel's fee in USD — so the note was both vague and, for a rate the
 * hotel does not actually charge in dirhams, wrong. Say the code.
 */
export function supplementCurrencyNote(
  supplementCurrency: string | undefined,
  quoteCurrency: string | undefined,
): string {
  const sup = (supplementCurrency ?? "").trim().toUpperCase();
  const ours = (quoteCurrency ?? "INR").trim().toUpperCase();
  return sup && sup !== ours ? ` (charged in ${sup})` : "";
}

/**
 * A hotel's check-in / check-out time in ONE format.
 *
 * `CheckInTime` is free text on TBO's side and every supplier writes it their
 * own way — "14:00:00", "2:00 PM", "1400", "14:00" — so two hotels in the same
 * results set showed the same fact two different ways. Normalised to the
 * 12-hour clock the rest of the site speaks.
 *
 * Anything that is not a time comes back verbatim: some suppliers write real
 * sentences here ("Flexible"), and blanking that would lose the answer.
 */
export function clockLabel(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const m = text.match(/^(\d{1,2})[:.]?(\d{2})?(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!m) return text;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(hour) || hour > 24 || minute > 59) return text;

  const suffix = (m[3] ?? "").toLowerCase().replace(/\./g, "");
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  hour %= 24;

  const period = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${period}`;
}
