/**
 * TBO issues production hosts separately from production credentials, so a live
 * cutover must be reachable from config alone. These bases were string literals
 * until now, which meant "switch endpoints from staging" (README's own go-live
 * step) required editing two files and shipping a deploy.
 *
 * Two properties matter and neither is visible until the cutover itself:
 *   - the defaults must stay byte-identical to the endpoints certification passed on
 *   - an override must reach BOTH tbo.ts (Search) and tbo-book.ts (FareQuote/SSR/Book)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const STAGING_AUTH = "http://Sharedapi.tektravels.com/SharedData.svc/rest";
const STAGING_AIR = "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest";

async function loadTbo(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/tbo");
}

afterEach(() => {
  delete process.env.TBO_AUTH_URL;
  delete process.env.TBO_AIR_URL;
});

describe("defaults", () => {
  it("keeps the certified staging endpoints when nothing is overridden", async () => {
    const { AUTH_BASE, AIR_BASE } = await loadTbo({ TBO_AUTH_URL: undefined, TBO_AIR_URL: undefined });
    expect(AUTH_BASE).toBe(STAGING_AUTH);
    expect(AIR_BASE).toBe(STAGING_AIR);
  });
});

describe("production overrides", () => {
  it("honours TBO_AUTH_URL and TBO_AIR_URL", async () => {
    const { AUTH_BASE, AIR_BASE } = await loadTbo({
      TBO_AUTH_URL: "https://prod-shared.example.com/SharedData.svc/rest",
      TBO_AIR_URL: "https://prod-air.example.com/AirService.svc/rest",
    });
    expect(AUTH_BASE).toBe("https://prod-shared.example.com/SharedData.svc/rest");
    expect(AIR_BASE).toBe("https://prod-air.example.com/AirService.svc/rest");
  });

  it("strips a trailing slash, so a pasted URL cannot produce a double slash", async () => {
    // TBO's emails routinely include the trailing slash; `${base}/Search` would
    // otherwise build .../rest//Search, which TBO answers with its
    // "Invalid Resource Requested" plain-text body rather than a useful error.
    const { AUTH_BASE, AIR_BASE } = await loadTbo({
      TBO_AUTH_URL: "https://prod-shared.example.com/SharedData.svc/rest/",
      TBO_AIR_URL: "https://prod-air.example.com/AirService.svc/rest///",
    });
    expect(AUTH_BASE).toBe("https://prod-shared.example.com/SharedData.svc/rest");
    expect(AIR_BASE).toBe("https://prod-air.example.com/AirService.svc/rest");
  });

  it("applies the same override to the booking flow, not just Search", async () => {
    // tbo-book.ts imports the bases from tbo.ts precisely so these cannot drift.
    // A cutover that moved Search but left FareQuote/Book on staging would fail
    // mid-booking, after the customer had already paid.
    vi.resetModules();
    process.env.TBO_AIR_URL = "https://prod-air.example.com/AirService.svc/rest";
    process.env.TBO_AUTH_URL = "https://prod-shared.example.com/SharedData.svc/rest";
    const { resolvedServiceUrls } = await import("@/lib/tbo-book");
    expect(resolvedServiceUrls()).toMatchObject({
      auth: "https://prod-shared.example.com/SharedData.svc/rest",
      air: "https://prod-air.example.com/AirService.svc/rest",
    });
  });

  it("routes Book to its own host, which production serves separately from Air", async () => {
    // Staging served Book from the Air service; production does not. A cutover that
    // set TBO_AIR_URL but forgot TBO_BOOK_URL would search live and book nowhere.
    vi.resetModules();
    process.env.TBO_AIR_URL = "https://prod-air.example.com/AirService.svc/rest";
    process.env.TBO_BOOK_URL = "https://prod-booking.example.com/AirAPI_V10/AirService.svc/rest/";
    const { resolvedServiceUrls } = await import("@/lib/tbo-book");
    const urls = resolvedServiceUrls();
    expect(urls.book).toBe("https://prod-booking.example.com/AirAPI_V10/AirService.svc/rest");
    expect(urls.book).not.toBe(urls.air);
    delete process.env.TBO_BOOK_URL;
  });
});
