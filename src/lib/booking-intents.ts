import "server-only";

/**
 * Booking intents — the server's own copy of a checkout (migration 0017).
 *
 * The problem this solves: between Cashfree capturing the money and /api/book
 * returning, the only copy of the passenger payload used to be the customer's
 * browser tab. Close it — phone dies, network drops, popup dismissed — and the
 * money was captured with nothing on the server able to finish the ticket or
 * give it back. The hourly orphan alert then handed a human a manual refund.
 * Worse, "Network error — please try again" re-sent the same paid order to
 * /api/book, and a second Book could ticket twice.
 *
 * So the order route writes the parsed request here, the book route CLAIMS the
 * row compare-and-swap style before it touches TBO (two submits of one order
 * cannot both ticket; a repeat answers with what already happened), and
 * /api/cron/settle-intents sweeps whatever nobody finished: it completes a paid
 * flight while its TraceId still lives and refunds it once it does not.
 *
 * Everything is service-role and best-effort where the caller already decided
 * the customer-facing outcome; the claim is the one call that must not be
 * skipped, because it is the idempotency guard.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import type { CashfreeKind } from "@/lib/cashfree";

export const intentsConfigured = supabaseAdminConfigured;

export type IntentStatus =
  | "awaiting_payment"
  | "paid"
  | "ticketing"
  | "ticketed"
  | "refunded"
  | "refund_failed"
  | "expired"
  | "escalated";

/** Nothing further will ever happen to a row in one of these. */
const SETTLED: ReadonlySet<string> = new Set(["ticketed", "refunded", "refund_failed", "expired", "escalated"]);

