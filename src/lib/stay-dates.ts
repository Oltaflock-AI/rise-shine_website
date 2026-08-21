/**
 * Stay-date sanity, checked BEFORE a search reaches TBO.
 *
 * A hotel URL outlives its dates: a bookmark, a browser-history entry or a link
 * pasted into a chat comes back days later with a check-in that has already
 * passed. TBO answers that with
 *
 *   "Invalid checkIn date. CheckIn date must be greater than or equal to
 *    destination's today date."
 *
 * which our results page could only render as "Live rates are unavailable" —
 * indistinguishable from a supplier outage, and the reason a stale link was
 * mistaken for a site failure on 21-Aug-2026. Catching it here means the guest
 * is told their dates have passed, and TBO is never asked an impossible question.
 */

/**
 * Today where the guest is booking from. TBO compares against the DESTINATION's
 * local date, which can be a day behind India; we deliberately use India's date
 * (never earlier than the traveller's own) so we only ever reject dates TBO
 * would certainly reject too — a borderline date is passed through and TBO
 * remains the authority.
 */
export function todayInIndiaISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Why this stay cannot be searched, or null when it is fine. ISO `YYYY-MM-DD`
 * strings compare correctly as plain strings, so no Date parsing is involved.
 */
export function stayDatesError(checkIn: string, checkOut: string, now: Date = new Date()): string | null {
  const today = todayInIndiaISO(now);
  if (checkIn < today) return "past-check-in";
  if (checkOut <= checkIn) return "check-out-before-check-in";
  return null;
}
