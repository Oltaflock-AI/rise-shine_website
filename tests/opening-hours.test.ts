import { describe, expect, it } from "vitest";
import {
  formatClock,
  nowInZone,
  openStatus,
  type HoursPeriod,
} from "../src/lib/opening-hours";

/** Mon–Sat 10:00–19:00, Sunday closed — the office's real Google listing. */
const OFFICE: HoursPeriod[] = [1, 2, 3, 4, 5, 6].map((day) => ({
  open: { day, hour: 10, minute: 0 },
  close: { day, hour: 19, minute: 0 },
}));

const at = (day: number, hour: number, minute = 0) => ({
  day,
  minutes: hour * 60 + minute,
});

describe("openStatus", () => {
  it("is open mid-afternoon and says when it closes", () => {
    expect(openStatus(OFFICE, at(5, 14))).toEqual({ open: true, closesAt: "7:00 PM" });
  });

  it("opens at 10:00 sharp and is closed at 19:00 sharp", () => {
    expect(openStatus(OFFICE, at(1, 10))).toMatchObject({ open: true });
    expect(openStatus(OFFICE, at(1, 19))).toMatchObject({ open: false, opensAt: "Tue 10:00 AM" });
  });

  it("before opening the same day says today's time without a weekday", () => {
    expect(openStatus(OFFICE, at(3, 8, 30))).toEqual({ open: false, opensAt: "10:00 AM" });
  });

  it("on Sunday points to Monday", () => {
    expect(openStatus(OFFICE, at(0, 12))).toEqual({ open: false, opensAt: "Mon 10:00 AM" });
  });

  it("Saturday night wraps to Monday, not to a stale Sunday", () => {
    expect(openStatus(OFFICE, at(6, 22))).toEqual({ open: false, opensAt: "Mon 10:00 AM" });
  });

  it("handles a period that runs past midnight", () => {
    const bar: HoursPeriod[] = [
      { open: { day: 6, hour: 20, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
    ];
    expect(openStatus(bar, at(0, 1))).toEqual({ open: true, closesAt: "2:00 AM" });
    expect(openStatus(bar, at(0, 3))).toEqual({ open: false, opensAt: "Sat 8:00 PM" });
  });

  it("treats a period without close as open 24 hours", () => {
    expect(openStatus([{ open: { day: 0, hour: 0, minute: 0 } }], at(3, 3))).toEqual({
      open: true,
      closesAt: null,
    });
  });

  it("is closed with no reopening when there are no periods", () => {
    expect(openStatus([], at(2, 12))).toEqual({ open: false, opensAt: null });
  });
});

describe("formatClock", () => {
  it("prints 12-hour times like Google's weekdayDescriptions", () => {
    expect(formatClock(0, 5)).toBe("12:05 AM");
    expect(formatClock(12, 0)).toBe("12:00 PM");
    expect(formatClock(19, 30)).toBe("7:30 PM");
  });
});

describe("nowInZone", () => {
  it("reads the weekday and clock in the business's zone, not UTC", () => {
    // Saturday 20:00 UTC is Sunday 01:30 in Kolkata.
    const utc = new Date("2026-09-12T20:00:00Z");
    expect(nowInZone(utc, "Asia/Kolkata")).toEqual({ day: 0, minutes: 90 });
    expect(nowInZone(utc, "UTC")).toEqual({ day: 6, minutes: 20 * 60 });
  });

  it("never yields hour 24 at midnight", () => {
    const midnight = new Date("2026-09-13T18:30:00Z"); // 00:00 IST Monday
    expect(nowInZone(midnight, "Asia/Kolkata")).toEqual({ day: 1, minutes: 0 });
  });
});
