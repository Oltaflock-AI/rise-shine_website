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
const CLEARED = {
  TBO_AUTH_URL: undefined,
  TBO_SEARCH_URL: undefined,
  TBO_BOOK_URL: undefined,
  TBO_HOTEL_URL: undefined,
  TBO_HOTEL_BE_URL: undefined,
};

/** TBO's certification hotel hosts (the defaults) vs a live-looking one. */
const LIVE_HOTEL = "https://api.tbotechnology.in/HotelAPI";
const LIVE_HOTEL_BE = "https://hotelbe.travelboutiqueonline.com/hotelservice.svc/rest";

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
  it("blocks live TBO when Cashfree is not configured", async () => {
    const { bookingBlockedForMissingPayments } = await load({ ...CLEARED, TBO_BOOK_URL: LIVE_BOOK });
    expect(bookingBlockedForMissingPayments(false)).toBe(true);
  });

  it("allows live TBO once Cashfree is configured", async () => {
    const { bookingBlockedForMissingPayments } = await load({ ...CLEARED, TBO_BOOK_URL: LIVE_BOOK });
    expect(bookingBlockedForMissingPayments(true)).toBe(false);
  });

  it("leaves staging bookable without Cashfree, so certification demos still run", async () => {
    const { bookingBlockedForMissingPayments } = await load(CLEARED);
    expect(bookingBlockedForMissingPayments(false)).toBe(false);
  });
});


/**
 * Hotels are judged on the HOTEL hosts, not the flight ones. Getting this wrong is not
 * theoretical: while the guard read the flight hosts, TBO's own portal verification
 * could not complete a single booking (17-Aug-2026) even though the hotel stack was
 * still on their certification host, where booking without a gateway is the intended
 * flow.
 */
describe("tboHotelIsLive", () => {
  it("is false on the default certification hosts", async () => {
    const { tboHotelIsLive } = await load(CLEARED);
    expect(tboHotelIsLive()).toBe(false);
  });

  it("is false when a live FLIGHT stack is configured but hotels are not", async () => {
    const { tboHotelIsLive, tboIsLive } = await load({ ...CLEARED, TBO_AUTH_URL: LIVE_AUTH, TBO_BOOK_URL: LIVE_BOOK });
    expect(tboIsLive()).toBe(true);
    expect(tboHotelIsLive()).toBe(false);
  });

  it.each([
    ["search/prebook", { TBO_HOTEL_URL: LIVE_HOTEL }],
    ["book", { TBO_HOTEL_BE_URL: LIVE_HOTEL_BE }],
  ])("is true when the %s host is not a certification host", async (_name, env) => {
    const { tboHotelIsLive } = await load({ ...CLEARED, ...env });
    expect(tboHotelIsLive()).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const { tboHotelIsLive } = await load({ ...CLEARED, TBO_HOTEL_URL: "HTTPS://AFFILIATE.TEKTRAVELS.COM/HotelAPI" });
    expect(tboHotelIsLive()).toBe(false);
  });
});

describe("hotel payment guards", () => {
  it("lets certification book without a gateway", async () => {
    const { hotelUnpaidBookingAllowed, hotelBookingBlockedForMissingPayments } = await load(CLEARED);
    expect(hotelUnpaidBookingAllowed(false)).toBe(true);
    expect(hotelBookingBlockedForMissingPayments(false)).toBe(false);
  });

  it("stops booking outright once the hotel stack is live and there is no gateway", async () => {
    const { hotelUnpaidBookingAllowed, hotelBookingBlockedForMissingPayments } = await load({
      ...CLEARED,
      TBO_HOTEL_URL: LIVE_HOTEL,
    });
    expect(hotelUnpaidBookingAllowed(false)).toBe(false);
    expect(hotelBookingBlockedForMissingPayments(false)).toBe(true);
  });

  it("requires payment as soon as a gateway exists, certification host or not", async () => {
    const { hotelUnpaidBookingAllowed } = await load(CLEARED);
    expect(hotelUnpaidBookingAllowed(true)).toBe(false);
  });

  it("allows live hotels once Cashfree is configured", async () => {
    const { hotelBookingBlockedForMissingPayments } = await load({ ...CLEARED, TBO_HOTEL_URL: LIVE_HOTEL });
    expect(hotelBookingBlockedForMissingPayments(true)).toBe(false);
  });
});

/**
 * The sandbox-keys-against-live-TBO hole.
 *
 * `cashfreeConfigured` is true for sandbox keys, so passing it to these guards would
 * let a live TBO ticket be issued for play money. The guards must be fed
 * `cashfreePaymentsLive` instead. These cases pin that distinction, because the two
 * flags are one word apart at the call site and swapping them fails silently.
 *
 * The argument below is `false` precisely because it stands in for sandbox Cashfree:
 * keys present, settling nothing.
 */
describe("live TBO requires LIVE payments, not merely configured ones", () => {
  it("blocks live flights when payments are configured but only in sandbox", async () => {
    const { bookingBlockedForMissingPayments } = await load({ ...CLEARED, TBO_SEARCH_URL: LIVE_SEARCH });
    expect(bookingBlockedForMissingPayments(false)).toBe(true);
  });

  it("blocks live hotels when payments are configured but only in sandbox", async () => {
    const { hotelBookingBlockedForMissingPayments } = await load({
      ...CLEARED,
      TBO_HOTEL_URL: LIVE_HOTEL,
      TBO_HOTEL_BE_URL: LIVE_HOTEL_BE,
    });
    expect(hotelBookingBlockedForMissingPayments(false)).toBe(true);
  });

  it("still lets certification hosts run unpaid, whatever the payment mode", async () => {
    const { hotelBookingBlockedForMissingPayments, hotelUnpaidBookingAllowed } = await load(CLEARED);
    expect(hotelBookingBlockedForMissingPayments(false)).toBe(false);
    expect(hotelUnpaidBookingAllowed(false)).toBe(true);
  });
});
