// Time-sliced call metrics for the Overview — pure, no network, unit-tested.
//
// Reads voice_calls-shaped rows (the webhook's record of every call, all of
// history) rather than the ElevenLabs feed, which is capped at the 25 most
// recent conversations and would make "all time" a lie the moment the agent
// gets busy.
//
// Every boundary is measured in Asia/Kolkata. The dashboard is read in
// Ahmedabad and Vercel runs in UTC, so a naive "start of this week" would
// flip five and a half hours early. IST has no DST, so a fixed offset is exact.

export interface TrendRow {
  started_at: string | null;
  duration_secs: number | null;
  qualified: boolean | null;
  callback_time: string | null;
}

export type Range = "week" | "month" | "all";

export const RANGE_LABEL: Record<Range, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
};

export interface PeriodStats {
  total: number;
  connected: number;
  qualified: number;
  callbacks: number;
  talkSecs: number;
  /** Mean length of a connected call, seconds. */
  avgSecs: number;
}

export interface Comparison {
  current: PeriodStats;
  /** The same-length period immediately before; null for "all". */
  previous: PeriodStats | null;
  /** What the previous window is called in copy: "last week" / "last month". */
  previousLabel: string | null;
}

export interface WeekBucket {
  /** ISO date (IST) of the Monday that opens the week. */
  weekStart: string;
  total: number;
  qualified: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Shift a UTC instant so UTC getters read as IST wall-clock. */
function toIst(ms: number): Date {
  return new Date(ms + IST_OFFSET_MS);
}

/** Inverse of toIst: an IST wall-clock Date.UTC(...) back to a real instant. */
function fromIst(istMs: number): number {
  return istMs - IST_OFFSET_MS;
}

/** Start of the IST day containing `now`, as a real instant. */
function startOfDay(now: number): number {
  const d = toIst(now);
  return fromIst(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Start of the IST week (Monday) containing `now`. */
export function startOfWeek(now: number): number {
  const d = toIst(now);
  // getUTCDay: 0 = Sunday. Monday-based offset.
  const back = (d.getUTCDay() + 6) % 7;
  return startOfDay(now) - back * DAY_MS;
}

/** Start of the IST calendar month containing `now`. */
export function startOfMonth(now: number): number {
  const d = toIst(now);
  return fromIst(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(instant: number, n: number): number {
  const d = toIst(instant);
  return fromIst(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

function startedAt(row: TrendRow): number | null {
  if (!row.started_at) return null;
  const t = Date.parse(row.started_at);
  return Number.isNaN(t) ? null : t;
}

function isConnected(row: TrendRow): boolean {
  return (row.duration_secs ?? 0) > 0;
}

export function summarise(rows: TrendRow[]): PeriodStats {
  let total = 0;
  let connected = 0;
  let qualified = 0;
  let callbacks = 0;
  let talkSecs = 0;
  for (const r of rows) {
    total += 1;
    if (isConnected(r)) {
      connected += 1;
      talkSecs += r.duration_secs ?? 0;
    }
    if (r.qualified === true) qualified += 1;
    if (r.callback_time) callbacks += 1;
  }
  return {
    total,
    connected,
    qualified,
    callbacks,
    talkSecs,
    avgSecs: connected ? Math.round(talkSecs / connected) : 0,
  };
}

/** Rows whose start falls in [from, to). Rows with no start time are dropped. */
function between(rows: TrendRow[], from: number, to: number): TrendRow[] {
  return rows.filter((r) => {
    const t = startedAt(r);
    return t !== null && t >= from && t < to;
  });
}

/**
 * Stats for the chosen range and, for week/month, the period before it —
 * "this week vs last week" needs both. "All" has no previous period: there is
 * nothing before all of history.
 */
export function compare(rows: TrendRow[], range: Range, now = Date.now()): Comparison {
  if (range === "all") {
    return { current: summarise(rows), previous: null, previousLabel: null };
  }
  if (range === "week") {
    const from = startOfWeek(now);
    const prevFrom = from - 7 * DAY_MS;
    return {
      current: summarise(between(rows, from, now + 1)),
      previous: summarise(between(rows, prevFrom, from)),
      previousLabel: "last week",
    };
  }
  const from = startOfMonth(now);
  const prevFrom = addMonths(from, -1);
  return {
    current: summarise(between(rows, from, now + 1)),
    previous: summarise(between(rows, prevFrom, from)),
    previousLabel: "last month",
  };
}

/**
 * The last `weeks` IST weeks, oldest first, the current (partial) week last.
 * Every week is present even when empty so the chart's x-axis is regular.
 */
export function weeklyBuckets(rows: TrendRow[], weeks = 12, now = Date.now()): WeekBucket[] {
  const thisWeek = startOfWeek(now);
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = thisWeek - i * 7 * DAY_MS;
    const slice = between(rows, from, from + 7 * DAY_MS);
    const s = summarise(slice);
    out.push({
      weekStart: toIst(from).toISOString().slice(0, 10),
      total: s.total,
      qualified: s.qualified,
    });
  }
  return out;
}

/**
 * "+3 vs last week" / "−1 vs last week" / "same as last week". Null when the
 * comparison has no previous period.
 */
export function deltaLabel(current: number, previous: number | null, previousLabel: string | null): string | null {
  if (previous === null || !previousLabel) return null;
  const d = current - previous;
  if (d === 0) return `same as ${previousLabel}`;
  const sign = d > 0 ? "+" : "−";
  return `${sign}${Math.abs(d)} vs ${previousLabel}`;
}

/** "8 Sep" style label for a week's Monday, in IST. */
export function weekLabel(weekStart: string): string {
  const [, m, d] = weekStart.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m ?? 1) - 1]}`;
}
