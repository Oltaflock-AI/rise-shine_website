import { describe, expect, it } from "vitest";
import {
  compare,
  deltaLabel,
  startOfMonth,
  startOfWeek,
  summarise,
  weeklyBuckets,
  type TrendRow,
} from "@/lib/trend";

const row = (iso: string, extra: Partial<TrendRow> = {}): TrendRow => ({
  started_at: iso,
  duration_secs: 90,
  qualified: false,
  callback_time: null,
  ...extra,
});

describe("IST boundaries", () => {
  it("starts the week on Monday 00:00 IST, not UTC", () => {
    // Sunday 2026-09-13 23:00 UTC is Monday 04:30 IST → week began Mon 00:00 IST
    // = Sunday 18:30 UTC.
    const now = Date.parse("2026-09-13T23:00:00Z");
    expect(new Date(startOfWeek(now)).toISOString()).toBe("2026-09-13T18:30:00.000Z");
  });

  it("starts the month at 00:00 IST on the 1st", () => {
    // 31 Aug 20:00 UTC is already 1 Sep 01:30 IST.
    const now = Date.parse("2026-08-31T20:00:00Z");
    expect(new Date(startOfMonth(now)).toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });
});

describe("summarise", () => {
  it("counts connected only when there was talk time", () => {
    const s = summarise([
      row("2026-09-10T10:00:00Z", { duration_secs: 0 }),
      row("2026-09-10T11:00:00Z", { duration_secs: 60, qualified: true, callback_time: "2 PM" }),
      row("2026-09-10T12:00:00Z", { duration_secs: 120 }),
    ]);
    expect(s).toEqual({ total: 3, connected: 2, qualified: 1, callbacks: 1, talkSecs: 180, avgSecs: 90 });
  });
});

describe("compare", () => {
  // Saturday 12 Sep 2026, 10:00 IST.
  const now = Date.parse("2026-09-12T04:30:00Z");
  const rows = [
    row("2026-09-08T05:00:00Z"), // Tue this week
    row("2026-09-11T05:00:00Z"), // Fri this week
    row("2026-09-03T05:00:00Z"), // last week
    row("2026-08-20T05:00:00Z"), // last month
    row(null as unknown as string), // no start → ignored by ranges
  ];

  it("splits this week from last week", () => {
    const c = compare(rows, "week", now);
    expect(c.current.total).toBe(2);
    expect(c.previous?.total).toBe(1);
    expect(c.previousLabel).toBe("last week");
  });

  it("splits this month from last month", () => {
    const c = compare(rows, "month", now);
    expect(c.current.total).toBe(3);
    expect(c.previous?.total).toBe(1);
  });

  it("all time has no previous period and keeps undated rows", () => {
    const c = compare(rows, "all", now);
    expect(c.current.total).toBe(5);
    expect(c.previous).toBeNull();
  });

  it("does not count a call started after now", () => {
    const c = compare([row("2026-09-12T09:00:00Z")], "week", now);
    expect(c.current.total).toBe(0);
  });
});

describe("weeklyBuckets", () => {
  const now = Date.parse("2026-09-12T04:30:00Z");
  it("returns every week, empty ones included, oldest first", () => {
    const b = weeklyBuckets([row("2026-09-08T05:00:00Z", { qualified: true })], 4, now);
    expect(b.map((x) => x.weekStart)).toEqual(["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"]);
    expect(b[3]).toEqual({ weekStart: "2026-09-07", total: 1, qualified: 1 });
    expect(b[0].total).toBe(0);
  });
});

describe("deltaLabel", () => {
  it("phrases up, down, flat and none", () => {
    expect(deltaLabel(5, 3, "last week")).toBe("+2 vs last week");
    expect(deltaLabel(1, 3, "last week")).toBe("−2 vs last week");
    expect(deltaLabel(3, 3, "last month")).toBe("same as last month");
    expect(deltaLabel(3, null, null)).toBeNull();
  });
});
