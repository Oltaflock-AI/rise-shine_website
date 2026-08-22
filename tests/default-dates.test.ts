import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultDates } from "../src/lib/tbo";

/**
 * A search that arrives with no dates defaults to TOMORROW, and "tomorrow" means
 * India's tomorrow — not the server's.
 *
 * Vercel runs UTC, 5h30m behind Asia/Kolkata. A naive `new Date()` + 1 day is
 * still *today* in IST for every request placed between 18:30 and 24:00 UTC, and
 * TBO rejects a same-day search once the day's departures have gone. These cases
 * pin that boundary so the trap cannot be reintroduced by "simplifying" the helper.
 */
describe("defaultDates — tomorrow in India, not on the server clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (utc: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(utc));
  };

  it("departs tomorrow and returns `nights` later", () => {
    at("2026-08-22T12:00:00Z"); // 17:30 IST on the 22nd
    expect(defaultDates()).toEqual({
      departISO: "2026-08-23",
      returnISO: "2026-08-30",
    });
  });

  it("uses IST's day, not UTC's, after 18:30 UTC", () => {
    at("2026-08-22T19:00:00Z"); // already 00:30 IST on the 23rd
    // Naive UTC arithmetic would say 2026-08-23 — which is TODAY in India.
    expect(defaultDates().departISO).toBe("2026-08-24");
  });

  it("rolls over the year on the same boundary", () => {
    at("2026-12-31T19:00:00Z"); // 00:30 IST on 1 Jan 2027
    expect(defaultDates().departISO).toBe("2027-01-02");
  });

  it("never returns a stay shorter than two nights", () => {
    at("2026-08-22T12:00:00Z");
    expect(defaultDates(1).returnISO).toBe("2026-08-25");
  });
});
