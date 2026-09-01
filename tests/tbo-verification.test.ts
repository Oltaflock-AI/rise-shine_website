import { afterEach, describe, expect, it, vi } from "vitest";

const CERT_HOST = "https://affiliate.tektravels.com/HotelAPI";
const LIVE_HOST = "https://api.tbotechnology.in/HotelAPI";

/** Re-import with a fresh module registry — the token is read at module load. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/tbo-verification");
}

afterEach(() => {
  delete process.env.TBO_VERIFICATION_TOKEN;
  delete process.env.TBO_HOTEL_URL;
  delete process.env.TBO_HOTEL_BE_URL;
});

describe("TBO verification token", () => {
  const BASE = { TBO_HOTEL_URL: CERT_HOST, TBO_HOTEL_BE_URL: CERT_HOST };

  it("is absent, not open, when no token is configured", async () => {
    const m = await load({ ...BASE, TBO_VERIFICATION_TOKEN: undefined });
    expect(m.tboVerificationConfigured).toBe(false);
    expect(m.tokenMatches("")).toBe(false);
    expect(m.tokenMatches("anything")).toBe(false);
  });

  it("treats an empty or whitespace token as unconfigured", async () => {
    const m = await load({ ...BASE, TBO_VERIFICATION_TOKEN: "   " });
    expect(m.tboVerificationConfigured).toBe(false);
    expect(m.tokenMatches("   ")).toBe(false);
  });

  it("matches only the exact token", async () => {
    const m = await load({ ...BASE, TBO_VERIFICATION_TOKEN: "s3cret-token" });
    expect(m.tokenMatches("s3cret-token")).toBe(true);
    expect(m.tokenMatches("s3cret-toke")).toBe(false); // shorter — must not throw
    expect(m.tokenMatches("s3cret-token-plus")).toBe(false); // longer
    expect(m.tokenMatches("S3CRET-TOKEN")).toBe(false);
    expect(m.tokenMatches("")).toBe(false);
  });

  it("never opens a session against live hotel hosts, token or not", async () => {
    const m = await load({
      TBO_HOTEL_URL: LIVE_HOST,
      TBO_HOTEL_BE_URL: LIVE_HOST,
      TBO_VERIFICATION_TOKEN: "s3cret-token",
    });
    await expect(m.hotelVerificationSession()).resolves.toBe(false);
  });
});
