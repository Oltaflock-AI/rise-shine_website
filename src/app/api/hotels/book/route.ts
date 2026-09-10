import { bookHotel, type HotelBookRequest, type HotelBookRoom } from "@/lib/tbo-hotel-book";
import { generateHotelVoucher } from "@/lib/tbo-hotel-post";
import type { HotelValidationInfo } from "@/lib/tbo-hotel";
import { getUser } from "@/lib/supabase/server";
import { saveHotelBookingHistory, type HotelStay } from "@/lib/booking-history";
import { saveBillingAddress, type BillingDetails } from "@/lib/travel-profile";
import {
  emailConfigured,
  sendEmail,
  hotelLeadEmail,
  hotelConfirmationEmail,
  refundNoticeEmail,
} from "@/lib/email";
import { alertOps } from "@/lib/alerts";
import { cashfreeConfigured, cashfreePaymentsLive, confirmPaidOrder, refundOrder, hotelBind } from "@/lib/cashfree";
import { hotelBookingBlockedForMissingPayments, hotelUnpaidBookingAllowed } from "@/lib/tbo-env";
import { claimIntent, settleIntent } from "@/lib/booking-intents";
import { bookingPaused, pausedResponse } from "@/lib/booking-pause";

// Live TBO hotel booking — never cached; Book can run long.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Payment = { orderId?: string };
type ConfirmedPayment = { cfPaymentId: string; orderId: string };

/**
 * POST /api/hotels/book — collect payment (when configured) then run TBO's Book.
 *
 * When Cashfree is configured a PAID, server-verified order is REQUIRED
 * before Book is called — and if Book then fails, the payment is refunded
 * automatically (money must never be held for a stay the guest never got). With no keys
 * the flow degrades to a direct-book path so dev/staging can still demo — but ONLY
 * against staging TBO; live hosts with no Cashfree are refused outright.
 *
 * Body: { bookingCode, nationality?, netAmount, isVoucherBooking?, rooms, validation?, payment? }
 */
