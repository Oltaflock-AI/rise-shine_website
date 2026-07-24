import { bookFlight } from "@/lib/tbo-book";
import { parseBookingRequest, type IncomingBooking } from "@/lib/booking-request";
import { getUser } from "@/lib/supabase/server";
import { saveBookingHistory } from "@/lib/booking-history";
import {
  emailConfigured,
  sendEmail,
  flightLeadEmail,
  flightConfirmationEmail,
  refundNoticeEmail,
} from "@/lib/email";
import { alertOps } from "@/lib/alerts";
import {
  razorpayConfigured,
  verifyPaymentSignature,
  fetchPayment,
  fetchOrder,
  refundPayment,
} from "@/lib/razorpay";

// Live TBO booking calls — never cached, and Book/Ticket can run to 300s.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Payment = { orderId?: string; paymentId?: string; signature?: string };

/** The booking payload plus the Razorpay handles from a completed checkout. */
type Incoming = IncomingBooking & {
  /** Required when payment is configured; carries the signed order/payment ids. */
  payment?: Payment;
};

/** A payment we have independently confirmed captured, kept so we can refund it if TBO fails. */
type ConfirmedPayment = { paymentId: string; orderId: string; amountInr: number };

/**
 * POST /api/book — collect payment (when configured) then run TBO's booking flow.
 *
 * When Razorpay is configured a captured, signature-verified payment is REQUIRED
 * before a single TBO call is made — and if ticketing then fails, the payment is
 * refunded automatically (money must never be held for a ticket the customer never
 * got). With no keys, the flow degrades to the legacy direct-ticket path so dev/
 * staging still demo. The heavy lifting (and every TBO checklist validation) lives
 * in lib/tbo-book + lib/tbo-validate; this handler shapes the request, normalizes
 * titles (TBO rejects "Master"/"Miss"), and owns the payment lifecycle.
 */
export async function POST(req: Request) {
  let body: Incoming;
  try {
    body = (await req.json()) as Incoming;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseBookingRequest(body);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const bookingReq = parsed.req;

  // ── Payment gate ──
  // Confirm the money is actually captured BEFORE touching TBO. The order was priced
  // server-side (/api/payment/order), so the order's amount — not any client number —
  // is the amount we accept.
  let payment: ConfirmedPayment | null = null;
  if (razorpayConfigured) {
    const p = body.payment;
    if (!p?.orderId || !p?.paymentId || !p?.signature) {
      return Response.json({ ok: false, error: "Payment is required before ticketing." }, { status: 402 });
    }
    if (!verifyPaymentSignature({ orderId: p.orderId, paymentId: p.paymentId, signature: p.signature })) {
      return Response.json({ ok: false, error: "Payment could not be verified." }, { status: 400 });
    }
    try {
      const [pay, order] = await Promise.all([fetchPayment(p.paymentId), fetchOrder(p.orderId)]);
      const captured = pay.status === "captured" && pay.order_id === p.orderId && pay.amount === order.amount;
      if (!captured) {
        return Response.json({ ok: false, error: "Payment has not been captured." }, { status: 402 });
      }
      payment = { paymentId: pay.id, orderId: order.id, amountInr: Math.round(pay.amount / 100) };
    } catch (e) {
      console.error("[api/book] payment verification failed:", e);
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Payment verification failed." },
        { status: 502 },
      );
    }
  }

  const result = await bookFlight(bookingReq);

  // Paid but NOT ticketed → refund immediately. This is the whole point of capturing
  // up front: the customer is never left out of pocket for a ticket they didn't get.
  if (payment && !result.ok) {
    try {
      await refundPayment(payment.paymentId, {
        notes: { reason: "ticketing_failed", traceId: bookingReq.traceId, orderId: payment.orderId },
      });
      await alertOps("Flight ticketing failed after capture — auto-refunded", {
        route: `${bookingReq.origin} → ${bookingReq.destination}`,
        departDate: bookingReq.departDate,
        traceId: bookingReq.traceId,
        paymentId: payment.paymentId,
        amountInr: payment.amountInr,
        error: result.error,
      });
      // Tell the customer their money is coming back. Best-effort — the refund
      // above already succeeded and must be reported regardless.
      const to = flightLeadEmail(bookingReq);
      if (emailConfigured && to) {
        try {
          await sendEmail({
            to,
            ...refundNoticeEmail({ kind: "flight", amountInr: payment.amountInr, reference: payment.paymentId }),
          });
        } catch (e) {
          console.error("[api/book] refund email failed (refund unaffected):", e);
        }
      }
      return Response.json(
        { ...result, refunded: true, error: `${result.error ?? "Booking failed."} Your payment has been refunded.` },
        { status: result.rule ? 422 : 502 },
      );
    } catch (e) {
      // A failed refund must be loud — it needs manual settlement.
      await alertOps("URGENT: flight refund FAILED — settle manually", {
        route: `${bookingReq.origin} → ${bookingReq.destination}`,
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        amountInr: payment.amountInr,
        ticketError: result.error,
        refundError: e instanceof Error ? e.message : String(e),
      });
      return Response.json(
        {
          ...result,
          refunded: false,
          error: `${result.error ?? "Booking failed."} Your payment could not be auto-refunded — our team will process it manually.`,
        },
        { status: 502 },
      );
    }
  }

  // Ticket confirmed (and paid): mirror it to the customer's account. Best-effort and
  // awaited BEFORE responding — on serverless the function may freeze the instant we
  // return, so a fire-and-forget write could be killed. A failure here is swallowed:
  // it must never fail a paid booking. Guests (no session) are simply not persisted.
  if (result.ok) {
    try {
      const user = await getUser();
      if (user) await saveBookingHistory(user.id, bookingReq, result, payment ?? undefined);
    } catch (e) {
      console.error("[api/book] booking-history write failed (ticket unaffected):", e);
    }
    // Confirmation email to the lead passenger — best-effort, awaited before the
    // response (serverless may freeze after return), never fails the booking.
    const to = flightLeadEmail(bookingReq);
    if (emailConfigured && to) {
      try {
        await sendEmail({
          to,
          ...flightConfirmationEmail(bookingReq, result, payment?.amountInr ?? result.fareInr),
        });
      } catch (e) {
        console.error("[api/book] confirmation email failed (ticket unaffected):", e);
      }
    }
  }

  // A failed validation is the caller's fault (422); a held/failed booking is not (200/502).
  const status = result.ok ? 200 : result.rule ? 422 : 502;
  return Response.json(result, { status });
}
