import "server-only";

/**
 * Placing the call — the one path, used by both callers.
 *
 * A dial is a single POST to ElevenLabs that returns as soon as the call is
 * accepted; it does NOT wait for the phone to connect, and comes back in well
 * under a second. That fact is why the website can ring a customer during their
 * own form submission, and why the queue no longer needs anything to come along
 * and drain it on a schedule.
 *
 * The history is worth keeping: the queue was built because the promised wait
 * (~2 min) is longer than a Vercel Hobby function may run (60s), so the request
 * accepting the lead could not also be the one that dialled. That reasoning was
 * sound, but it only ever applied to the WAIT. Remove the wait and the whole
 * schedule disappears — along with its failure mode, which cost two weeks of
 * callbacks when the external pinger silently died and nothing drained the queue.
 *
 * The queue table stays. It is still the duplicate guard, the durable record and
 * the recovery path: a row whose inline dial fails is left `pending` for
 * /api/cron/callback-queue to pick up later. Recovery can afford to be late in a
 * way the promise itself could not, so a coarse schedule is fine for it.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { placeOutboundCall } from "@/lib/elevenlabs-outbound";
import { markCallFailed, markCallPlaced, type QueuedCallback } from "@/lib/callback-queue";

export type DispatchOutcome = "placed" | "failed" | "not-claimed" | "unconfigured";

/**
 * Dial one already-claimed row and record the result.
 *
 * Never throws: every branch writes an outcome, so a row can't be stranded in
 * `calling` by an exception escaping here.
 */
export async function dispatchClaimedCallback(cb: QueuedCallback): Promise<DispatchOutcome> {
  try {
    const call = await placeOutboundCall({ toNumber: cb.phone, calleeName: cb.name });
    await markCallPlaced(cb.id, call);
    return "placed";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // markCallFailed returns the row to 'pending' until MAX_ATTEMPTS, so a dial
    // that fails inline is retried by the recovery drain rather than lost.
    await markCallFailed(cb.id, cb.attempts, message);
    return "failed";
  }
}

/**
 * Take ownership of one specific row and dial it immediately.
 *
 * The claim is the same compare-and-swap the batch drain uses (`update … where
 * id = ? and status = 'pending'`), so this racing the recovery drain is safe:
 * exactly one of them gets the row, and the loser dials nothing.
 */
export async function dispatchCallbackNow(id: string): Promise<DispatchOutcome> {
  if (!supabaseAdminConfigured) return "unconfigured";

  try {
    const { data: won, error } = await createAdminClient()
      .from("callback_queue")
      .update({ status: "calling", attempts: 1 })
      .eq("id", id)
      .eq("status", "pending") // ← the CAS: a lost race updates zero rows
      .select("id, name, phone, attempts")
      .maybeSingle();

    if (error) {
      console.error("[callback-dispatch] claim failed:", error.message);
      return "not-claimed";
    }
    if (!won) return "not-claimed";

    return await dispatchClaimedCallback({
      id: won.id as string,
      name: won.name as string,
      phone: won.phone as string,
      attempts: (won.attempts as number) ?? 1,
    });
  } catch (e) {
    // A row left in 'calling' is reaped back to 'pending' after STALE_CLAIM_MS,
    // so even this path recovers rather than losing the lead.
    console.error("[callback-dispatch] threw:", e);
    return "failed";
  }
}
