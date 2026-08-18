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
import { cashfreeConfigured, cashfreePaymentsLive, confirmPaidOrder, refundOrder, flightBind } from "@/lib/cashfree";
import { bookingBlockedForMissingPayments } from "@/lib/tbo-env";

// Live TBO booking calls — never cached, and Book/Ticket can run to 300s.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Payment = { orderId?: string };

/** The booking payload plus the Cashfree order the customer paid. */
type Incoming = IncomingBooking & {
  /** Required when payment is configured. Only OUR order id — Cashfree issues no
   *  client-side receipt worth trusting, so the server re-reads the order itself. */
  payment?: Payment;
};

/** A payment we have independently confirmed paid, kept so we can refund it if TBO fails. */
type ConfirmedPayment = { cfPaymentId: string; orderId: string; amountInr: number };

/**
 * POST /api/book — collect payment (when configured) then run TBO's booking flow.
 *
 * When Cashfree is configured a PAID, server-verified order is REQUIRED
 * before a single TBO call is made — and if ticketing then fails, the payment is
 * refunded automatically (money must never be held for a ticket the customer never
 * got). With no keys the flow degrades to a direct-ticket path so dev/staging can still
 * demo — but ONLY against staging TBO: `bookingBlockedForMissingPayments` refuses the
 * request outright when the live hosts are configured. The heavy lifting (and every TBO checklist validation) lives
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

  // ── Fail closed on live ──
  // Payment is only enforced below when Cashfree is configured, which was right for
  // staging certification. Against LIVE TBO credentials that same branch would ticket
  // for free, so refuse outright rather than book unpaid.
  if (bookingBlockedForMissingPayments(cashfreePaymentsLive)) {
    console.error("[api/book] refused: live TBO credentials with no LIVE Cashfree configuration (sandbox keys settle nothing).");
    return Response.json(
      { ok: false, error: "Online booking is temporarily unavailable. Please call us to book." },
      { status: 503 },
    );
  }

  // ── Payment gate ──
  // Confirm the money actually moved BEFORE touching TBO. The order was priced
  // server-side (/api/payment/order), so the order's amount — not any client number —
  // is the amount we accept, and the order's `bind` tag proves it was created for THIS
  // itinerary rather than some cheaper one the customer paid for earlier.
  let payment: ConfirmedPayment | null = null;
  if (cashfreeConfigured) {
    const orderId = body.payment?.orderId;
    if (!orderId) {
      return Response.json({ ok: false, unpaid: true, error: "Payment is required before ticketing." }, { status: 402 });
    }
    try {
      const confirmed = await confirmPaidOrder({
        orderId,
        expectBind: flightBind(bookingReq.traceId, bookingReq.resultIndex),
      });
      if (!confirmed.ok) {
        return Response.json(
          { ok: false, unpaid: confirmed.unpaid, error: confirmed.error },
          { status: confirmed.unpaid ? 402 : 400 },
        );
      }
      payment = confirmed.payment;
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
      await refundOrder(payment.orderId, {
        amountInr: payment.amountInr,
        note: `Ticketing failed for TBO trace ${bookingReq.traceId}`,
      });
      await alertOps("Flight ticketing failed after capture — auto-refunded", {
        route: `${bookingReq.origin} → ${bookingReq.destination}`,
        departDate: bookingReq.departDate,
        traceId: bookingReq.traceId,
        paymentId: payment.cfPaymentId,
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
            ...refundNoticeEmail({ kind: "flight", amountInr: payment.amountInr, reference: payment.cfPaymentId }),
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
        paymentId: payment.cfPaymentId,
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
