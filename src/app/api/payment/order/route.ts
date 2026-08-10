import { validateBooking } from "@/lib/tbo-book";
import { parseBookingRequest, type IncomingBooking } from "@/lib/booking-request";
import {
  createOrder,
  paymentsRequired,
  paymentsMisconfigured,
  RAZORPAY_KEY_ID,
} from "@/lib/razorpay";
import { getUser } from "@/lib/supabase/server";

// Live validation + order creation — never cached. Runs FareRule + FareQuote + SSR.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/payment/order — validate a booking, then open a Razorpay order for it.
 *
 * Takes the SAME payload as /api/book (passengers, gst, flight) and runs the FULL
 * pre-ticket flow (validateBooking: FareRule → FareQuote → all checklist validations
 * → SSR → duplicate guard) BEFORE creating the order — so a booking TBO would reject
 * fails here, before the customer is ever charged. The amount is TBO's re-priced
 * FareQuote total and is the ONLY source of truth for what we charge. Capture is then
 * verified in /api/book before a single ticketing call is made.
 */
export async function POST(req: Request) {
  // Payment required but unchargeable → the booking cannot proceed at all. Answered
  // BEFORE the paymentsDisabled branch so a half-configured deployment can never
  // hand the client the flag that unlocks unpaid ticketing.
  if (paymentsMisconfigured()) {
    console.error("[api/payment/order] PAYMENTS_REQUIRED is set but Razorpay is not configured.");
    return Response.json(
      { ok: false, error: "Online payment is temporarily unavailable. Please contact us to complete your booking." },
      { status: 503 },
    );
  }

  if (!paymentsRequired()) {
    // Payment deliberately not required → the client may use the direct-ticket path.
    // `paymentsDisabled` is the ONLY thing that authorizes that fallback: the client
    // must never infer it from a bare 503, which Vercel also emits for platform
    // faults (paused deployment, no response from function, rate limiting). Reading
    // a free ticket out of an infrastructure blip is not a theoretical risk once
    // live TBO credentials are in play.
    return Response.json(
      { ok: false, paymentsDisabled: true, error: "Online payment is not configured." },
      { status: 503 },
    );
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

  try {
    const order = await createOrder({
      amountInr: check.publishedFare,
      receipt: `rs_${parsed.req.resultIndex}`,
      notes: {
        traceId: parsed.req.traceId,
        resultIndex: parsed.req.resultIndex,
        userId: user?.id ?? "guest",
      },
    });
    return Response.json({
      ok: true,
      orderId: order.id,
      amount: order.amount, // paise — what Razorpay Checkout must open with
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
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
