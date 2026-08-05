import { elevenLabsConfigured, placeOutboundCall } from "@/lib/elevenlabs-outbound";
import {
  claimDueCallbacks,
  markCallFailed,
  markCallPlaced,
  callbackQueueConfigured,
} from "@/lib/callback-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Hobby caps functions at 60s. The batch is sized to finish well inside that —
// `outbound-call` only *initiates* the call, it doesn't wait for it to connect.
export const maxDuration = 60;

const BATCH = 10;

/**
 * GET /api/cron/callback-queue — drain due callbacks and dial them.
 *
 * Called on a short interval by an external pinger (cron-job.org, UptimeRobot, a
 * GitHub Actions schedule…) sending `Authorization: Bearer $CRON_SECRET`, same
 * contract Vercel Cron uses for /api/cron/reconcile. It is NOT in vercel.json:
 * Vercel Cron on the Hobby plan won't run at the per-minute cadence a ~2 minute
 * callback promise needs, so the schedule lives outside the platform.
 *
 * Safe to call as often as you like — it claims rows compare-and-swap style, so
 * overlapping runs can't dial the same lead twice, and an empty queue is a
 * cheap no-op.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!callbackQueueConfigured) {
    return Response.json({ ok: false, error: "Supabase admin is not configured." }, { status: 503 });
  }
  if (!elevenLabsConfigured) {
    return Response.json({ ok: false, error: "ElevenLabs is not configured." }, { status: 503 });
  }

  const claimed = await claimDueCallbacks(BATCH);
  if (!claimed.length) return Response.json({ ok: true, claimed: 0, placed: 0, failed: 0 });

  let placed = 0;
  let failed = 0;

  // Sequential on purpose: the batch is small, and dialling one at a time keeps
  // us clear of ElevenLabs' concurrency limits. A row already claimed above is
  // never left in 'calling' — every branch records a result.
  for (const cb of claimed) {
    try {
      const call = await placeOutboundCall({ toNumber: cb.phone, calleeName: cb.name });
      await markCallPlaced(cb.id, call);
      placed += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[cron/callback-queue] dial failed for ${cb.id}:`, message);
      await markCallFailed(cb.id, cb.attempts, message);
      failed += 1;
    }
  }

  // Counts only — the caller is a scheduler, and lead names/numbers have no
  // business in a response body or a third-party pinger's execution log.
  const summary = { ok: true, claimed: claimed.length, placed, failed };
  console.log("[cron/callback-queue]", summary);
  return Response.json(summary);
}

/** Some schedulers only send POST; same handler, same auth. */
export const POST = GET;
