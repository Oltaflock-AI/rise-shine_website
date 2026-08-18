/**
 * Cashfree webhook signature verification.
 *
 * Isolated crypto only — no network, no Cashfree account. The value here is guarding
 * the two things that silently break a live webhook: signing `timestamp + rawBody`
 * (not the body alone), and base64 (not hex) output. Either mistake makes every real
 * event fail verification while the endpoint still returns 400s that look like an
 * attack rather than a bug.
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "@/lib/cashfree";

const SECRET = "cfsk_ma_test_0123456789abcdef";

beforeAll(() => {
  process.env.CASHFREE_SECRET_KEY = SECRET;
  delete process.env.CASHFREE_WEBHOOK_SECRET;
});

function sign(timestamp: string, body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}${body}`).digest("base64");
}

describe("verifyWebhookSignature", () => {
  // Decimals kept as sent: re-serializing turns 170.00 into 170 and breaks the signature.
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"payment":{"payment_amount":170.00}}}';
  const ts = "1785401067911";

  it("accepts a correctly signed webhook", () => {
    expect(verifyWebhookSignature(body, sign(ts, body), ts)).toBe(true);
  });

  it("rejects a body signed without the timestamp prefix", () => {
    const bodyOnly = crypto.createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyWebhookSignature(body, bodyOnly, ts)).toBe(false);
  });

  it("rejects a hex-encoded signature", () => {
    const hex = crypto.createHmac("sha256", SECRET).update(`${ts}${body}`).digest("hex");
    expect(verifyWebhookSignature(body, hex, ts)).toBe(false);
  });

  it("rejects a replayed signature against a different timestamp", () => {
    expect(verifyWebhookSignature(body, sign(ts, body), "1785401067912")).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = sign(ts, body);
    expect(verifyWebhookSignature(body.replace("170.00", "1.00"), sig, ts)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign(ts, body, "wrong-secret"), ts)).toBe(false);
  });

  it("refuses when the timestamp header is missing", () => {
    expect(verifyWebhookSignature(body, sign(ts, body), "")).toBe(false);
  });

  it("refuses when no secret is configured", () => {
    const prev = process.env.CASHFREE_SECRET_KEY;
    delete process.env.CASHFREE_SECRET_KEY;
    try {
      expect(verifyWebhookSignature(body, sign(ts, body), ts)).toBe(false);
    } finally {
      process.env.CASHFREE_SECRET_KEY = prev;
    }
  });
});
