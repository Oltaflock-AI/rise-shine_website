import { verifyWebhookSignature, cashfreeWebhookConfigured } from "@/lib/cashfree";
import { recordPaymentEvent } from "@/lib/payments-ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * POST /api/payment/webhook — Cashfree server-to-server events (reconciliation).
 *
 * Independent of the browser checkout callback: even if the customer closes the tab
 * the instant they pay, this records the money movement into the payments ledger.
 * Configure it in the Cashfree Dashboard → Developers → Webhooks with the events
 * PAYMENT_SUCCESS, PAYMENT_FAILED, PAYMENT_USER_DROPPED and REFUND_STATUS.
 *
 * Signature = base64 HMAC-SHA256 of (`x-webhook-timestamp` + RAW body) keyed by the
 * API secret — so we read req.text() and NEVER re-serialize. Re-serializing rewrites
 * decimals (`170.00` → `170`) and the signature stops matching; Cashfree calls this
 * out explicitly. A write failure returns 500 so Cashfree retries; an unknown event
 * type is acknowledged (200) so it won't.
 */
export async function POST(req: Request) {
  if (!cashfreeWebhookConfigured) {
    return Response.json({ ok: false, error: "Webhook not configured." }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  if (!verifyWebhookSignature(raw, signature, timestamp)) {
    return Response.json({ ok: false, error: "Invalid signature." }, { status: 400 });
  }

  let event: Json;
  try {
    event = JSON.parse(raw) as Json;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const data = (event.data ?? {}) as Json;

  try {
    switch (event.type) {
      case "PAYMENT_SUCCESS_WEBHOOK":
      case "PAYMENT_FAILED_WEBHOOK":
      case "PAYMENT_USER_DROPPED_WEBHOOK": {
        const p = (data.payment ?? {}) as Json;
        const order = (data.order ?? {}) as Json;
        const customer = (data.customer_details ?? {}) as Json;
        await recordPaymentEvent({
          paymentId: String(p.cf_payment_id ?? ""),
          orderId: order.order_id,
          // Only a SUCCESS is money in hand; FAILED and USER_DROPPED are both
          // "no money moved" as far as reconciliation is concerned.
          status: p.payment_status === "SUCCESS" ? "captured" : "failed",
          amountInr: p.payment_amount != null ? Math.round(Number(p.payment_amount)) : undefined,
          method: p.payment_group,
          email: customer.customer_email,
          contact: customer.customer_phone,
          // Written into order_tags at Create Order time (flights only).
          traceId: order.order_tags?.traceId,
        });
        break;
      }
      case "REFUND_STATUS_WEBHOOK":
      case "AUTO_REFUND_STATUS_WEBHOOK": {
        const r = (data.refund ?? {}) as Json;
        // A refund can sit PENDING or come back FAILED; only mark the ledger
        // refunded once the money has actually gone back.
        if (r.refund_status !== "SUCCESS") break;
        await recordPaymentEvent({
          paymentId: String(r.cf_payment_id ?? ""),
          orderId: r.order_id,
          status: "refunded",
          refundedAt: r.processed_at || event.event_time || new Date().toISOString(),
        });
        break;
      }
      default:
        // Unhandled event type — acknowledge so Cashfree stops retrying.
        break;
    }
  } catch (e) {
    console.error("[api/payment/webhook] ledger write failed:", e);
    return Response.json({ ok: false }, { status: 500 }); // 5xx → Cashfree retries
  }

  return Response.json({ ok: true });
}
