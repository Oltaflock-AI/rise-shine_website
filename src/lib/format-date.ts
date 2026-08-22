/**
 * Site-wide date display format: DD-MM-YY (e.g. "23-07-26").
 * Accepts "YYYY-MM-DD" or a full ISO datetime; pure string slicing so no
 * timezone shifts. All user-facing dates must go through this helper.
 */
export function formatDate(iso: string | null | undefined): string {
  const d = (iso || "").slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "";
  return `${day}-${m}-${y.slice(2)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Weekday name for an ISO date ("" when the input is not a date).
 *
 * Built from the date PARTS via Date.UTC, never `new Date(iso)`: a bare
 * "2026-08-23" parses as midnight UTC, which is the day before in any negative
 * offset, and a TBO datetime like "2026-08-23T09:05:00" is local airport time
 * with no zone at all. Slicing the parts keeps the day the traveller flies.
 */
export function weekdayOf(iso: string | null | undefined): string {
  const [y, m, day] = (iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return "";
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}

/** "Sunday, 23-08-26" — the departure date as a traveller reads it. */
export function formatDateWithDay(iso: string | null | undefined): string {
  const date = formatDate(iso);
  if (!date) return "";
  const day = weekdayOf(iso);
  return day ? `${day}, ${date}` : date;
}
