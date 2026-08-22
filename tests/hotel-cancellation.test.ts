import { describe, expect, it } from "vitest";
import {
  cancellationHeadline,
  cancellationWindows,
  tboDateToISO,
} from "../src/lib/hotel-cancellation";

/**
 * The reported bug: a stay checking in on the 23rd showed
 *
 *   From 21-08-26 (UTC): No charge
 *   From 22-08-26 (UTC): 100% of the fare
 *
 * Both rows are real TBO output (Dubai, verified live). The first window had
 * already closed by the time the guest read it, so the page was advertising a
 * free cancellation that no longer existed.
 */
const REAL: { fromDate: string; chargeType: string; charge: number }[] = [
  { fromDate: "21-08-2026 00:00:00", chargeType: "Fixed", charge: 0 },
  { fromDate: "22-08-2026 00:00:00", chargeType: "Percentage", charge: 100 },
];
const fmt = (iso: string) => iso.slice(0, 10);

describe("tboDateToISO", () => {
  it("reads TBO's DD-MM-YYYY hh:mm:ss as UTC", () => {
    expect(tboDateToISO("21-08-2026 00:00:00")).toBe("2026-08-21T00:00:00Z");
    expect(tboDateToISO("05-01-2027 18:30:00")).toBe("2027-01-05T18:30:00Z");
  });

  it("tolerates a date with no time", () => {
    expect(tboDateToISO("21-08-2026")).toBe("2026-08-21T00:00:00Z");
  });

  it("returns empty for junk rather than an Invalid Date", () => {
    expect(tboDateToISO("")).toBe("");
    expect(tboDateToISO("not a date")).toBe("");
  });
});

describe("cancellationWindows", () => {
  it("drops the window that has already closed", () => {
    const w = cancellationWindows(REAL, new Date("2026-08-23T09:00:00Z"));
    expect(w).toHaveLength(1);
    expect(w[0].charge).toBe(100);
    expect(w[0].active).toBe(true);
    expect(w[0].fromISO).toBe("2026-08-22T00:00:00Z");
  });

  it("keeps the free window while it is still open, and marks it active", () => {
    const w = cancellationWindows(REAL, new Date("2026-08-21T12:00:00Z"));
    expect(w).toHaveLength(2);
    expect(w[0].free).toBe(true);
    expect(w[0].active).toBe(true);
    expect(w[0].untilISO).toBe("2026-08-22T00:00:00Z");
    expect(w[1].active).toBe(false);
  });

  it("pairs each window with the next row's date as its end", () => {
    const w = cancellationWindows(REAL, new Date("2026-08-20T00:00:00Z"));
    expect(w[0].untilISO).toBe("2026-08-22T00:00:00Z");
    expect(w[1].untilISO).toBeUndefined();
  });

  it("sorts rows TBO sent out of order", () => {
    const w = cancellationWindows(
      [REAL[1], REAL[0]],
      new Date("2026-08-20T00:00:00Z"),
    );
    expect(w.map((x) => x.charge)).toEqual([0, 100]);
  });

  it("keeps the final row when every window has lapsed", () => {
    // Same-day stays come back with every date in the past; an empty policy
    // would read as "cancel freely", which is the opposite of the truth.
    const w = cancellationWindows(REAL, new Date("2027-01-01T00:00:00Z"));
    expect(w).toHaveLength(1);
    expect(w[0].charge).toBe(100);
    expect(w[0].active).toBe(true);
  });

  it("ignores rows with unreadable dates", () => {
    const w = cancellationWindows(
      [{ fromDate: "garbage", charge: 0 }, REAL[1]],
      new Date("2026-08-23T00:00:00Z"),
    );
    expect(w).toHaveLength(1);
    expect(w[0].charge).toBe(100);
  });

  it("returns nothing when TBO sends no policy", () => {
    expect(cancellationWindows([], new Date())).toEqual([]);
    expect(cancellationWindows(undefined, new Date())).toEqual([]);
  });
});

describe("cancellationHeadline", () => {
  it("promises free cancellation only while the window is open", () => {
    expect(
      cancellationHeadline(
        cancellationWindows(REAL, new Date("2026-08-21T12:00:00Z")),
        fmt,
      ),
    ).toBe("Free cancellation until 2026-08-22");
  });

  it("never repeats a free window that closed before the guest arrived", () => {
    // The 21st→22nd free window is history by the 23rd; for someone booking
    // now the rate simply is not refundable, and saying so is the whole fix.
    expect(
      cancellationHeadline(
        cancellationWindows(REAL, new Date("2026-08-23T09:00:00Z")),
        fmt,
      ),
    ).toBe("Non-refundable");
  });

  it("says non-refundable when no free window ever existed", () => {
    const w = cancellationWindows(
      [
        {
          fromDate: "01-08-2026 00:00:00",
          chargeType: "Percentage",
          charge: 100,
        },
      ],
      new Date("2026-08-23T00:00:00Z"),
    );
    expect(cancellationHeadline(w, fmt)).toBe("Non-refundable");
  });

  it("says nothing when there is no policy", () => {
    expect(cancellationHeadline([], fmt)).toBe("");
  });
});
