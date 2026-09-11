import { describe, expect, it } from "vitest";
import { isActivityEvent, sanitizeActivityProps } from "../src/lib/activity";

/**
 * The activity log's prop whitelist. Rows are read casually by the whole team
 * on the admin dashboard, so the guard against identifying data leaking into a
 * timeline is this function, not reviewer vigilance at every call site.
 */
describe("sanitizeActivityProps", () => {
  it("keeps whitelisted scalar props", () => {
    expect(
      sanitizeActivityProps({ kind: "flight", from: "AMD", to: "DXB", adults: 2, results: 40 }),
    ).toEqual({ kind: "flight", from: "AMD", to: "DXB", adults: 2, results: 40 });
  });

  it("drops anything off the whitelist, however it got there", () => {
    const props = {
      from: "AMD",
      pan: "ABCDE1234F",
      passport: "Z1234567",
      email: "a@b.c",
      firstName: "Hardik",
    } as unknown as Parameters<typeof sanitizeActivityProps>[0];
    expect(sanitizeActivityProps(props)).toEqual({ from: "AMD" });
  });

  it("drops null, undefined, empty, NaN and object values", () => {
    const props = {
      from: null,
      to: undefined,
      city: "   ",
      adults: Number.NaN,
      hotel: { name: "x" },
    } as unknown as Parameters<typeof sanitizeActivityProps>[0];
    expect(sanitizeActivityProps(props)).toEqual({});
  });

  it("trims and caps long strings", () => {
    const long = "x".repeat(500);
    const out = sanitizeActivityProps({ hotel: `  ${long}  ` });
    expect((out.hotel as string).length).toBe(120);
  });

  it("returns an empty bag for no props", () => {
    expect(sanitizeActivityProps(undefined)).toEqual({});
  });
});

describe("isActivityEvent", () => {
  it("accepts only the known event names", () => {
    expect(isActivityEvent("search_flights")).toBe(true);
    expect(isActivityEvent("booking_confirmed")).toBe(true);
    expect(isActivityEvent("page_view")).toBe(false);
    expect(isActivityEvent("")).toBe(false);
    expect(isActivityEvent(42)).toBe(false);
  });
});
