import { hotelBookingDetail, generateHotelVoucher } from "@/lib/tbo-hotel-post";
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
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "hotel")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!row) return Response.json({ ok: false, error: "This booking is not on your account." }, { status: 404 });

  const detail = await hotelBookingDetail({ bookingId });

  // Voucher on demand. Instant (IsVoucherBooking) bookings self-voucher, so a
  // "already vouchered" answer from TBO is a success as far as the guest is
  // concerned — never fail the read because of it.
  if (body.voucher && detail.ok && detail.status === 1 && !detail.isVoucherBooked) {
    const v = await generateHotelVoucher(bookingId);
    if (v.ok) {
      const fresh = await hotelBookingDetail({ bookingId });
      if (fresh.ok) return Response.json(fresh, { status: 200 });
    }
  }

  return Response.json(detail, { status: detail.ok ? 200 : 502 });
}
