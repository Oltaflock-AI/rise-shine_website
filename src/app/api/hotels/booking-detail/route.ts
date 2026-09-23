import { hotelBookingDetail } from "@/lib/tbo-hotel-post";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

// Live TBO status read — never cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/hotels/booking-detail — GetBookingDetail (V10) for one booking.
 *
 * Two callers, both of them TBO certification requirements:
 *  • the confirmation screen, 120 seconds after Book — TBO's rule is that the
 *    authoritative status is only settled by then, so the portal must re-read
 *    it rather than trust the Book RS (portal checkpoint 38);
 *  • the voucher page, which renders the stay, rooms, guests, amount and
 *    cancellation policy straight from this response (checkpoints 39, 41).
 *
 * Body: { bookingId, voucher?: boolean }
 *
 * Auth required, and the bookingId must belong to the CALLER's own bookings —
 * otherwise any signed-in user could read arbitrary TBO bookings by id.
 */
export async function POST(req: Request) {
  const user = await getUser().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "Sign in to view this booking." }, { status: 401 });
  if (!supabaseAdminConfigured) {
    return Response.json({ ok: false, error: "Booking management is not available right now." }, { status: 503 });
  }

  let body: { bookingId?: number; voucher?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const bookingId = Number(body.bookingId);
  if (!bookingId) return Response.json({ ok: false, error: 'Missing "bookingId".' }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("bookings")
    .select("id, cf_order_id")
    .eq("user_id", user.id)
    .eq("kind", "hotel")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!row) return Response.json({ ok: false, error: "This booking is not on your account." }, { status: 404 });

  const detail = await hotelBookingDetail({ bookingId });

  // NEVER call GenerateVoucher here. Every booking we make is IsVoucherBooking=true,
  // so it is vouchered at Book; TBO flagged a second call on an already-vouchered
  // booking (and it errors outright on one under cancellation).

  // TBO's GetBookingDetail carries only NetAmount / InvoiceAmount (the agency's
  // cost) — no TotalFare — and TBO's portal rule is to show TotalFare. The selling
  // fare is what we charged: booking_intents.amount_inr, written at order time from
  // PreBook's TotalFare, unrounded. NetAmount-derived fields are stripped.
  if (detail.ok) {
    let totalFare: number | undefined;
    if (row.cf_order_id) {
      const { data: intent } = await admin
        .from("booking_intents")
        .select("amount_inr")
        .eq("order_id", row.cf_order_id)
        .maybeSingle();
      if (intent?.amount_inr != null) totalFare = Number(intent.amount_inr);
    }
    delete detail.invoiceAmount;
    detail.totalFare = totalFare;
    if (detail.rooms) detail.rooms = detail.rooms.map(({ totalFare: _net, ...r }) => r);
  }

  return Response.json(detail, { status: detail.ok ? 200 : 502 });
}
