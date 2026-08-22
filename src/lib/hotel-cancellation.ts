/**
 * Turning TBO's cancellation rows into something a guest can act on.
 *
 * TBO sends a list of `{ FromDate, ChargeType, CancellationCharge }` where each
 * row opens a WINDOW that runs until the next row's date — the last one runs
 * forever. Rendering the rows literally produces lines like
 *
 *   From 21-08-26 (UTC): No charge
 *   From 22-08-26 (UTC): 100% of the fare
 *
 * on a stay checking in on the 23rd, which reads as though the hotel is quoting
 * dates in the past. It is not wrong, it is unfinished: the free window opened
 * on the 21st and CLOSED on the 22nd, so by the time the guest reads it the only
 * live fact is "cancelling now costs 100%".
 *
 * So: pair each row with its end, drop windows that have already closed, and
 * mark the one containing `now`. A window the guest can no longer choose is
 * noise at best and a false promise of a refund at worst.
 *
 * Pure and dependency-free: `tests/hotel-cancellation.test.ts` covers it.
 */

export type RawCancelPolicy = {
  /** TBO format: "DD-MM-YYYY hh:mm:ss", UTC. */
  fromDate: string;
  chargeType?: string | number;
  charge: number;
};

export type CancellationWindow = {
  /** ISO datetime the window opens, "" when TBO's date was unparseable. */
  fromISO: string;
  /** ISO datetime it closes; undefined for the final, open-ended window. */
  untilISO?: string;
  charge: number;
  chargeType?: string | number;
  /** No charge to cancel inside this window. */
  free: boolean;
  /** This is the window `now` falls in — what cancelling today would cost. */
  active: boolean;
};

/** "DD-MM-YYYY hh:mm:ss" (UTC) → "YYYY-MM-DDTHH:mm:ssZ". "" when unparseable. */
export function tboDateToISO(s: string): string {
  const m =
    /^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
      (s || "").trim(),
    );
  if (!m) return "";
  const [, d, mo, y, hh = "00", mm = "00", ss = "00"] = m;
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`;
}

/**
 * Windows the guest can still act on, earliest first.
 *
 * `now` is injected so this is testable and so a server render and a client
 * render of the same page cannot disagree about which window is active.
 */
export function cancellationWindows(
  policies: readonly RawCancelPolicy[] | undefined,
  now: Date = new Date(),
): CancellationWindow[] {
  const rows = (policies ?? [])
    .map((p) => ({ ...p, fromISO: tboDateToISO(p.fromDate) }))
    .filter((p) => p.fromISO)
    .sort((a, b) => a.fromISO.localeCompare(b.fromISO));
  if (!rows.length) return [];

  const nowISO = now.toISOString();
  const windows: CancellationWindow[] = rows.map((row, i) => {
    const untilISO = rows[i + 1]?.fromISO;
    return {
      fromISO: row.fromISO,
      ...(untilISO ? { untilISO } : {}),
      charge: row.charge,
      chargeType: row.chargeType,
      free: row.charge <= 0,
      // The window containing now: it has opened and has not yet closed.
      active: row.fromISO <= nowISO && (!untilISO || untilISO > nowISO),
    };
  });

  // A window that closed before now cannot be chosen any more.
  const live = windows.filter((w) => !w.untilISO || w.untilISO > nowISO);

  // Everything has lapsed (TBO can date every row in the past on a same-day
  // stay). The final row still governs what cancelling costs, so keep it and
  // mark it active rather than showing the guest an empty policy.
  if (!live.length) return [{ ...windows[windows.length - 1], active: true }];
  return live;
}

/**
 * The single line worth leading with, or "" when there is nothing to say.
 * Reads the LIVE windows only, so it can never promise a refund window that
 * closed before the guest arrived. `formatDateTime` is injected so this stays
 * free of the site's date helpers.
 */
export function cancellationHeadline(
  windows: readonly CancellationWindow[],
  formatDateTime: (iso: string) => string,
): string {
  if (!windows.length) return "";
  const active = windows.find((w) => w.active) ?? windows[0];
  if (active.free) {
    return active.untilISO
      ? `Free cancellation until ${formatDateTime(active.untilISO)}`
      : "Free cancellation";
  }
  // No free window is still open. Whether one existed and lapsed, or never
  // existed at all, the fact for someone booking NOW is the same — and the
  // lapsed one is not theirs to mourn.
  return "Non-refundable";
}
