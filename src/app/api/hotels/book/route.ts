import { bookHotel, type HotelBookRequest, type HotelBookRoom } from "@/lib/tbo-hotel-book";
import type { HotelValidationInfo } from "@/lib/tbo-hotel";
import { getUser } from "@/lib/supabase/server";
import { saveHotelBookingHistory, type HotelStay } from "@/lib/booking-history";
import {
  emailConfigured,
  sendEmail,
  hotelLeadEmail,
  hotelConfirmationEmail,
  refundNoticeEmail,
} from "@/lib/email";
import { alertOps } from "@/lib/alerts";
import {
  razorpayConfigured,
  verifyPaymentSignature,
  fetchPayment,
  fetchOrder,
  refundPayment,
} from "@/lib/razorpay";

// Live TBO hotel booking — never cached; Book can run long.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Payment = { orderId?: string; paymentId?: string; signature?: string };
type ConfirmedPayment = { paymentId: string; orderId: string };

/**
 * POST /api/hotels/book — collect payment (when configured) then run TBO's Book.
 *
 * When Razorpay is configured a captured, signature-verified payment is REQUIRED
 * before Book is called — and if Book then fails, the payment is refunded
 * automatically (money must never be held for a stay the guest never got). With no
 * keys, the flow degrades to the legacy direct-book path so dev/staging still demo.
 *
 * Body: { bookingCode, nationality?, netAmount, isVoucherBooking?, rooms, validation?, payment? }
 */
export async function POST(req: Request) {
  let body: {
    bookingCode?: string;
    nationality?: string;
    netAmount?: number;
    isVoucherBooking?: boolean;
    rooms?: HotelBookRoom[];
    validation?: HotelValidationInfo;
    clientReferenceId?: string;
    payment?: Payment;
    /** Display context (hotel name/city/dates) mirrored to the account view. */
    stay?: HotelStay;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.bookingCode) return Response.json({ ok: false, error: 'Missing "bookingCode".' }, { status: 400 });
  if (body.netAmount == null) return Response.json({ ok: false, error: 'Missing "netAmount".' }, { status: 400 });
  if (!body.rooms?.length) return Response.json({ ok: false, error: "At least one room is required." }, { status: 400 });

  // ── Payment gate ──
  // Confirm money is actually captured BEFORE touching TBO. The order was priced
  // server-side (/api/hotels/payment/order); the order's amount — not any client
  // number — is what we accept.
  let payment: ConfirmedPayment | null = null;
  if (razorpayConfigured) {
    const p = body.payment;
    if (!p?.orderId || !p?.paymentId || !p?.signature) {
      return Response.json({ ok: false, error: "Payment is required before booking." }, { status: 402 });
    }
    if (!verifyPaymentSignature({ orderId: p.orderId, paymentId: p.paymentId, signature: p.signature })) {
      return Response.json({ ok: false, error: "Payment could not be verified." }, { status: 400 });
    }
    try {
      const [pay, order] = await Promise.all([fetchPayment(p.paymentId), fetchOrder(p.orderId)]);
      const captured = pay.status === "captured" && pay.order_id === p.orderId && pay.amount === order.amount;
      if (!captured) {
        return Response.json({ ok: false, error: "Payment has not been captured." }, { status: 402 });
      }
      payment = { paymentId: pay.id, orderId: order.id };
    } catch (e) {
      console.error("[api/hotels/book] payment verification failed:", e);
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Payment verification failed." },
        { status: 502 },
      );
    }
  }

  const request: HotelBookRequest = {
    bookingCode: body.bookingCode,
    nationality: body.nationality || "IN",
    netAmount: Number(body.netAmount),
    isVoucherBooking: body.isVoucherBooking,
    rooms: body.rooms,
    validation: body.validation,
    // Always present: the recovery key for GetBookingDetail if Book times out.
    clientReferenceId: body.clientReferenceId || crypto.randomUUID(),
  };

  const result = await bookHotel(request);

  // Paid but NOT booked → refund immediately.
  if (payment && !result.ok) {
    try {
      await refundPayment(payment.paymentId, {
        notes: { reason: "hotel_book_failed", bookingCode: request.bookingCode, orderId: payment.orderId },
      });
      await alertOps("Hotel booking failed after capture — auto-refunded", {
        hotel: body.stay?.hotelName,
        city: body.stay?.city,
        bookingCode: request.bookingCode,
        paymentId: payment.paymentId,
        amountInr: Math.round(request.netAmount),
        error: result.error,
      });
      // Tell the guest their money is coming back. Best-effort — the refund
      // above already succeeded and must be reported regardless.
      const to = hotelLeadEmail(request);
      if (emailConfigured && to) {
        try {
          await sendEmail({
            to,
            ...refundNoticeEmail({
              kind: "hotel",
              amountInr: Math.round(request.netAmount),
              reference: payment.paymentId,
            }),
          });
        } catch (e) {
          console.error("[api/hotels/book] refund email failed (refund unaffected):", e);
        }
      }
      return Response.json(
        { ...result, refunded: true, error: `${result.error ?? "Booking failed."} Your payment has been refunded.` },
        { status: result.rule ? 422 : 502 },
      );
    } catch (e) {
      await alertOps("URGENT: hotel refund FAILED — settle manually", {
        hotel: body.stay?.hotelName,
        bookingCode: request.bookingCode,
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        amountInr: Math.round(request.netAmount),
        bookError: result.error,
        refundError: e instanceof Error ? e.message : String(e),
      });
      return Response.json(
        {
          ...result,
          refunded: false,
          error: `${result.error ?? "Booking failed."} Your payment could not be auto-refunded — our team will process it manually.`,
        },
        { status: 502 },
      );
    }
  }

  // Confirmed (and paid): mirror to the customer's account. Best-effort and
  // awaited BEFORE responding (serverless may freeze after return); a failure
  // here must never fail a paid booking. Guests (no session) aren't persisted.
  if (result.ok) {
    try {
      const user = await getUser();
      if (user) {
        await saveHotelBookingHistory(
          user.id,
          request,
          body.stay ?? {},
          result,
          payment ? { ...payment, amountInr: Math.round(request.netAmount) } : undefined,
        );
      }
    } catch (e) {
      console.error("[api/hotels/book] booking-history write failed (booking unaffected):", e);
    }
    // Confirmation email to the lead guest — best-effort, awaited before the
    // response (serverless may freeze after return), never fails the booking.
    const to = hotelLeadEmail(request);
    if (emailConfigured && to) {
      try {
        await sendEmail({
          to,
          ...hotelConfirmationEmail(request, body.stay ?? {}, result, Math.round(request.netAmount)),
        });
      } catch (e) {
        console.error("[api/hotels/book] confirmation email failed (booking unaffected):", e);
      }
    }
  }

  // Validation failure = caller's fault (422); a supplier failure is not (200/502).
  const status = result.ok ? 200 : result.rule ? 422 : 502;
  return Response.json(result, { status });
}
