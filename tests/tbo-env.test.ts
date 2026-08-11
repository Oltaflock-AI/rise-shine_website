import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The guard that keeps live TBO credentials from issuing free tickets. tbo-env reads
 * process.env at call time, but import it fresh per case anyway so a future move to
 * module-level constants fails loudly here rather than silently in production.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/tbo-env");
}

const LIVE_AUTH = "https://api.travelboutiqueonline.com/SharedAPI/SharedData.svc/rest";
const LIVE_SEARCH = "https://tboapi.travelboutiqueonline.com/AirAPI_V10/AirService.svc/rest";
const LIVE_BOOK = "https://booking.travelboutiqueonline.com/AirAPI_V10/AirService.svc/rest";
const CLEARED = { TBO_AUTH_URL: undefined, TBO_SEARCH_URL: undefined, TBO_BOOK_URL: undefined };

afterEach(() => {
  for (const k of Object.keys(CLEARED)) delete process.env[k];
});

describe("tboIsLive", () => {
  it("is false when no service URLs are set (staging defaults)", async () => {
    const { tboIsLive } = await load(CLEARED);
    expect(tboIsLive()).toBe(false);
  });

  it("is false for the staging hosts", async () => {
    const { tboIsLive } = await load({
      ...CLEARED,
      TBO_AUTH_URL: "http://Sharedapi.tektravels.com/SharedData.svc/rest",
      TBO_SEARCH_URL: "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest",
    });
    expect(tboIsLive()).toBe(false);
  });

  it.each([
    ["auth", { TBO_AUTH_URL: LIVE_AUTH }],
    ["search", { TBO_SEARCH_URL: LIVE_SEARCH }],
    ["book", { TBO_BOOK_URL: LIVE_BOOK }],
  ])("is true when only the %s host is live", async (_name, env) => {
    const { tboIsLive } = await load({ ...CLEARED, ...env });
    expect(tboIsLive()).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const { tboIsLive } = await load({ ...CLEARED, TBO_BOOK_URL: LIVE_BOOK.toUpperCase() });
    expect(tboIsLive()).toBe(true);
  });
});

describe("bookingBlockedForMissingPayments", () => {
  it("blocks live TBO when Razorpay is not configured", async () => {
    const { bookingBlockedForMissingPayments } = await load({ ...CLEARED, TBO_BOOK_URL: LIVE_BOOK });
    expect(bookingBlockedForMissingPayments(false)).toBe(true);
  });

  it("allows live TBO once Razorpay is configured", async () => {
    const { bookingBlockedForMissingPayments } = await load({ ...CLEARED, TBO_BOOK_URL: LIVE_BOOK });
    expect(bookingBlockedForMissingPayments(true)).toBe(false);
  });

  it("leaves staging bookable without Razorpay, so certification demos still run", async () => {
    const { bookingBlockedForMissingPayments } = await load(CLEARED);
    expect(bookingBlockedForMissingPayments(false)).toBe(false);
  });
});
