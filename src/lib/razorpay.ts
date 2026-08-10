import "server-only";

/**
 * Razorpay payments — SERVER ONLY.
 *
 * The gateway that collects money before we issue a TBO ticket. Raw REST + HMAC
 * (Node `crypto`) rather than the SDK, to match the repo's provider style
 * (see lib/tbo.ts) and avoid a dependency. The browser still loads Razorpay's
 * hosted checkout.js to open the payment modal; everything that touches the
 * key secret (order creation, signature verification, capture check, refund)
 * happens here on the server.
 *
 * Flow ownership:
 *   1. /api/payment/order  → createOrder() for the authoritative FareQuote amount
 *   2. Razorpay Checkout    → customer pays (auto-captured)
 *   3. /api/book            → verifyPaymentSignature() + fetchPayment()/fetchOrder()
 *                             confirm the capture BEFORE calling TBO; refundPayment()
 *                             if ticketing then fails.
 *
 * Everything degrades: with no keys, `razorpayConfigured` is false and the
 * booking flow falls back to its legacy direct-ticket path (dev/staging).
 */
import crypto from "node:crypto";

const API = "https://api.razorpay.com/v1";

/** True once both keys are present. Says only that we CAN charge, not that we must. */
export const razorpayConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
);

/**
 * Whether a captured payment is REQUIRED before we hand a ticket to a customer.
 *
 * This used to be inferred from `razorpayConfigured` alone, which quietly ties a
 * money decision to the presence of two strings: clear the keys in Vercel — by
 * accident, or while rotating them — and every booking route silently reverts to
 * issuing real tickets on real agency credit for free. On TBO staging that spends
 * test credit; on LIVE credentials it is unpriced inventory going out of the door.
 *
 * So the answer is declared, not inferred:
 *
 *   unset          follow razorpayConfigured — exactly the historical behaviour,
 *                  so dev/staging without keys keep their direct-ticket demo path
 *   "true"/"1"     payment is mandatory. If the keys are missing or broken we FAIL
 *                  CLOSED (booking refused) rather than falling through to a free
 *                  ticket. Set this in the same change that installs live TBO creds.
 *   "false"/"0"    explicit opt-out — unpaid ticketing is deliberate. Dev only.
 *
 * Read per call (not a module const) so flipping it in Vercel takes effect on the
 * next invocation instead of waiting for a redeploy — the same property the kill
 * switch is useful for in the first place.
 */
export function paymentsRequired(): boolean {
  const v = process.env.PAYMENTS_REQUIRED?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return razorpayConfigured;
}

/**
 * Payment is required but we cannot actually charge — the misconfiguration that
 * must never silently degrade into free ticketing. Callers refuse the booking.
 */
export function paymentsMisconfigured(): boolean {
  return paymentsRequired() && !razorpayConfigured;
}

/** The publishable key id — safe to hand to the browser (secret never leaves the server). */
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";

export class RazorpayError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "RazorpayError";
    this.status = status;
  }
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function rp(path: string, opts: { method?: string; json?: unknown } = {}): Promise<Json> {
  const r = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    cache: "no-store",
  });
  const text = await r.text();
  let data: Json;
  try {
    data = JSON.parse(text) as Json;
  } catch {
    throw new RazorpayError(`Razorpay returned a non-JSON response: ${text.slice(0, 120)}`, r.status);
  }
  if (!r.ok) {
    throw new RazorpayError(data?.error?.description || `Razorpay request failed (${r.status}).`, r.status);
  }
  return data;
}

export type RpOrder = {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
  receipt?: string;
  notes?: Record<string, string>;
};

/**
 * Create an order for `amountInr` (rupees → paise). `payment_capture: 1` auto-captures
 * on a successful payment — UPI (the dominant Indian method) does not support
 * authorize-then-capture, so we capture up front and refund on any ticketing failure.
 */
export async function createOrder(args: {
  amountInr: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RpOrder> {
  const amount = Math.round(args.amountInr * 100);
  return rp("/orders", {
    method: "POST",
    json: {
      amount,
      currency: "INR",
      receipt: args.receipt.slice(0, 40), // Razorpay caps receipt at 40 chars
      payment_capture: 1,
      notes: args.notes ?? {},
    },
  }) as Promise<RpOrder>;
}

export async function fetchOrder(orderId: string): Promise<RpOrder> {
  return rp(`/orders/${encodeURIComponent(orderId)}`) as Promise<RpOrder>;
}

export type RpPayment = {
  id: string;
  order_id: string;
  amount: number; // paise
  currency: string;
  status: string; // "captured" once money is settled to us
  method?: string;
  captured?: boolean;
};

export async function fetchPayment(paymentId: string): Promise<RpPayment> {
  return rp(`/payments/${encodeURIComponent(paymentId)}`) as Promise<RpPayment>;
}

/**
 * Refund a captured payment. Full refund unless `amountInr` is given.
 * `speed: "optimum"` uses the fastest rail available (instant for UPI where possible).
 */
export async function refundPayment(
  paymentId: string,
  opts?: { amountInr?: number; notes?: Record<string, string>; speed?: "normal" | "optimum" },
): Promise<Json> {
  const json: Json = { speed: opts?.speed ?? "optimum" };
  if (opts?.amountInr != null) json.amount = Math.round(opts.amountInr * 100);
  if (opts?.notes) json.notes = opts.notes;
  return rp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", json });
}

/** Timing-safe compare of a computed hex HMAC against a client/webhook-supplied one. */
function hmacEquals(expectedHex: string, actual: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify the checkout signature: HMAC-SHA256(`order_id|payment_id`) keyed by the
 * secret, timing-safe compared to what Razorpay returned to the browser. Proves the
 * client's payment fields genuinely came from Razorpay for this order — but NOT that
 * money was captured. The route must still fetchPayment() to confirm capture.
 */
export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  if (!secret || !args.signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${args.orderId}|${args.paymentId}`).digest("hex");
  return hmacEquals(expected, args.signature);
}

/** True once a webhook secret is set (a SEPARATE secret from the API key). */
export const razorpayWebhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);

/**
 * Verify a webhook: HMAC-SHA256 of the RAW request body keyed by the webhook secret,
 * compared to the `X-Razorpay-Signature` header. The raw body (not re-serialized JSON)
 * is required — re-stringifying would change bytes and break the signature.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return hmacEquals(expected, signature);
}
