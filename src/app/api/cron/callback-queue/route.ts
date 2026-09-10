import { elevenLabsConfigured } from "@/lib/elevenlabs-outbound";
import { claimDueCallbacks, callbackQueueConfigured } from "@/lib/callback-queue";
import { dispatchClaimedCallback } from "@/lib/callback-dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The batch is sized to finish well inside a minute — `outbound-call` only
// *initiates* the call, it doesn't wait for it to connect — so the drain can
// never overlap the next minute's run.
export const maxDuration = 60;

const BATCH = 10;

/**
 * GET /api/cron/callback-queue — drain due callbacks and dial them.
 *
 * Run every minute by Vercel Cron (vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * It used to live on an external pinger because Hobby would not schedule below
 * daily, and a ~2 minute callback promise needs per-minute cadence. That pinger
 * died silently in August 2026 and leads sat in the queue unanswered with
 * nothing to announce it — which is why the schedule is back on the platform
 * now that the project is on Pro, and why /api/cron/healthcheck separately
 * alerts on overdue rows rather than trusting any scheduler to stay alive.
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
    if ((await dispatchClaimedCallback(cb)) === "placed") placed += 1;
    else failed += 1;
  }

  // Counts only — the caller is a scheduler, and lead names/numbers have no
  // business in a response body or a third-party pinger's execution log.
  const summary = { ok: true, claimed: claimed.length, placed, failed };
  console.log("[cron/callback-queue]", summary);
  return Response.json(summary);
}

/** Some schedulers only send POST; same handler, same auth. */
export const POST = GET;
