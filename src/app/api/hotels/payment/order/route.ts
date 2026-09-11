import { preBookHotel } from "@/lib/tbo-hotel";
import { validateHotelPax, type HotelBookRequest, type HotelBookRoom } from "@/lib/tbo-hotel-book";
import {
  createOrder,
  cashfreeConfigured,
  cashfreeCredsFor,
  hotelBind,
  newOrderId,
} from "@/lib/cashfree";
import { getUser } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { hotelUnpaidBookingAllowed } from "@/lib/tbo-env";
import { createIntent } from "@/lib/booking-intents";
import { bookingPaused, pausedResponse } from "@/lib/booking-pause";

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
  if (bookingPaused("hotel")) return pausedResponse("hotel");
  // Whether this booking needs paying for is decided HERE, server-side, never by the
  // browser. Two situations answer "no": TBO's certification hosts, where booking
  // without a gateway is the intended flow and is how portal verification runs, and
  // a missing gateway. On live hotel hosts an unpaid booking would hold a real room
  // on agency credit for free, so it must simply not happen.
  //
  // The client reads `unpaidBookingAllowed` and falls through to the direct-book path.
  if (hotelUnpaidBookingAllowed(cashfreeConfigured)) {
    console.info("[api/hotels/payment/order] TBO certification hosts — no payment required.");
    return Response.json(
      { ok: false, unpaidBookingAllowed: true, error: "Payment is not required for this booking." },
      { status: 503 },
    );
  }

  if (!cashfreeConfigured) {
    return Response.json(
      { ok: false, unpaidBookingAllowed: false, error: "Online payment is not configured." },
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
      kind: "hotel",
      note: "Hotel booking",
      expiryMinutes: 16, // Cashfree's floor; see ORDER_EXPIRY_FLOOR_MIN
    });

    if (!order.payment_session_id) {
      return Response.json({ ok: false, error: "Could not start payment." }, { status: 502 });
    }

    // The server's copy of this checkout (lib/booking-intents): lets /api/hotels/book
    // refuse to Book the same paid order twice, and lets the settle cron REFUND a
    // paid order whose browser never came back. Hotel Book is never started from
    // the cron — refund is the only unattended action. A failed write stops here.
    try {
      await createIntent({
        orderId,
        kind: "hotel",
        bind: hotelBind(pb.bookingCode),
        userId: user?.id ?? null,
        amountInr,
        email: String(lead?.email ?? "").trim() || undefined,
        request: { bookingCode: pb.bookingCode, nationality: draft.nationality, rooms: body.rooms },
      });
    } catch (e) {
      console.error("[api/hotels/payment/order] intent write failed — order not offered:", e);
      return Response.json(
        { ok: false, error: "Could not start payment. Please try again in a moment." },
        { status: 503 },
      );
    }

    await logActivity(user?.id, "payment_opened", { kind: "hotel", orderId, amountInr });

    return Response.json({
      ok: true,
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      // The browser SDK must open in the mode of the account that minted this session —
      // hotel certification runs on the sandbox account (see cashfreeCredsFor).
      mode: cashfreeCredsFor("hotel").mode,
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
