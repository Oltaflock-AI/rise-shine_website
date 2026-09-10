import { parseBookingRequest, type IncomingBooking } from "@/lib/booking-request";
import { getUser } from "@/lib/supabase/server";
import { cashfreeConfigured, cashfreePaymentsLive, confirmPaidOrder, flightBind, type ConfirmedOrder } from "@/lib/cashfree";
import { bookingBlockedForMissingPayments } from "@/lib/tbo-env";
import { claimIntent } from "@/lib/booking-intents";
import { bookingPaused, pausedResponse } from "@/lib/booking-pause";
import { ticketPaidFlight, type TicketOutcome } from "@/lib/flight-checkout";

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
  // Paused AFTER an order was opened: the settle cron refunds it; nothing is ticketed.
  if (bookingPaused("flight")) return pausedResponse("flight");
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
  let payment: ConfirmedOrder | null = null;
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

  // ── Idempotency gate ──
  // Claim the intent row before a single TBO call. Two submits of one paid order
  // (a "please try again" after a dropped connection, a double tap) reach here with
  // the same orderId and the same PAID verdict; only one may ticket. The loser gets
  // the stored outcome if there is one, or a "still processing" it can wait on.
  // Nothing claimed = no intent row (pre-migration order) — the legacy path runs.
  if (payment) {
    let claim;
    try {
      claim = await claimIntent(payment.orderId, "api/book");
    } catch (e) {
      // The guard itself is unavailable. Booking anyway would reopen the double-
      // ticket hole this exists to close; the money is safe where it is and the
      // settle cron refunds it if nothing claims the order.
      console.error("[api/book] intent claim failed:", e);
      return Response.json(
        { ok: false, error: "We could not start ticketing just now. Please try again in a moment — you will not be charged twice." },
        { status: 503 },
      );
    }
    if (claim.kind === "replay") {
      const stored = claim.result as TicketOutcome;
      return Response.json(stored, { status: stored.ok ? 200 : stored.rule ? 422 : 502 });
    }
    if (claim.kind === "busy") {
      return Response.json(
        {
          ok: false,
          inProgress: true,
          error: "This booking is already being processed. Please wait a moment — your ticket will be emailed to you and appears in your account.",
        },
        { status: 409 },
      );
    }
  }

  const user = await getUser().catch(() => null);
  const result = await ticketPaidFlight({
    bookingReq,
    payment,
    userId: user?.id ?? null,
    billing: body.billing,
    via: "api/book",
  });

  // A failed validation is the caller's fault (422); a held/failed booking is not (200/502).
  const status = result.ok ? 200 : result.rule ? 422 : 502;
  return Response.json(result, { status });
}
