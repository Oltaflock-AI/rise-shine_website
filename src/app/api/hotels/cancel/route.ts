import { cancelHotelBooking, hotelCancelStatus } from "@/lib/tbo-hotel-post";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

// Live TBO change-request calls — never cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/hotels/cancel — cancel a hotel booking, or poll a cancellation.
 *
 * Body: { bookingId } to request cancellation · { changeRequestId } to poll.
 * Auth required; the bookingId must belong to one of the CALLER's bookings
 * (checked against the account mirror) — otherwise any signed-in user could
 * cancel arbitrary TBO bookings by id.
 */
export async function POST(req: Request) {
  const user = await getUser().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "Sign in to manage bookings." }, { status: 401 });
  if (!supabaseAdminConfigured) {
    return Response.json({ ok: false, error: "Booking management is not available right now." }, { status: 503 });
  }

  let body: { bookingId?: number; changeRequestId?: number; remarks?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.changeRequestId) {
    const status = await hotelCancelStatus(Number(body.changeRequestId));
    return Response.json(status, { status: status.ok ? 200 : 502 });
  }

  const bookingId = Number(body.bookingId);
  if (!bookingId) return Response.json({ ok: false, error: 'Missing "bookingId".' }, { status: 400 });

  // Ownership check against the mirror (service-role read, filtered by user).
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("bookings")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "hotel")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!row) return Response.json({ ok: false, error: "This booking is not on your account." }, { status: 404 });

  const result = await cancelHotelBooking(bookingId, body.remarks || "Customer requested cancellation");

  // Mirror the state so the account view reflects the pending cancellation.
  if (result.ok) {
    await admin.from("bookings").update({ status: 6 }).eq("id", row.id);
  }
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
