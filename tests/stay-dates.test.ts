import { describe, expect, it } from "vitest";
import { stayDatesError, todayInIndiaISO } from "../src/lib/stay-dates";

const at = (iso: string) => new Date(iso);

describe("todayInIndiaISO", () => {
  it("uses India's calendar date, not UTC's", () => {
    // 20:00 UTC is already the next day in Asia/Kolkata (+05:30).
    expect(todayInIndiaISO(at("2026-08-21T20:00:00Z"))).toBe("2026-08-22");
    expect(todayInIndiaISO(at("2026-08-21T10:00:00Z"))).toBe("2026-08-21");
  });
});

describe("stayDatesError", () => {
  const now = at("2026-08-21T10:00:00Z"); // 21 Aug in India

  it("passes a normal future stay", () => {
    expect(stayDatesError("2026-09-04", "2026-09-06", now)).toBeNull();
  });

  it("allows a check-in of today", () => {
    expect(stayDatesError("2026-08-21", "2026-08-22", now)).toBeNull();
  });

  it("rejects the stale-bookmark case that looked like a site outage", () => {
    expect(stayDatesError("2026-08-07", "2026-08-09", now)).toBe("past-check-in");
  });

  it("rejects a check-out on or before check-in", () => {
    expect(stayDatesError("2026-09-04", "2026-09-04", now)).toBe("check-out-before-check-in");
    expect(stayDatesError("2026-09-04", "2026-09-03", now)).toBe("check-out-before-check-in");
  });

  it("reports the past check-in first when both are wrong", () => {
    expect(stayDatesError("2026-08-07", "2026-08-01", now)).toBe("past-check-in");
  });
});
