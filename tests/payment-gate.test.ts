/**
 * The gate that decides whether a customer must pay before we hand them a ticket.
 *
 * Getting this wrong is not a bug that shows up in a log — it is real inventory
 * leaving on real agency credit for nothing. The specific failure it guards:
 * "must the customer pay?" used to be answered by "are two env strings present?",
 * so clearing or rotating RAZORPAY_* in Vercel silently turned the public site
 * into a free ticket dispenser against live TBO credentials.
 *
 * `razorpayConfigured` is a module-level const (env read at import), so every case
 * resets the module registry and re-imports under the env it wants to assert on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = { RAZORPAY_KEY_ID: "rzp_test_abc123", RAZORPAY_KEY_SECRET: "secret_xyz789" };

/** Load lib/razorpay fresh under an exact env. `undefined` unsets a variable. */
async function loadGate(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/razorpay");
}

const withKeys = (extra: Record<string, string | undefined> = {}) =>
  loadGate({ ...KEYS, PAYMENTS_REQUIRED: undefined, ...extra });
const withoutKeys = (extra: Record<string, string | undefined> = {}) =>
  loadGate({ RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, PAYMENTS_REQUIRED: undefined, ...extra });

afterEach(() => {
  delete process.env.PAYMENTS_REQUIRED;
});

describe("PAYMENTS_REQUIRED unset — historical behaviour is preserved exactly", () => {
  it("requires payment when Razorpay keys are present", async () => {
    const { paymentsRequired, paymentsMisconfigured } = await withKeys();
    expect(paymentsRequired()).toBe(true);
    expect(paymentsMisconfigured()).toBe(false);
  });

  it("allows the direct-ticket path when keys are absent (dev/staging demo)", async () => {
    const { paymentsRequired, paymentsMisconfigured } = await withoutKeys();
    expect(paymentsRequired()).toBe(false);
    expect(paymentsMisconfigured()).toBe(false);
  });
});

describe("PAYMENTS_REQUIRED=true — the live-credentials kill switch", () => {
  it("fails CLOSED when the keys are missing, instead of ticketing for free", async () => {
    const { paymentsRequired, paymentsMisconfigured } = await withoutKeys({ PAYMENTS_REQUIRED: "true" });
    expect(paymentsRequired()).toBe(true);
    // The whole point: no keys AND payment mandatory must mean "refuse", never "skip".
    expect(paymentsMisconfigured()).toBe(true);
  });

  it("charges normally when the keys are present", async () => {
    const { paymentsRequired, paymentsMisconfigured } = await withKeys({ PAYMENTS_REQUIRED: "true" });
    expect(paymentsRequired()).toBe(true);
    expect(paymentsMisconfigured()).toBe(false);
  });

  it("survives a half-cleared key pair — one key alone cannot charge", async () => {
    const { paymentsRequired, paymentsMisconfigured } = await loadGate({
      RAZORPAY_KEY_ID: KEYS.RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET: undefined,
      PAYMENTS_REQUIRED: "true",
    });
    expect(paymentsRequired()).toBe(true);
    expect(paymentsMisconfigured()).toBe(true);
  });
});

describe("PAYMENTS_REQUIRED=false — unpaid ticketing must be a deliberate act", () => {
  it("opts out even though the keys would otherwise enforce payment", async () => {
    const { paymentsRequired, paymentsMisconfigured } = await withKeys({ PAYMENTS_REQUIRED: "false" });
    expect(paymentsRequired()).toBe(false);
    expect(paymentsMisconfigured()).toBe(false);
  });
});

describe("value parsing", () => {
  it.each(["true", "TRUE", " True ", "1"])("treats %j as required", async (v) => {
    const { paymentsRequired } = await withoutKeys({ PAYMENTS_REQUIRED: v });
    expect(paymentsRequired()).toBe(true);
  });

  it.each(["false", "FALSE", " False ", "0"])("treats %j as not required", async (v) => {
    const { paymentsRequired } = await withKeys({ PAYMENTS_REQUIRED: v });
    expect(paymentsRequired()).toBe(false);
  });

  it("ignores an unparseable value and falls back to key presence", async () => {
    // A typo must not be read as "payments off" — it defers to the keys, which
    // with live credentials present means payment stays enforced.
    const { paymentsRequired } = await withKeys({ PAYMENTS_REQUIRED: "yes-please" });
    expect(paymentsRequired()).toBe(true);
  });

  it("re-reads the variable per call, so the switch works without a redeploy", async () => {
    const { paymentsRequired } = await withKeys({ PAYMENTS_REQUIRED: "false" });
    expect(paymentsRequired()).toBe(false);
    process.env.PAYMENTS_REQUIRED = "true";
    expect(paymentsRequired()).toBe(true);
  });
});
