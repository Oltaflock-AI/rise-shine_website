import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Which Cashfree ACCOUNT answers a call.
 *
 * Hotels on TBO's certification hosts run on sandbox credentials so TBO's portal
 * verifier gets a real payment page without spending real money on a room that does not
 * exist. That convenience must never reach a live hotel host, where sandbox money would
 * hold a real room — the same hole `cashfreePaymentsLive` exists to close.
 *
 * cashfree.ts caches credentials at module scope, so every case re-imports.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/cashfree");
}

const LIVE_HOTEL = "https://api.tbotechnology.in/HotelAPI";
const LIVE_HOTEL_BE = "https://hotelbe.travelboutiqueonline.com/hotelservice.svc/rest";

/** Live gateway + sandbox pair present, hotels still on TBO certification hosts. */
const BOTH = {
  CASHFREE_APP_ID: "live_app",
  CASHFREE_SECRET_KEY: "live_secret",
  CASHFREE_ENV: "production",
  CASHFREE_SANDBOX_APP_ID: "test_app",
  CASHFREE_SANDBOX_SECRET_KEY: "test_secret",
  TBO_HOTEL_URL: undefined,
  TBO_HOTEL_BE_URL: undefined,
};

afterEach(() => {
  for (const k of Object.keys(BOTH)) delete process.env[k];
});

describe("cashfreeCredsFor", () => {
  it("uses the SANDBOX account for hotels while they are on certification hosts", async () => {
    const { cashfreeCredsFor } = await load(BOTH);
    const c = cashfreeCredsFor("hotel");
    expect(c.mode).toBe("sandbox");
    expect(c.appId).toBe("test_app");
    expect(c.api).toBe("https://sandbox.cashfree.com/pg");
  });

  it("uses the LIVE account for flights, even while hotels are on certification", async () => {
    const { cashfreeCredsFor } = await load(BOTH);
    const c = cashfreeCredsFor("flight");
    expect(c.mode).toBe("production");
    expect(c.appId).toBe("live_app");
    expect(c.api).toBe("https://api.cashfree.com/pg");
  });

  // The whole safety story. Sandbox money must never be able to hold a real room.
  it("uses the LIVE account for hotels once ANY hotel service is live", async () => {
    for (const live of [{ TBO_HOTEL_URL: LIVE_HOTEL }, { TBO_HOTEL_BE_URL: LIVE_HOTEL_BE }]) {
      const { cashfreeCredsFor } = await load({ ...BOTH, ...live });
      const c = cashfreeCredsFor("hotel");
      expect(c.mode).toBe("production");
      expect(c.appId).toBe("live_app");
    }
  });

  it("falls back to the live account when no sandbox pair is configured", async () => {
    const { cashfreeCredsFor } = await load({
      ...BOTH,
      CASHFREE_SANDBOX_APP_ID: undefined,
      CASHFREE_SANDBOX_SECRET_KEY: undefined,
    });
    expect(cashfreeCredsFor("hotel").appId).toBe("live_app");
  });

  it("needs BOTH halves of the sandbox pair, not one", async () => {
    const { cashfreeCredsFor } = await load({ ...BOTH, CASHFREE_SANDBOX_SECRET_KEY: undefined });
    expect(cashfreeCredsFor("hotel").appId).toBe("live_app");
  });

  // A call site that forgets to say "hotel" must fail loudly (order not found on the
  // live account), never quietly move money on the wrong one.
  it("defaults to the live account when no kind is given", async () => {
    const { cashfreeCredsFor } = await load(BOTH);
    expect(cashfreeCredsFor().appId).toBe("live_app");
  });

  it("still reports payments as live — the flag describes the FLIGHT account", async () => {
    const { cashfreePaymentsLive, cashfreeConfigured } = await load(BOTH);
    expect(cashfreeConfigured).toBe(true);
    expect(cashfreePaymentsLive).toBe(true);
  });
});

describe("webhook signatures accept either account", () => {
  async function signed(secret: string) {
    const crypto = await import("node:crypto");
    const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_amount":170.00}}}';
    const ts = "1757000000";
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${ts}${body}`)
      .digest("base64");
    return { body, ts, sig };
  }

  it("verifies a webhook signed by the LIVE secret", async () => {
    const { verifyWebhookSignature } = await load(BOTH);
    const { body, ts, sig } = await signed("live_secret");
    expect(verifyWebhookSignature(body, sig, ts)).toBe(true);
  });

  it("verifies a webhook signed by the SANDBOX secret", async () => {
    const { verifyWebhookSignature } = await load(BOTH);
    const { body, ts, sig } = await signed("test_secret");
    expect(verifyWebhookSignature(body, sig, ts)).toBe(true);
  });

  it("rejects a signature from neither account", async () => {
    const { verifyWebhookSignature } = await load(BOTH);
    const { body, ts, sig } = await signed("someone_elses_secret");
    expect(verifyWebhookSignature(body, sig, ts)).toBe(false);
  });
});