export async function POST(req: Request) {
  if (bookingPaused("hotel")) return pausedResponse("hotel");
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
    /** Billing address for the address book only — TBO's hotel Book has no address field. */
    billing?: BillingDetails;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.bookingCode) return Response.json({ ok: false, error: 'Missing "bookingCode".' }, { status: 400 });
  if (body.netAmount == null) return Response.json({ ok: false, error: 'Missing "netAmount".' }, { status: 400 });
  if (!body.rooms?.length) return Response.json({ ok: false, error: "At least one room is required." }, { status: 400 });

  // ── Fail closed on live ──
  // Live HOTEL credentials with no Cashfree would hold real rooms on agency credit
  // without collecting any money. Judged on the hotel hosts specifically: the flight
  // stack going live must not block hotel certification, which by design books without
  // a payment gateway.
  if (hotelBookingBlockedForMissingPayments(cashfreePaymentsLive)) {
    console.error("[api/hotels/book] refused: live TBO hotel credentials with no LIVE Cashfree configuration (sandbox keys settle nothing).");
    return Response.json(
      { ok: false, error: "Online booking is temporarily unavailable. Please call us to book." },
      { status: 503 },
    );
  }

  // ── Payment gate ──
  // Confirm money is actually captured BEFORE touching TBO. The order was priced
  // server-side (/api/hotels/payment/order); the order's amount — not any client
  // number — is what we accept.
  let payment: ConfirmedPayment | null = null;
  // What the customer actually paid (order is server-priced at the RSP-floored
  // selling fare; body.netAmount is TBO's net and no longer matches it).
  let paidInr: number | null = null;
  // On TBO's certification hosts there is no payment to confirm — that is how
  // certification is meant to run. The check is on the HOTEL hosts, so it cannot
  // unlock a live booking, and it is never consulted on the flight route.
  const unpaidAllowed = hotelUnpaidBookingAllowed(cashfreeConfigured);
  if (unpaidAllowed) {
    console.info("[api/hotels/book] TBO certification hosts — booking without payment.");
  }
  if (cashfreeConfigured && !unpaidAllowed) {
    const orderId = body.payment?.orderId;
    if (!orderId) {
      return Response.json({ ok: false, unpaid: true, error: "Payment is required before booking." }, { status: 402 });
    }
    try {
      // The order was bound to the PreBook code the client was quoted, so a paid
      // order can only ever book THAT room at THAT rate.
      const confirmed = await confirmPaidOrder({
        orderId,
        expectBind: hotelBind(body.bookingCode),
        kind: "hotel",
      });
      if (!confirmed.ok) {
        return Response.json(
          { ok: false, unpaid: confirmed.unpaid, error: confirmed.error },
          { status: confirmed.unpaid ? 402 : 400 },
        );
      }
      payment = { cfPaymentId: confirmed.payment.cfPaymentId, orderId: confirmed.payment.orderId };
      paidInr = confirmed.payment.amountInr; // rupees — Cashfree is not paise-denominated
    } catch (e) {
      console.error("[api/hotels/book] payment verification failed:", e);
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Payment verification failed." },
        { status: 502 },
      );
    }
  }

  // ── Idempotency gate ──
  // Same contract as /api/book: one paid order Books once. A repeat submit gets
  // the stored outcome, a concurrent one is told to wait. See lib/booking-intents.
  if (payment) {
    let claim;
    try {
      claim = await claimIntent(payment.orderId, "api/hotels/book");
    } catch (e) {
      console.error("[api/hotels/book] intent claim failed:", e);
      return Response.json(
        { ok: false, error: "We could not start the booking just now. Please try again in a moment — you will not be charged twice." },
        { status: 503 },
      );
    }
    if (claim.kind === "replay") {
      const stored = claim.result as { ok: boolean; rule?: string };
      return Response.json(stored, { status: stored.ok ? 200 : stored.rule ? 422 : 502 });
    }
    if (claim.kind === "busy") {
      return Response.json(
        {
          ok: false,
          inProgress: true,
          error: "This booking is already being processed. Please wait a moment — your voucher will be emailed to you and appears in your account.",
        },
        { status: 409 },
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
      await refundOrder(payment.orderId, {
        amountInr: paidInr ?? undefined,
        note: "Hotel booking failed after payment",
        kind: "hotel",
      });
      await alertOps("Hotel booking failed after capture — auto-refunded", {
        hotel: body.stay?.hotelName,
        city: body.stay?.city,
        bookingCode: request.bookingCode,
        paymentId: payment.cfPaymentId,
        amountInr: Math.round(paidInr ?? request.netAmount),
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
              amountInr: Math.round(paidInr ?? request.netAmount),
              reference: payment.cfPaymentId,
            }),
          });
        } catch (e) {
          console.error("[api/hotels/book] refund email failed (refund unaffected):", e);
        }
      }
      const outcome = { ...result, refunded: true, error: `${result.error ?? "Booking failed."} Your payment has been refunded.` };
      await settleIntent(payment.orderId, { status: "refunded", result: outcome, cfPaymentId: payment.cfPaymentId });
      return Response.json(outcome, { status: result.rule ? 422 : 502 });
    } catch (e) {
      await alertOps("URGENT: hotel refund FAILED — settle manually", {
        hotel: body.stay?.hotelName,
        bookingCode: request.bookingCode,
        paymentId: payment.cfPaymentId,
        orderId: payment.orderId,
        amountInr: Math.round(paidInr ?? request.netAmount),
        bookError: result.error,
        refundError: e instanceof Error ? e.message : String(e),
      });
      const outcome = {
        ...result,
        refunded: false,
        error: `${result.error ?? "Booking failed."} Your payment could not be auto-refunded — our team will process it manually.`,
      };
      await settleIntent(payment.orderId, {
        status: "refund_failed",
        result: outcome,
        cfPaymentId: payment.cfPaymentId,
        lastError: e instanceof Error ? e.message : String(e),
      });
      return Response.json(outcome, { status: 502 });
    }
  }

  // Confirmed (and paid): mirror to the customer's account. Best-effort and
  // awaited BEFORE responding (serverless may freeze after return); a failure
  // here must never fail a paid booking. Guests (no session) aren't persisted.
  if (result.ok) {
    // Record the outcome first so a repeat submit finds it before anything slower.
    if (payment) await settleIntent(payment.orderId, { status: "ticketed", result, cfPaymentId: payment.cfPaymentId });
    // GenerateVoucher — TBO portal checkpoint 36. An IsVoucherBooking=true
    // booking is already vouchered at Book, so this is confirmation rather than
    // creation: TBO answering "already generated" is fine and the guest's
    // booking must never fail because the voucher call did.
    if (result.bookingId) {
      try {
        const v = await generateHotelVoucher(result.bookingId);
        if (!v.ok) console.warn("[api/hotels/book] GenerateVoucher:", v.error);
      } catch (e) {
        console.warn("[api/hotels/book] GenerateVoucher threw (booking unaffected):", e);
      }
    }
    try {
      const user = await getUser();
      if (user) {
        await saveHotelBookingHistory(
          user.id,
          request,
          body.stay ?? {},
          result,
          payment ? { ...payment, amountInr: Math.round(paidInr ?? request.netAmount) } : undefined,
        );
        // Address book: the invoice address, with the lead guest's contact details.
        // TBO's hotel Book carries no address, so the form's `billing` is the only copy.
        if (body.billing?.address1) {
          const lead = request.rooms[0]?.passengers.find((p) => p.leadPassenger) ?? request.rooms[0]?.passengers[0];
          await saveBillingAddress(user.id, {
            ...body.billing,
            phone: lead?.phone,
            email: lead?.email,
            nationality: request.nationality,
          });
        }
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
          ...hotelConfirmationEmail(request, body.stay ?? {}, result, Math.round(paidInr ?? request.netAmount)),
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
