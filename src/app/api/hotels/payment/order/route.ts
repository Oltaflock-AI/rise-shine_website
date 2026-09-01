import { preBookHotel } from "@/lib/tbo-hotel";
import { validateHotelPax, type HotelBookRequest, type HotelBookRoom } from "@/lib/tbo-hotel-book";
import {
  createOrder,
  cashfreeConfigured,
  CASHFREE_MODE,
  hotelBind,
  newOrderId,
} from "@/lib/cashfree";
import { getUser } from "@/lib/supabase/server";
import { hotelUnpaidBookingAllowed } from "@/lib/tbo-env";
import { hotelVerificationSession } from "@/lib/tbo-verification";

// Live re-price + order creation — never cached. Runs PreBook.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/hotels/payment/order — re-price a room (PreBook), validate the guests,
 * then open a Cashfree order for it.
 *
 * PreBook is the ONLY source of truth for the amount charged (never a client number),
 * and the same PreBook `ValidationInfo` drives guest validation — so a booking TBO
 * would reject fails here, before the customer is ever charged. Payment is then
 * confirmed server-side in /api/hotels/book (Get Order) before Book is called.
 *
 * Body: same as /api/hotels/book minus payment: { bookingCode, nationality?, rooms }.
 */
export async function POST(req: Request) {
  // TBO's portal verifier, on the certification host: no order, no charge — the
  // client falls through to the direct-book path below. Answered with the same
  // shape as "no gateway", because to the browser it is the same situation.
  const verifying = await hotelVerificationSession();
  if (verifying) {
    console.info("[api/hotels/payment/order] TBO verification session — skipping payment.");
    return Response.json(
      { ok: false, unpaidBookingAllowed: true, error: "TBO verification session — payment skipped." },
      { status: 503 },
    );
  }

  if (!cashfreeConfigured) {
    // No keys. Whether the client may still book depends on WHICH TBO stack we are
    // pointed at, so the answer is decided here (server-side) and not by the browser:
    // on TBO's certification hosts an unpaid booking is the intended flow — it is how
    // portal verification is run — while on live hosts it would hold a real room on
    // agency credit for free, and the booking must simply not happen.
    return Response.json(
      {
        ok: false,
        unpaidBookingAllowed: hotelUnpaidBookingAllowed(cashfreeConfigured),
        error: "Online payment is not configured.",
      },
      { status: 503 },
    );
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

  // Cashfree requires a customer phone. TBO already mandates email + phone on each
  // room's lead guest (validated just above), so take it from there.
  const lead = body.rooms[0]?.passengers?.find((p) => p.leadPassenger) ?? body.rooms[0]?.passengers?.[0];
  const phone = String(lead?.phone ?? "").trim();
  if (!phone) {
    return Response.json({ ok: false, error: "A contact phone number is required.", rule: "pax" }, { status: 422 });
  }

  try {
    const orderId = newOrderId("rsh");
    const order = await createOrder({
      orderId,
      amountInr,
      customer: {
        id: user?.id ?? `guest_${orderId}`,
        phone,
        email: String(lead?.email ?? "").trim() || undefined,
        name: [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || undefined,
      },
      tags: {
        // Bound to the PreBooked rate, so a paid order can only ticket THAT room.
        bind: hotelBind(pb.bookingCode),
        kind: "hotel",
        userId: user?.id ?? "guest",
      },
      note: "Hotel booking",
      expiryMinutes: 16, // Cashfree's floor; see ORDER_EXPIRY_FLOOR_MIN
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
      fareInr: amountInr,
      priceChanged: pb.isPriceChanged,
      // The PreBook code the payment is bound to — the client must book with THIS.
      bookingCode: pb.bookingCode,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not start payment." },
      { status: 502 },
    );
  }
}
