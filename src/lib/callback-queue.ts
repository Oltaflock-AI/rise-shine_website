import "server-only";

/**
 * The voice-callback queue — the durable bit between "customer submitted the
 * form" and "the agent rings them".
 *
 * Why a queue at all: the promised delay (~2 min) is longer than a Vercel Hobby
 * function may run (60s), so the request that accepts the lead cannot be the one
 * that dials. It parks a row; `/api/cron/callback-queue` drains it. That also
 * buys retries and survives a redeploy landing mid-wait.
 *
 * Every write here uses the service-role client — `callback_queue` has RLS on
 * with no policies, so this module is the only way in.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { isDiallableIndianNumber, normalisePhone } from "@/lib/elevenlabs-outbound";
import { CALLBACK_DELAY_SECONDS } from "@/lib/callback-delay";

/** Give up after this many dial failures so one bad number can't loop forever. */
const MAX_ATTEMPTS = 3;

/** A claim older than this is assumed orphaned (function died mid-dispatch). */
const STALE_CLAIM_MS = 5 * 60 * 1000;

export const callbackQueueConfigured = supabaseAdminConfigured;

export interface QueuedCallback {
  id: string;
  name: string;
  phone: string;
  attempts: number;
}

export type EnqueueResult =
  | { ok: true; id: string; dueAt: string }
  | { ok: false; reason: "duplicate" | "invalid_phone" | "unconfigured" | "error"; message: string };

/**
 * Park a callback request. Returns `duplicate` when this number already has an
 * outstanding callback (enforced by a partial unique index, so it holds even if
 * two submissions race) — the caller should tell the customer they're already in
 * the queue rather than dialling them twice.
 */
export async function enqueueCallback(input: {
  name: string;
  phone: string;
  source?: string;
}): Promise<EnqueueResult> {
  if (!callbackQueueConfigured) {
    return { ok: false, reason: "unconfigured", message: "Supabase admin is not configured." };
  }

  const phone = normalisePhone(input.phone);
  if (!isDiallableIndianNumber(phone)) {
    return { ok: false, reason: "invalid_phone", message: "Not a diallable number." };
  }

  const dueAt = new Date(Date.now() + CALLBACK_DELAY_SECONDS * 1000).toISOString();

  const { data, error } = await createAdminClient()
    .from("callback_queue")
    .insert({
      name: input.name.trim(),
      phone,
      due_at: dueAt,
      source: input.source ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation, i.e. callback_queue_active_phone_idx.
    if (error.code === "23505") {
      return { ok: false, reason: "duplicate", message: "A callback is already queued." };
    }
    console.error("[callback-queue] enqueue failed:", error.message);
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true, id: data.id as string, dueAt };
}

/**
 * Atomically take ownership of up to `limit` due callbacks.
 *
 * The claim is a compare-and-swap per row (`update … where id = ? and status =
 * 'pending'`): if two dispatch runs overlap — easy to do with an external pinger
 * — only one gets the row back, so a customer is never dialled twice. Postgrest
 * can't express `select … for update skip locked`, and a double-dial is a much
 * worse failure than a slightly slower drain.
 */
export async function claimDueCallbacks(limit = 10): Promise<QueuedCallback[]> {
  const admin = createAdminClient();

  // Release orphaned claims first: a run that died after claiming but before
  // recording a result would otherwise strand the lead in 'calling' forever.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { error: reapError } = await admin
    .from("callback_queue")
    .update({ status: "pending" })
    .eq("status", "calling")
    .lt("updated_at", staleBefore)
    .lt("attempts", MAX_ATTEMPTS);
  if (reapError) console.error("[callback-queue] reaping stale claims failed:", reapError.message);

  const { data: due, error } = await admin
    .from("callback_queue")
    .select("id, name, phone, attempts")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("due_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[callback-queue] reading due rows failed:", error.message);
    return [];
  }
  if (!due?.length) return [];

  const claimed: QueuedCallback[] = [];
  for (const row of due) {
    const { data: won } = await admin
      .from("callback_queue")
      .update({ status: "calling", attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending") // ← the CAS: lost races update zero rows
      .select("id, name, phone, attempts")
      .maybeSingle();

    if (won) {
      claimed.push({
        id: won.id as string,
        name: won.name as string,
        phone: won.phone as string,
        attempts: (won.attempts as number) ?? 0,
      });
    }
  }
  return claimed;
}

/** Record a placed call. The conversation id links this lead to the dashboard. */
export async function markCallPlaced(
  id: string,
  call: { conversationId: string | null; sipCallId: string | null },
): Promise<void> {
  const { error } = await createAdminClient()
    .from("callback_queue")
    .update({
      status: "done",
      conversation_id: call.conversationId,
      sip_call_id: call.sipCallId,
      last_error: null,
    })
    .eq("id", id);
  if (error) console.error("[callback-queue] markCallPlaced failed:", error.message);
}

/**
 * Record a failed dial. Rows below MAX_ATTEMPTS go back to 'pending' for the
 * next drain; the last attempt is parked as 'failed' for a human to chase.
 */
export async function markCallFailed(
  id: string,
  attempts: number,
  message: string,
): Promise<void> {
  const exhausted = attempts >= MAX_ATTEMPTS;
  const { error } = await createAdminClient()
    .from("callback_queue")
    .update({
      status: exhausted ? "failed" : "pending",
      last_error: message.slice(0, 500),
    })
    .eq("id", id);
  if (error) console.error("[callback-queue] markCallFailed failed:", error.message);
}
