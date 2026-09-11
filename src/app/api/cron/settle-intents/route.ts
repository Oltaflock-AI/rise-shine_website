import {
  decideIntentAction,
  claimIntent,
  listUnsettledIntents,
  settleIntent,
  recordIntentAttempt,
  purgeSettledRequests,
  intentsConfigured,
  type IntentRow,
} from "@/lib/booking-intents";
import { purgeOldActivity } from "@/lib/activity";
import { confirmPaidOrder, refundOrder, cashfreeConfigured } from "@/lib/cashfree";
import { parseBookingRequest, type IncomingBooking } from "@/lib/booking-request";
import { ticketPaidFlight } from "@/lib/flight-checkout";
import { alertOps } from "@/lib/alerts";
import { emailConfigured, sendEmail, refundNoticeEmail } from "@/lib/email";
import type { BillingDetails } from "@/lib/travel-profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// It may run a full Book/Ticket for one abandoned checkout.
export const maxDuration = 300;

/** Rows per run. Small: a Book can take minutes and the next run is a minute away. */
const BATCH = 5;
/** How many times an inconclusive attempt is retried before a human is asked. */
const MAX_ATTEMPTS = 5;

/**
 * GET /api/cron/settle-intents — finish or unwind checkouts nobody came back for.
 *
 * Runs every minute (vercel.json, `Authorization: Bearer $CRON_SECRET`). Reads
 * `booking_intents` (lib/booking-intents) and, per row, does the one thing the
 * missing browser would have done:
 *
 *   paid, unclaimed, TraceId alive   → run the SAME ticketing path /api/book uses
 *   paid, unclaimed, TraceId dead    → refund, email the customer, tell ops
 *   awaiting_payment past order life → ask Cashfree; refund if paid, else expire
 *   claimed longer than a function   → escalate to a human; TBO's state is unknown
 *
 * Safe to overlap: every mutation goes through the compare-and-swap claim, so
 * two runs — or a run and the customer's own late /api/book — cannot both act
 * on one order. Nothing here books a hotel; that stays refund-only by design.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!intentsConfigured) {
    return Response.json({ ok: false, error: "Supabase admin is not configured." }, { status: 503 });
  }
  if (!cashfreeConfigured) {
    // No gateway means no orders were ever opened; nothing can be pending.
    return Response.json({ ok: true, skipped: "cashfree not configured" });
  }

  let rows: IntentRow[];
  try {
    rows = await listUnsettledIntents(BATCH);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const now = new Date();
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

  for (const row of rows) {
    const searchedAt = row.kind === "flight" ? Number((row.request as { searchedAt?: number }).searchedAt) || null : null;
    const action = decideIntentAction({
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      claimedAt: row.claimed_at,
      searchedAt,
      now,
    });
    bump(action);
    if (action === "none" || action === "wait") continue;

    if (action === "escalate") {
      await escalate(row, "Claim outlived the booking function — TBO state unknown. Check GetBookingDetails before refunding.");
      continue;
    }

    // From here every branch acts on the money, so take the row first.
    const claim = await claimIntent(row.order_id, "cron/settle-intents").catch((e) => {
      console.error("[settle-intents] claim failed", row.order_id, e);
      return null;
    });
    if (!claim || claim.kind !== "proceed") {
      bump("lost_claim");
      continue;
    }
    const attempts = row.attempts + 1;
    const releaseTo = row.status === "paid" ? "paid" : "awaiting_payment";

    try {
      const confirmed = await confirmPaidOrder({ orderId: row.order_id, expectBind: row.bind, kind: row.kind });

      if (!confirmed.ok) {
        if (confirmed.unpaid) {
          // Never paid and the order has expired: nothing to do, ever.
          await settleIntent(row.order_id, {
            status: "expired",
            result: { ok: false, unpaid: true, error: "Payment was not completed — you have not been charged." },
          });
          bump("expired");
        } else {
          // Paid, but the bind does not match its own row — impossible unless
          // something rewrote one side. A human, not a refund.
          await escalate(row, `Cashfree order does not match its intent: ${confirmed.error}`);
        }
        continue;
      }

      const payment = confirmed.payment;

      if (action === "complete") {
        const stored = row.request as IncomingBooking & { billing?: BillingDetails | null };
        const parsed = parseBookingRequest(stored);
        if (!parsed.ok) {
          // The stored request no longer parses — refund rather than guess.
          await refundAndSettle(row, payment, `stored request rejected: ${parsed.error}`);
          bump("refunded");
          continue;
        }
        const outcome = await ticketPaidFlight({
          bookingReq: parsed.req,
          payment,
          userId: row.user_id,
          billing: stored.billing ?? undefined,
          via: "cron/settle-intents",
        });
        // ticketPaidFlight settled the row itself, whichever way it went.
        await alertOps(
          outcome.ok
            ? "Completed a checkout the customer never saw finish"
            : "Abandoned checkout could not be ticketed — see outcome",
          {
            orderId: row.order_id,
            route: `${parsed.req.origin} → ${parsed.req.destination}`,
            departDate: parsed.req.departDate,
            email: row.email ?? "—",
            pnr: outcome.pnr ?? "—",
            refunded: outcome.refunded ?? false,
            error: outcome.error ?? "—",
            note: "The browser dropped after paying; the settle cron ran the ticketing path. The customer has been emailed.",
          },
        );
        bump(outcome.ok ? "completed" : "completed_failed");
        continue;
      }

      // refund | verify-and-paid
      await refundAndSettle(row, payment, "checkout abandoned after payment");
      bump("refunded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[settle-intents] attempt failed", row.order_id, msg);
      if (attempts >= MAX_ATTEMPTS) {
        await escalate(row, `Gave up after ${attempts} attempts: ${msg}`);
      } else {
        await recordIntentAttempt(row.order_id, { attempts, lastError: msg, releaseTo });
        bump("retry_later");
      }
    }
  }

  await purgeSettledRequests();
  await purgeOldActivity();

  // Counts only — passenger data has no place in a scheduler's log.
  console.log(`[settle-intents] ${rows.length} row(s) · ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  return Response.json({ ok: true, rows: rows.length, ...tally });
}

async function refundAndSettle(
  row: IntentRow,
  payment: { orderId: string; cfPaymentId: string; amountInr: number },
  why: string,
): Promise<void> {
  try {
    await refundOrder(payment.orderId, {
      amountInr: payment.amountInr,
      note: `Checkout not completed (${row.kind})`,
      kind: row.kind,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await settleIntent(row.order_id, {
      status: "refund_failed",
      cfPaymentId: payment.cfPaymentId,
      lastError: msg,
      result: {
        ok: false,
        refunded: false,
        error: "Your booking could not be completed and the refund needs manual processing — our team has been alerted.",
      },
    });
    await alertOps(`URGENT: ${row.kind} refund FAILED for abandoned checkout — settle manually`, {
      orderId: row.order_id,
      paymentId: payment.cfPaymentId,
      amountInr: payment.amountInr,
      email: row.email ?? "—",
      why,
      refundError: msg,
    });
    return;
  }

  await settleIntent(row.order_id, {
    status: "refunded",
    cfPaymentId: payment.cfPaymentId,
    result: {
      ok: false,
      refunded: true,
      error: "Your booking was not completed in time and your payment has been refunded.",
    },
  });
  if (emailConfigured && row.email) {
    try {
      await sendEmail({
        to: row.email,
        ...refundNoticeEmail({ kind: row.kind, amountInr: payment.amountInr, reference: payment.cfPaymentId }),
      });
    } catch (e) {
      console.error("[settle-intents] refund email failed (refund unaffected):", e);
    }
  }
  await alertOps(`Refunded an abandoned ${row.kind} checkout`, {
    orderId: row.order_id,
    paymentId: payment.cfPaymentId,
    amountInr: payment.amountInr,
    email: row.email ?? "—",
    why,
    note: "Money captured, nothing booked, the customer's request never arrived (or the TraceId had expired). Refund issued automatically.",
  });
}

async function escalate(row: IntentRow, why: string): Promise<void> {
  await settleIntent(row.order_id, { status: "escalated", lastError: why });
  await alertOps(`URGENT: ${row.kind} checkout needs a human — ${row.order_id}`, {
    orderId: row.order_id,
    status: row.status,
    paymentId: row.cf_payment_id ?? "—",
    amountInr: row.amount_inr,
    email: row.email ?? "—",
    claimedAt: row.claimed_at ?? "—",
    claimedBy: row.claimed_by ?? "—",
    attempts: row.attempts,
    why,
  });
}
