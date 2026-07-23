import "server-only";

/**
 * Persist a confirmed TBO booking to Supabase for the customer's account view.
 *
 * TBO is always the source of truth for a ticket — this is a convenience mirror
 * (see `bookings` / `passengers` in migrations/0001_init.sql). It is therefore
 * strictly best-effort: the caller invokes it AFTER Ticket has confirmed, so a
 * failure here must never surface to the customer or fail the paid booking. The
 * route wraps this in try/catch; we still guard every precondition ourselves.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import type { BookingRequest, BookingResult } from "@/lib/tbo-book";
import type { HotelBookRequest, HotelBookResult } from "@/lib/tbo-hotel-book";

/** Coerce a value to a Postgres `date` (YYYY-MM-DD) or null — never throws. */
function toDate(s?: string): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s); // matches leading date of an ISO string
  return m ? m[1] : null;
}

/** A confirmed Razorpay payment, mirrored alongside the booking for the account view. */
export type BookingPayment = { paymentId: string; orderId: string; amountInr: number };

/**
 * Insert one `bookings` row (owned by `userId`) plus its `passengers`. Only
 * called for a ticketed result; guards on config + result.ok defensively.
 * `payment` (when the booking was paid online) is mirrored too. Returns the new
 * booking id, or null if nothing was written.
 */
export async function saveBookingHistory(
  userId: string,
  req: BookingRequest,
  result: BookingResult,
  payment?: BookingPayment,
): Promise<string | null> {
  if (!supabaseAdminConfigured || !result.ok) return null;

  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      user_id: userId,
      pnr: result.pnr ?? null,
      booking_id: result.bookingId ?? null,
      trace_id: req.traceId,
      origin: req.origin,
      destination: req.destination,
      depart_date: toDate(req.departDate),
      return_date: null, // one-way search today; wire when round-trip lands
      airline_code: req.airlineCode || null,
      flight_number: req.flightNumber || null,
      is_lcc: req.isLCC,
      is_international: req.isInternational,
      status: result.status ?? null,
      fare_inr: result.fareInr ?? null,
      invoice_no: result.invoiceNo ?? null,
      ticket_numbers: result.ticketNumbers?.length ? result.ticketNumbers : null,
      razorpay_order_id: payment?.orderId ?? null,
      razorpay_payment_id: payment?.paymentId ?? null,
      amount_paid_inr: payment?.amountInr ?? null,
    })
    .select("id")
    .single();

  if (error || !booking) {
    throw error ?? new Error("bookings insert returned no row");
  }

  // Ticket numbers come back in passenger order from GetBookingDetails; zip by
  // index. This mirror is for display — TBO's GetBookingDetails stays canonical.
  const tickets = result.ticketNumbers ?? [];
  const passengers = req.passengers.map((p, i) => ({
    booking_id: booking.id,
    title: p.Title || null,
    first_name: p.FirstName || null,
    last_name: p.LastName || null,
    pax_type: p.PaxType ?? null,
    gender: p.Gender ?? null,
    dob: toDate(p.DateOfBirth),
    pan: p.PAN || null,
    passport_no: p.PassportNo || null,
    passport_expiry: toDate(p.PassportExpiry),
    ticket_number: tickets[i] ?? null,
    is_lead: Boolean(p.IsLeadPax),
  }));

  if (passengers.length) {
    const { error: paxErr } = await admin.from("passengers").insert(passengers);
    if (paxErr) throw paxErr;
  }

  return booking.id as string;
}

/** Display context for a hotel stay — comes from the checkout, not TBO. */
export type HotelStay = {
  hotelCode?: string;
  hotelName?: string;
  city?: string;
  checkIn?: string; // YYYY-MM-DD
  checkOut?: string;
};

/**
 * Hotel counterpart of saveBookingHistory: one `bookings` row (kind='hotel',
 * see migrations/0004) plus its guests as `passengers`. Same contract — called
 * only after a confirmed Book, best-effort, must never fail the paid booking.
 */
export async function saveHotelBookingHistory(
  userId: string,
  req: HotelBookRequest,
  stay: HotelStay,
  result: HotelBookResult,
  payment?: BookingPayment,
): Promise<string | null> {
  if (!supabaseAdminConfigured || !result.ok) return null;

  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      user_id: userId,
      kind: "hotel",
      booking_id: result.bookingId ?? null,
      status: 1, // confirmed — the only state we persist
      hotel_code: stay.hotelCode ?? null,
      hotel_name: stay.hotelName ?? null,
      city: stay.city ?? null,
      check_in: toDate(stay.checkIn),
      check_out: toDate(stay.checkOut),
      rooms: req.rooms.length,
      confirmation_no: result.confirmationNo ?? null,
      booking_ref_no: result.bookingRefNo ?? null,
      fare_inr: Math.round(req.netAmount) || null,
      razorpay_order_id: payment?.orderId ?? null,
      razorpay_payment_id: payment?.paymentId ?? null,
      amount_paid_inr: payment?.amountInr ?? null,
    })
    .select("id")
    .single();

  if (error || !booking) {
    throw error ?? new Error("bookings insert returned no row");
  }

  const guests = req.rooms.flatMap((room) =>
    room.passengers.map((p) => ({
      booking_id: booking.id,
      title: p.title || null,
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      pax_type: p.paxType ?? null,
      pan: p.pan || null,
      passport_no: p.passportNo || null,
      is_lead: Boolean(p.leadPassenger),
    })),
  );
  if (guests.length) {
    const { error: paxErr } = await admin.from("passengers").insert(guests);
    if (paxErr) throw paxErr;
  }

  return booking.id as string;
}
