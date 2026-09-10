import { describe, expect, it } from "vitest";
import { decideIntentAction, interpretClaim } from "../src/lib/booking-intents";

/**
 * What the settle cron does with a checkout nobody finished. Every branch here
 * either moves money or issues a ticket without a customer in the loop, so all
 * of them are pinned.
 */
const NOW = new Date("2026-09-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

const base = {
  kind: "flight" as const,
  status: "paid",
  createdAt: ago(6 * MIN),
  paidAt: ago(4 * MIN),
  claimedAt: null,
  searchedAt: NOW.getTime() - 8 * MIN,
  now: NOW,
};

describe("decideIntentAction", () => {
  it("leaves a fresh paid intent alone — the customer's own request is still on its way", () => {
    expect(decideIntentAction({ ...base, paidAt: ago(1 * MIN) })).toBe("wait");
  });

  it("completes a paid, unclaimed flight while its TraceId is still alive", () => {
    expect(decideIntentAction(base)).toBe("complete");
  });

  it("refunds instead once the TraceId is too old to book on", () => {
    // 13 min since search: Book itself takes time, and a TraceId dies at 15.
    expect(decideIntentAction({ ...base, searchedAt: NOW.getTime() - 13 * MIN })).toBe("refund");
  });

  it("never re-books a hotel from the cron — refund only", () => {
    expect(decideIntentAction({ ...base, kind: "hotel" })).toBe("refund");
  });

  it("does not trust an awaiting_payment row until the order could have expired", () => {
    // The webhook may simply be late. Nothing to do yet.
    expect(
      decideIntentAction({ ...base, status: "awaiting_payment", paidAt: null, createdAt: ago(10 * MIN) }),
    ).toBe("wait");
  });

  it("re-reads Cashfree once an awaiting_payment row is past the order's life", () => {
    expect(
      decideIntentAction({ ...base, status: "awaiting_payment", paidAt: null, createdAt: ago(25 * MIN) }),
    ).toBe("verify");
  });

  it("escalates a claim that outlived the booking function", () => {
    expect(decideIntentAction({ ...base, status: "ticketing", claimedAt: ago(9 * MIN) })).toBe("escalate");
  });

  it("gives a live claim time to finish", () => {
    expect(decideIntentAction({ ...base, status: "ticketing", claimedAt: ago(2 * MIN) })).toBe("wait");
  });

  it("ignores settled rows", () => {
    for (const status of ["ticketed", "refunded", "refund_failed", "expired"]) {
      expect(decideIntentAction({ ...base, status })).toBe("none");
    }
  });
});

describe("interpretClaim", () => {
  it("proceeds when the compare-and-swap won", () => {
    expect(interpretClaim({ won: true, status: "ticketing", result: null })).toEqual({ kind: "proceed" });
  });

  it("replays a finished booking rather than booking again", () => {
    const result = { ok: true, pnr: "ABC123" };
    expect(interpretClaim({ won: false, status: "ticketed", result })).toEqual({ kind: "replay", result });
  });

  it("replays a refund outcome too — the customer must hear they were refunded", () => {
    const result = { ok: false, error: "Ticketing failed. Your payment has been refunded.", refunded: true };
    expect(interpretClaim({ won: false, status: "refunded", result })).toEqual({ kind: "replay", result });
  });

  it("reports a booking still in flight instead of starting a second one", () => {
    expect(interpretClaim({ won: false, status: "ticketing", result: null })).toEqual({ kind: "busy" });
  });

  it("treats an unknown order as no intent — the legacy path decides", () => {
    expect(interpretClaim({ won: false, status: null, result: null })).toEqual({ kind: "missing" });
  });
});