export type IntentRow = {
  order_id: string;
  kind: CashfreeKind;
  bind: string;
  user_id: string | null;
  amount_inr: number;
  email: string | null;
  status: IntentStatus;
  request: Record<string, unknown>;
  result: Record<string, unknown> | null;
  cf_payment_id: string | null;
  paid_at: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  attempts: number;
  settled_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

// ── Timing rules ──────────────────────────────────────────────────────────────

/**
 * How long after capture the customer's own /api/book call gets to arrive
 * before the cron assumes the browser is gone. The client fires the request
 * the instant the popup resolves; three minutes is many multiples of that.
 */
const PAID_GRACE_MS = 3 * 60_000;

/**
 * The latest point after Search at which the cron will still start a Book.
 * TBO kills a TraceId at 15 minutes and Book + Ticket take real time, so a
 * 12-minute-old trace is the last one worth attempting; later, refund.
 */
const TRACE_BOOK_BUDGET_MS = 12 * 60_000;

/**
 * A Cashfree order lives 16 minutes (ORDER_EXPIRY floor in lib/cashfree). Past
 * that plus a margin for a late webhook, an `awaiting_payment` row can only be
 * one of two things — paid with the webhook lost, or abandoned — and one Get
 * Order tells which.
 */
const ORDER_SETTLE_AFTER_MS = 20 * 60_000;

/**
 * The booking function's own ceiling is 300 s. A claim older than this belongs
 * to a worker that died mid-flight, and TBO's state is unknown — that is a
 * human's call, never an automatic refund (TBO may well have ticketed).
 */
const CLAIM_STALE_MS = 8 * 60_000;

export type IntentAction = "none" | "wait" | "complete" | "refund" | "verify" | "escalate";

/**
 * What the settle cron should do with one unsettled row. Pure, and pinned by
 * tests/booking-intents.test.ts: every branch but "wait" moves money or
 * issues a ticket without a customer present.
 */
export function decideIntentAction(args: {
  kind: CashfreeKind;
  status: string;
  createdAt: string;
  paidAt: string | null;
  claimedAt: string | null;
  /** The flight request's Search timestamp (ms). Hotels have none. */
  searchedAt?: number | null;
  now: Date;
}): IntentAction {
  const now = args.now.getTime();
  if (SETTLED.has(args.status)) return "none";

  if (args.status === "ticketing") {
    const claimed = args.claimedAt ? new Date(args.claimedAt).getTime() : now;
    return now - claimed > CLAIM_STALE_MS ? "escalate" : "wait";
  }

  if (args.status === "paid") {
    const paid = args.paidAt ? new Date(args.paidAt).getTime() : new Date(args.createdAt).getTime();
    if (now - paid < PAID_GRACE_MS) return "wait";
    // Only a flight can be finished from here: its request is the complete
    // Book input. Hotel Book is never started from a cron.
    if (args.kind === "flight" && args.searchedAt && now - args.searchedAt < TRACE_BOOK_BUDGET_MS) {
      return "complete";
    }
    return "refund";
  }

  // awaiting_payment
  const created = new Date(args.createdAt).getTime();
  return now - created > ORDER_SETTLE_AFTER_MS ? "verify" : "wait";
}

// ── Claim interpretation ──────────────────────────────────────────────────────

export type ClaimOutcome =
  | { kind: "proceed" }
  | { kind: "replay"; result: Record<string, unknown> }
  | { kind: "busy" }
  | { kind: "missing" };

/**
 * Turn the compare-and-swap result into what the book route should do. Pure.
 *
 * A lost claim with a stored result means the booking already ran to an end —
 * ticketed OR refunded — and the customer must see that outcome, not a second
 * attempt. A lost claim with no result is a booking in flight elsewhere.
 */
export function interpretClaim(args: {
  won: boolean;
  status: string | null;
  result: Record<string, unknown> | null;
}): ClaimOutcome {
  if (args.won) return { kind: "proceed" };
  if (args.status === null) return { kind: "missing" };
  if (args.result) return { kind: "replay", result: args.result };
  return { kind: "busy" };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function createIntent(args: {
  orderId: string;
  kind: CashfreeKind;
  bind: string;
  userId: string | null;
  amountInr: number;
  email?: string;
  request: Record<string, unknown>;
}): Promise<void> {
  if (!intentsConfigured) return;
  const admin = createAdminClient();
  const { error } = await admin.from("booking_intents").insert({
    order_id: args.orderId,
    kind: args.kind,
    bind: args.bind,
    user_id: args.userId,
    amount_inr: args.amountInr,
    email: args.email ?? null,
    status: "awaiting_payment",
    request: args.request,
  });
  if (error) throw new Error(`booking_intents insert failed: ${error.message}`);
}

export async function readIntent(orderId: string): Promise<IntentRow | null> {
  if (!intentsConfigured) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("booking_intents").select("*").eq("order_id", orderId).maybeSingle();
  if (error) throw new Error(`booking_intents read failed: ${error.message}`);
  return (data as IntentRow | null) ?? null;
}

/**
 * Take the row into 'ticketing' if nobody has. The UPDATE's WHERE is the guard:
 * Postgres serialises the two writers, so exactly one sees a row come back.
 */
export async function claimIntent(orderId: string, by: string): Promise<ClaimOutcome> {
  if (!intentsConfigured) return { kind: "missing" };
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("booking_intents")
    .update({ status: "ticketing", claimed_at: now, claimed_by: by, updated_at: now })
    .eq("order_id", orderId)
    .in("status", ["awaiting_payment", "paid"])
    .select("order_id")
    .maybeSingle();
  if (error) throw new Error(`booking_intents claim failed: ${error.message}`);
  if (data) return { kind: "proceed" };

  const row = await readIntent(orderId);
  return interpretClaim({ won: false, status: row?.status ?? null, result: row?.result ?? null });
}

/** Webhook: the money moved. Never regresses a row already past 'awaiting_payment'. */
export async function markIntentPaid(orderId: string, cfPaymentId: string | undefined): Promise<void> {
  if (!intentsConfigured || !orderId) return;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("booking_intents")
    .update({ status: "paid", paid_at: now, cf_payment_id: cfPaymentId ?? null, updated_at: now })
    .eq("order_id", orderId)
    .eq("status", "awaiting_payment");
  if (error) console.error("[booking-intents] markPaid failed:", error.message);
}

/** Record where a claimed row ended up. Best-effort: the outcome already happened. */
export async function settleIntent(
  orderId: string,
  args: {
    status: Exclude<IntentStatus, "awaiting_payment" | "paid" | "ticketing">;
    result?: Record<string, unknown> | null;
    cfPaymentId?: string;
    lastError?: string;
  },
): Promise<void> {
  if (!intentsConfigured) return;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: args.status,
    settled_at: now,
    updated_at: now,
  };
  if (args.result !== undefined) patch.result = args.result;
  if (args.cfPaymentId) patch.cf_payment_id = args.cfPaymentId;
  if (args.lastError) patch.last_error = args.lastError.slice(0, 500);
  const { error } = await admin.from("booking_intents").update(patch).eq("order_id", orderId);
  if (error) console.error("[booking-intents] settle failed:", orderId, error.message);
}

/** A cron attempt that could not conclude: count it, keep the row live. */
export async function recordIntentAttempt(
  orderId: string,
  args: { attempts: number; lastError: string; releaseTo?: "paid" | "awaiting_payment" },
): Promise<void> {
  if (!intentsConfigured) return;
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    attempts: args.attempts,
    last_error: args.lastError.slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  if (args.releaseTo) {
    patch.status = args.releaseTo;
    patch.claimed_at = null;
    patch.claimed_by = null;
  }
  const { error } = await admin.from("booking_intents").update(patch).eq("order_id", orderId);
  if (error) console.error("[booking-intents] attempt record failed:", orderId, error.message);
}

/** Rows the cron has to look at, oldest first. Bounded to the last two days. */
export async function listUnsettledIntents(limit: number): Promise<IntentRow[]> {
  if (!intentsConfigured) return [];
  const admin = createAdminClient();
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("booking_intents")
    .select("*")
    .in("status", ["awaiting_payment", "paid", "ticketing"])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`booking_intents list failed: ${error.message}`);
  return (data as IntentRow[]) ?? [];
}

/**
 * The request column carries passport and PAN fields. Once a row is settled and
 * a month old nothing can still need them — blank it. Idempotent and cheap.
 */
export async function purgeSettledRequests(): Promise<void> {
  if (!intentsConfigured) return;
  const admin = createAdminClient();
  const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("booking_intents")
    .update({ request: {}, updated_at: new Date().toISOString() })
    .in("status", [...SETTLED])
    .lt("settled_at", before)
    .neq("request", "{}");
  if (error) console.error("[booking-intents] purge failed:", error.message);
}
