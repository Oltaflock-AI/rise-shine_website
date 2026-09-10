import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The paid-and-bound gate — the only thing standing between "a customer paid" and
 * "we issue a ticket or hold a room".
 *
 * This had NO coverage until 10-Sep-2026, while being the code that decides whether
 * money is real. `fetch` is stubbed so the branches can be driven without a gateway.
 */
async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  const base = {
    CASHFREE_APP_ID: "live_app",
    CASHFREE_SECRET_KEY: "live_secret",
    CASHFREE_ENV: "production",
    TBO_HOTEL_URL: undefined,
    TBO_HOTEL_BE_URL: undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...env })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/cashfree");
}

type Route = { order?: unknown; payments?: unknown };

/** Answer Get Order and Get Payments, and record the URLs actually called. */
function stubGateway(route: Route) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    const body = String(url).endsWith("/payments") ? route.payments : route.order;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body ?? {}),
    } as unknown as Response;
  });
  return calls;
}

const PAID = (bind: string) => ({ order_id: "rsh_1", order_status: "PAID", order_tags: { bind } });
const SUCCESS = [{ cf_payment_id: 99, payment_status: "SUCCESS", payment_amount: 170.5, payment_group: "upi" }];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["CASHFREE_APP_ID","CASHFREE_SECRET_KEY","CASHFREE_ENV","CASHFREE_SANDBOX_APP_ID","CASHFREE_SANDBOX_SECRET_KEY","TBO_HOTEL_URL","TBO_HOTEL_BE_URL"]) delete process.env[k];
});

describe("binding a payment to a booking", () => {
  it("gives a different hash per booking, and the same hash for the same booking", async () => {
    const { hotelBind, flightBind } = await load();
    expect(hotelBind("CODE_A")).toBe(hotelBind("CODE_A"));
    expect(hotelBind("CODE_A")).not.toBe(hotelBind("CODE_B"));
    expect(flightBind("t1", "r1")).not.toBe(flightBind("t1", "r2"));
  });

  // Without this, "hotel" and "flight" could collide on a shared identifier.
  it("never collides across products", async () => {
    const { hotelBind, flightBind } = await load();
    expect(hotelBind("x")).not.toBe(flightBind("x", ""));
  });
});

describe("confirmPaidOrder", () => {
  it("accepts a PAID order whose bind matches, and reports the PAYMENT amount", async () => {
    const { confirmPaidOrder, hotelBind } = await load();
    const bind = hotelBind("CODE_A");
    stubGateway({ order: PAID(bind), payments: SUCCESS });
    const r = await confirmPaidOrder({ orderId: "rsh_1", expectBind: bind, kind: "hotel" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    // The order total is the wrong number downstream — Cashfree rejects a refund above
    // the transaction, so this must be payment_amount.
    expect(r.payment.amountInr).toBe(170.5);
    expect(r.payment.cfPaymentId).toBe("99");
  });

  it("refuses an order that has not been paid", async () => {
    const { confirmPaidOrder, hotelBind } = await load();
    stubGateway({ order: { order_id: "rsh_1", order_status: "ACTIVE" } });
    const r = await confirmPaidOrder({ orderId: "rsh_1", expectBind: hotelBind("CODE_A"), kind: "hotel" });
    if (r.ok) throw new Error("expected refusal");
    expect(r.unpaid).toBe(true);
  });

  // The anti-replay case: pay ₹1 on booking A, present it against booking B.
  it("refuses a PAID order that was bound to a DIFFERENT booking", async () => {
    const { confirmPaidOrder, hotelBind } = await load();
    stubGateway({ order: PAID(hotelBind("CHEAP_ROOM")), payments: SUCCESS });
    const r = await confirmPaidOrder({
      orderId: "rsh_1",
      expectBind: hotelBind("EXPENSIVE_ROOM"),
      kind: "hotel",
    });
    if (r.ok) throw new Error("expected refusal");
    // Not "unpaid" — the money is real, it just belongs to another booking, so this
    // must NOT be refunded here.
    expect(r.unpaid).toBe(false);
    expect(r.error).toMatch(/does not belong/i);
  });

  it("refuses when the order says PAID but no payment actually succeeded", async () => {
    const { confirmPaidOrder, hotelBind } = await load();
    const bind = hotelBind("CODE_A");
    stubGateway({ order: PAID(bind), payments: [{ cf_payment_id: 1, payment_status: "FAILED" }] });
    const r = await confirmPaidOrder({ orderId: "rsh_1", expectBind: bind, kind: "hotel" });
    if (r.ok) throw new Error("expected refusal");
    expect(r.unpaid).toBe(true);
  });

  it("reads a hotel order from the SANDBOX account during certification", async () => {
    const { confirmPaidOrder, hotelBind } = await load({
      CASHFREE_SANDBOX_APP_ID: "test_app",
      CASHFREE_SANDBOX_SECRET_KEY: "test_secret",
    });
    const bind = hotelBind("CODE_A");
    const calls = stubGateway({ order: PAID(bind), payments: SUCCESS });
    await confirmPaidOrder({ orderId: "rsh_1", expectBind: bind, kind: "hotel" });
    expect(calls.every((u) => u.startsWith("https://sandbox.cashfree.com/pg"))).toBe(true);
  });

  it("reads a FLIGHT order from the live account even when a sandbox pair exists", async () => {
    const { confirmPaidOrder, flightBind } = await load({
      CASHFREE_SANDBOX_APP_ID: "test_app",
      CASHFREE_SANDBOX_SECRET_KEY: "test_secret",
    });
    const bind = flightBind("t1", "r1");
    const calls = stubGateway({ order: PAID(bind), payments: SUCCESS });
    await confirmPaidOrder({ orderId: "rsf_1", expectBind: bind, kind: "flight" });
    expect(calls.every((u) => u.startsWith("https://api.cashfree.com/pg"))).toBe(true);
  });
});
