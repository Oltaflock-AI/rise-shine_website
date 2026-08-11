import { preBookHotel } from "@/lib/tbo-hotel";
import { validateHotelPax, type HotelBookRequest, type HotelBookRoom } from "@/lib/tbo-hotel-book";
import { createOrder, razorpayConfigured, RAZORPAY_KEY_ID } from "@/lib/razorpay";
import { getUser } from "@/lib/supabase/server";

// Live re-price + order creation — never cached. Runs PreBook.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/hotels/payment/order — re-price a room (PreBook), validate the guests,
 * then open a Razorpay order for it.
 *
 * PreBook is the ONLY source of truth for the amount charged (never a client number),
 * and the same PreBook `ValidationInfo` drives guest validation — so a booking TBO
 * would reject fails here, before the customer is ever charged. Capture is then
 * confirmed in /api/hotels/book before Book is called.
 *
 * Body: same as /api/hotels/book minus payment: { bookingCode, nationality?, rooms }.
 */
export async function POST(req: Request) {
  if (!razorpayConfigured) {
    // No keys → the client falls back to the legacy direct-book path (dev/staging).
    return Response.json({ ok: false, error: "Online payment is not configured." }, { status: 503 });
  }

  let body: { bookingCode?: string; nationality?: string; rooms?: HotelBookRoom[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.bookingCode) return Response.json({ ok: false, error: 'Missing "bookingCode".' }, { status: 400 });
  if (!body.rooms?.length) return Response.json({ ok: false, error: "At least one room is required." }, { status: 400 });

  // Authoritative re-price. This also returns the validation rules for the rate.
  const pb = await preBookHotel({ bookingCode: body.bookingCode });
  if (!pb.ok) return Response.json({ ok: false, error: pb.error || "This rate is no longer available." }, { status: 502 });
  // Charge the SELLING price: the PreBook TotalFare, floored at TBO's
  // RecommendedSellingRate for B2C. NetAmount is TBO's cost to us — it is never
  // charged and never displayed (TBO portal checkpoints 30 and 31).
  const amountInr = pb.totalFare ?? 0;
  if (!amountInr) return Response.json({ ok: false, error: "This rate is no longer available." }, { status: 502 });

  // Validate guests against the RATE's rules (not the client's claim) before charging.
  const draft: HotelBookRequest = {
    bookingCode: pb.bookingCode,
    nationality: body.nationality || "IN",
    netAmount: amountInr,
    rooms: body.rooms,
    validation: pb.validation,
  };
  const ruleError = validateHotelPax(draft);
  if (ruleError) return Response.json({ ok: false, error: ruleError, rule: ruleError }, { status: 422 });

  const user = await getUser().catch(() => null); // audit note only

  try {
    const order = await createOrder({
      amountInr,
      receipt: `rsh_${body.bookingCode}`.slice(0, 40),
      notes: { bookingCode: body.bookingCode, userId: user?.id ?? "guest" },
    });
    return Response.json({
      ok: true,
      orderId: order.id,
      amount: order.amount, // paise — what Razorpay Checkout must open with
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
      fareInr: amountInr,
      priceChanged: pb.isPriceChanged,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not start payment." },
      { status: 502 },
    );
  }
}
