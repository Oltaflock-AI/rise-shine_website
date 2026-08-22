import { describe, expect, it } from "vitest";
import { formatDate, formatDateWithDay, weekdayOf } from "../src/lib/format-date";

describe("weekdayOf", () => {
  it("names the day of a plain ISO date", () => {
    expect(weekdayOf("2026-08-23")).toBe("Sunday");
    expect(weekdayOf("2026-08-24")).toBe("Monday");
  });

  it("reads a TBO datetime as the airport's own day, with no timezone shift", () => {
    // TBO sends local airport time with no zone. `new Date(...)` would treat the
    // bare date as UTC midnight and slide a day backwards west of Greenwich.
    expect(weekdayOf("2026-08-23T00:05:00")).toBe("Sunday");
    expect(weekdayOf("2026-08-23T23:55:00")).toBe("Sunday");
  });

  it("returns empty for junk rather than 'Invalid Date'", () => {
    expect(weekdayOf("")).toBe("");
    expect(weekdayOf(null)).toBe("");
    expect(weekdayOf("not-a-date")).toBe("");
  });
});

describe("formatDateWithDay", () => {
  it("keeps the site's DD-MM-YY and leads with the weekday", () => {
    expect(formatDateWithDay("2026-08-23T09:05:00")).toBe("Sunday, 23-08-26");
    expect(formatDate("2026-08-23T09:05:00")).toBe("23-08-26");
  });

  it("is empty when there is no date to show", () => {
    expect(formatDateWithDay(undefined)).toBe("");
  });
});
