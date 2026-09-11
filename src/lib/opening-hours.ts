/**
 * Open / closed status from Google Places `regularOpeningHours.periods`.
 *
 * Pure: the caller supplies "now" as a weekday + minutes-since-midnight in the
 * business's own time zone (`nowInZone`), so the same function runs on the
 * server and in the browser and is pinned by tests/opening-hours.test.ts.
 *
 * Google's `openNow` flag is NOT used: the place is cached for hours, so the
 * flag would say "Open now" at midnight. Status is always computed live.
 */

/** Google's `{ day, hour, minute }` — day 0 = Sunday, like `Date#getDay`. */
export type HoursPoint = { day: number; hour: number; minute: number };
/** A period without `close` is open 24 hours (Google's convention). */
export type HoursPeriod = { open: HoursPoint; close?: HoursPoint };

export type OpenStatus =
  | { open: true; closesAt: string | null }
  | { open: false; opensAt: string | null };

const DAY_MIN = 24 * 60;
const WEEK_MIN = 7 * DAY_MIN;
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Minutes since Sunday 00:00. */
function weekMinutes(p: HoursPoint): number {
  return p.day * DAY_MIN + p.hour * 60 + p.minute;
}

/** "7:00 PM" — same shape Google prints in `weekdayDescriptions`. */
export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatPoint(p: HoursPoint, todayDay: number): string {
  const clock = formatClock(p.hour, p.minute);
  return p.day === todayDay ? clock : `${DAY_SHORT[p.day]} ${clock}`;
}

/**
 * Weekday + minutes-since-midnight for `date` in `timeZone`, via Intl so the
 * server (UTC on Vercel) and the browser (anywhere) agree on the shop's clock.
 */
export function nowInZone(
  date: Date,
  timeZone: string,
): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = Math.max(0, DAY_SHORT.indexOf(get("weekday")));
  // Some engines print midnight as "24" with hour12:false.
  const hour = Number(get("hour")) % 24;
  return { day, minutes: hour * 60 + Number(get("minute")) };
}

/**
 * Is the business open at `now`, and when does that change?
 * Handles periods that run past midnight (close.day ≠ open.day) and the
 * Sunday→Monday wrap. Empty periods → closed with no reopening time.
 */
export function openStatus(
  periods: readonly HoursPeriod[],
  now: { day: number; minutes: number },
): OpenStatus {
  const nowMin = now.day * DAY_MIN + now.minutes;

  // 24/7: Google encodes it as one period opening Sunday 00:00 with no close.
  const always = periods.find((p) => !p.close);
  if (always) return { open: true, closesAt: null };

  let nextOpen: { at: number; point: HoursPoint } | null = null;

  for (const p of periods) {
    if (!p.close) continue;
    const start = weekMinutes(p.open);
    let end = weekMinutes(p.close);
    if (end <= start) end += WEEK_MIN; // wraps past Saturday night

    // Test the period in this week and the previous one (a Saturday-night
    // period that closes early Sunday still covers Sunday 00:30).
    for (const shift of [0, -WEEK_MIN]) {
      const s = start + shift;
      const e = end + shift;
      if (nowMin >= s && nowMin < e) {
        return { open: true, closesAt: formatPoint(p.close, now.day) };
      }
    }

    // Distance to this period's next opening, wrapping into next week.
    const delta = (start - nowMin + WEEK_MIN) % WEEK_MIN;
    const at = nowMin + delta;
    if (!nextOpen || at < nextOpen.at) nextOpen = { at, point: p.open };
  }

  return {
    open: false,
    opensAt: nextOpen ? formatPoint(nextOpen.point, now.day) : null,
  };
}
