import { describe, expect, it } from "vitest";
import { bookingStatusLabel, describeEvent, fmtAgo, fmtDate, fmtInr } from "../lib/customer-format";

describe("fmtDate / fmtInr / fmtAgo", () => {
  it("renders DD-MM-YY from ISO dates and timestamps", () => {
    expect(fmtDate("2026-09-23")).toBe("23-09-26");
    expect(fmtDate("2026-09-23T10:11:12.000Z")).toBe("23-09-26");
    expect(fmtDate(null)).toBe("—");
  });
  it("formats rupees Indian-style, unrounded input tolerated", () => {
    expect(fmtInr(1234567.4)).toBe("₹12,34,567");
    expect(fmtInr(null)).toBe("—");
  });
  it("gives a relative age", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    expect(fmtAgo("2026-09-11T11:59:30Z", now)).toBe("just now");
    expect(fmtAgo("2026-09-11T09:00:00Z", now)).toBe("3h ago");
    expect(fmtAgo("2026-09-01T09:00:00Z", now)).toBe("10d ago");
    expect(fmtAgo("2026-03-01T09:00:00Z", now)).toBe("6mo ago");
  });
});

describe("bookingStatusLabel", () => {
  it("maps TBO flight status 5 to Ticketed and hotels to Confirmed", () => {
    expect(bookingStatusLabel("flight", 5)).toEqual({ label: "Ticketed", tone: "ok" });
    expect(bookingStatusLabel("flight", 3).tone).toBe("fail");
    expect(bookingStatusLabel("hotel", 1)).toEqual({ label: "Confirmed", tone: "ok" });
  });
});

describe("describeEvent", () => {
  it("turns a flight search into a readable line", () => {
    const d = describeEvent({
      event: "search_flights",
      props: { from: "AMD", to: "DXB", depart: "2026-10-02", adults: 2, results: 31 },
    });
    expect(d.title).toBe("Searched flights AMD → DXB");
    expect(d.detail).toBe("02-10-26 · 2 adults · 31 results");
  });
  it("shows the PNR and amount on a confirmed booking", () => {
    const d = describeEvent({
      event: "booking_confirmed",
      props: { kind: "flight", from: "AMD", to: "BOM", pnr: "X7Y8Z9", amountInr: 4500 },
    });
    expect(d.title).toBe("Booking confirmed AMD → BOM");
    expect(d.detail).toBe("PNR X7Y8Z9 · ₹4,500");
  });
  it("degrades gracefully with no props and unknown events", () => {
    expect(describeEvent({ event: "search_hotels", props: {} })).toEqual({ title: "Searched hotels", detail: null });
    expect(describeEvent({ event: "something_new", props: {} }).title).toBe("something new");
  });
});
