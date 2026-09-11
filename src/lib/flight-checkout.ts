import "server-only";

/**
 * The part of a flight checkout that runs AFTER the money is confirmed.
 *
 * Shared by /api/book (the customer's own request) and /api/cron/settle-intents
 * (finishing a paid checkout whose browser went away), so the two can never
 * drift: same Book, same refund-on-failure, same emails, same mirror, same
 * intent bookkeeping. The HTTP status is the route's business — this returns
 * the BookingResult the customer sees, plus whether a refund was cut.
 */
import { bookFlight, type BookingRequest, type BookingResult } from "@/lib/tbo-book";
import type { BillingDetails } from "@/lib/travel-profile";
import { saveBookingHistory } from "@/lib/booking-history";
import { saveTravelProfile } from "@/lib/travel-profile";
import { emailConfigured, sendEmail, flightLeadEmail, flightConfirmationEmail, refundNoticeEmail } from "@/lib/email";
import { alertOps } from "@/lib/alerts";
import { refundOrder, type ConfirmedOrder } from "@/lib/cashfree";
import { settleIntent } from "@/lib/booking-intents";
import { logActivity } from "@/lib/activity";

export type TicketOutcome = BookingResult & { refunded?: boolean };

export async function ticketPaidFlight(args: {
  bookingReq: BookingRequest;
  /** Server-verified, or null on the no-payment certification path. */
  payment: ConfirmedOrder | null;
  /** Verified user id for the account mirror, if there is a session. */
  userId: string | null;
  billing?: BillingDetails;
  /** Who is running this — for the alert and the intent row. */
  via: "api/book" | "cron/settle-intents";
}): Promise<TicketOutcome> {
  const { bookingReq, payment } = args;
  const orderId = payment?.orderId;

  const result = await bookFlight(bookingReq);

  // CRM timeline — one line per outcome, before any of the slower follow-ups.
  // Best-effort; never touches the ticket or the refund.
  await logActivity(args.userId, result.ok ? "booking_confirmed" : "booking_failed", {
    kind: "flight",
    orderId,
    from: bookingReq.origin,
    to: bookingReq.destination,
    depart: bookingReq.departDate,
    pnr: result.pnr,
    amountInr: payment?.amountInr ?? result.fareInr,
    reason: result.ok ? undefined : result.rule ?? "supplier",
  });

  // Paid but NOT ticketed → refund immediately. This is the whole point of capturing
  // up front: the customer is never left out of pocket for a ticket they didn't get.
  if (payment && !result.ok) {
    let outcome: TicketOutcome;
    try {
      await refundOrder(payment.orderId, {
        amountInr: payment.amountInr,
        note: `Ticketing failed for TBO trace ${bookingReq.traceId}`,
      });
      await alertOps("Flight ticketing failed after capture — auto-refunded", {
        via: args.via,
        route: `${bookingReq.origin} → ${bookingReq.destination}`,
        departDate: bookingReq.departDate,
        traceId: bookingReq.traceId,
        orderId: payment.orderId,
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
          console.error(`[${args.via}] refund email failed (refund unaffected):`, e);
        }
      }
      outcome = {
        ...result,
        refunded: true,
        error: `${result.error ?? "Booking failed."} Your payment has been refunded.`,
      };
      if (orderId) await settleIntent(orderId, { status: "refunded", result: outcome, cfPaymentId: payment.cfPaymentId });
    } catch (e) {
      // A failed refund must be loud — it needs manual settlement.
      await alertOps("URGENT: flight refund FAILED — settle manually", {
        via: args.via,
        route: `${bookingReq.origin} → ${bookingReq.destination}`,
        paymentId: payment.cfPaymentId,
        orderId: payment.orderId,
        amountInr: payment.amountInr,
        ticketError: result.error,
        refundError: e instanceof Error ? e.message : String(e),
      });
      outcome = {
        ...result,
        refunded: false,
        error: `${result.error ?? "Booking failed."} Your payment could not be auto-refunded — our team will process it manually.`,
      };
      if (orderId) {
        await settleIntent(orderId, {
          status: "refund_failed",
          result: outcome,
          cfPaymentId: payment.cfPaymentId,
          lastError: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return outcome;
  }

  if (result.ok) {
    // Record the outcome FIRST: a repeat submit must find it before anything
    // slower below can delay it.
    if (orderId) await settleIntent(orderId, { status: "ticketed", result, cfPaymentId: payment?.cfPaymentId });

    // Ticket confirmed (and paid): mirror it to the customer's account. Best-effort and
    // awaited BEFORE returning — on serverless the function may freeze the instant we
    // return, so a fire-and-forget write could be killed. A failure here is swallowed:
    // it must never fail a paid booking.
    try {
      if (args.userId) {
        await saveBookingHistory(args.userId, bookingReq, result, payment ?? undefined);
        // Remember the travellers + billing address for a one-tap next checkout.
        // Separate from the history mirror above so a failure in either is
        // contained; both are best-effort and neither can fail a paid ticket.
        await saveTravelProfile(args.userId, bookingReq, args.billing);
      }
    } catch (e) {
      console.error(`[${args.via}] booking-history write failed (ticket unaffected):`, e);
    }
    // Confirmation email to the lead passenger — best-effort, never fails the booking.
    const to = flightLeadEmail(bookingReq);
    if (emailConfigured && to) {
      try {
        await sendEmail({
          to,
          ...flightConfirmationEmail(bookingReq, result, payment?.amountInr ?? result.fareInr),
        });
      } catch (e) {
        console.error(`[${args.via}] confirmation email failed (ticket unaffected):`, e);
      }
    }
    return result;
  }

  // Unpaid (certification) path that failed: nothing to refund, nothing to settle.
  return result;
}
