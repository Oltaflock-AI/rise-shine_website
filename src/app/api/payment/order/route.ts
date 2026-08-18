import { validateBooking } from "@/lib/tbo-book";
import { parseBookingRequest, type IncomingBooking } from "@/lib/booking-request";
import {
  createOrder,
  cashfreeConfigured,
  CASHFREE_MODE,
  flightBind,
  newOrderId,
} from "@/lib/cashfree";
import { getUser } from "@/lib/supabase/server";

// Live validation + order creation — never cached. Runs FareRule + FareQuote + SSR.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/payment/order — validate a booking, then open a Cashfree order for it.
 *
 * Takes the SAME payload as /api/book (passengers, gst, flight) and runs the FULL
 * pre-ticket flow (validateBooking: FareRule → FareQuote → all checklist validations
 * → SSR → duplicate guard) BEFORE creating the order — so a booking TBO would reject
 * fails here, before the customer is ever charged. The amount is TBO's re-priced
 * FareQuote total and is the ONLY source of truth for what we charge.
 *
 * The response deliberately carries no secret: Cashfree's browser SDK opens on the
 * `payment_session_id` alone, so there is no publishable key to leak. Payment is then
 * confirmed server-side in /api/book (Get Order) before a single ticketing call runs.
 */
export async function POST(req: Request) {
  if (!cashfreeConfigured) {
    // No keys → booking stops. There is no unpaid flight path.
    return Response.json({ ok: false, error: "Online payment is not configured." }, { status: 503 });
  }

  let body: IncomingBooking;
  try {
    body = (await req.json()) as IncomingBooking;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseBookingRequest(body);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: parsed.status });

  // Full pre-charge validation. A rule failure is the caller's to fix (422) and means
  // NO order is created and NO money is taken.
  const check = await validateBooking(parsed.req);
  if (!check.ok) {
    return Response.json({ ok: false, error: check.error, rule: check.rule }, { status: check.rule ? 422 : 502 });
  }
  if (!check.publishedFare) {
    return Response.json({ ok: false, error: "This fare is no longer available." }, { status: 502 });
  }

  const user = await getUser().catch(() => null); // audit note only; never trusted for auth

  // Cashfree requires a customer phone. TBO already mandates one on every passenger
  // (lib/tbo-validate), so take the lead passenger's rather than inventing a fallback.
  const lead = parsed.req.passengers[0];
  const phone = String(lead?.ContactNo ?? "").trim();
  if (!phone) {
    return Response.json({ ok: false, error: "A contact phone number is required.", rule: "pax" }, { status: 422 });
  }

  try {
    const orderId = newOrderId("rsf");
    const order = await createOrder({
      orderId,
      amountInr: check.publishedFare,
      customer: {
        id: user?.id ?? `guest_${orderId}`,
        phone,
        email: String(lead?.Email ?? "").trim() || undefined,
        name: [lead?.FirstName, lead?.LastName].filter(Boolean).join(" ") || undefined,
      },
      tags: {
        bind: flightBind(parsed.req.traceId, parsed.req.resultIndex),
        traceId: parsed.req.traceId,
        kind: "flight",
        userId: user?.id ?? "guest",
      },
      note: `${parsed.req.origin} to ${parsed.req.destination} on ${parsed.req.departDate}`,
      // Cashfree's floor (see ORDER_EXPIRY_FLOOR_MIN) — it cannot be pulled under
      // TBO's TraceId window, so a stale fare is caught by the refund path instead.
      expiryMinutes: 16,
    });

    if (!order.payment_session_id) {
      return Response.json({ ok: false, error: "Could not start payment." }, { status: 502 });
    }

    return Response.json({
      ok: true,
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      mode: CASHFREE_MODE, // the browser SDK must be initialised in the matching mode
      amount: order.order_amount, // rupees — Cashfree is not paise-denominated
      currency: order.order_currency,
      fareInr: check.publishedFare,
      priceChanged: check.priceChanged,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not start payment." },
      { status: 502 },
    );
  }
}
