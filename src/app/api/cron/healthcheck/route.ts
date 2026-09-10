import {
  probeTboSearch,
  probeTboQuote,
  probeCashfree,
  probeProxy,
  probeCallbackQueue,
  probeLedgerOrphans,
  probeEmail,
  probeConfig,
} from "@/lib/health-probe";
import { recordCheck, type CheckResult } from "@/lib/ops-health";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// TBO Search + FareQuote against a live supplier; generous, but it must never be
// the monitor that times out and reports the site as broken.
export const maxDuration = 120;

/** The Sentry Cron monitor this route checks in to. Upserted on first run. */
const CRON_MONITOR_SLUG = process.env.SENTRY_CRON_MONITOR_SLUG || "rise-shine-healthcheck";

/**
 * GET /api/cron/healthcheck — does the money path still work?
 *
 * Runs every few minutes (schedule in vercel.json; Vercel sends
 * `Authorization: Bearer CRON_SECRET`, the same contract the other cron routes
 * use). It exists because on 10-Sep-2026 a customer hit "Could not start
 * payment" and there was nothing to check afterwards: no synthetic run, an hour
 * of log retention, and a client that had thrown the reason away. Everything
 * below would have answered it in seconds.
 *
 * What it covers, in the order a booking needs them:
 *   tbo_proxy       the static-IP proxy VPS is answering at all
 *   tbo_search      credentials, token, supplier inventory
 *   tbo_quote       the re-price that sets the amount charged
 *   cashfree_auth   the gateway accepts our keys
 *   callback_queue  something is actually draining the queue
 *   ledger_orphans  nobody paid and got nothing
 *   email_auth      Resend accepts the key that carries confirmations AND alerts
 *   config          every production-critical env var is still set
 *
 * It never books, charges or dials. Alerting/de-duplication is `recordCheck`,
 * so a long outage sends one email and a reminder every six hours, not one per
 * run — see lib/ops-health.ts for why that matters more than it sounds.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const started = Date.now();

  // Heartbeat to Sentry Cron Monitoring.
  //
  // Everything else here watches the site; nothing watched THIS. The route runs
  // on the same platform it monitors, so a broken deploy, a suspended project or
  // a Vercel outage takes the monitor down with the site — and silence is
  // indistinguishable from health. A check-in inverts that: Sentry alerts when
  // the heartbeat DOESN'T arrive, from outside our infrastructure.
  //
  // `monitorConfig` upserts the monitor, so there is nothing to create by hand.
  // Best-effort throughout: a Sentry failure must never stop the health checks.
  let checkInId: string | undefined;
  try {
    checkInId = Sentry.captureCheckIn(
      { monitorSlug: CRON_MONITOR_SLUG, status: "in_progress" },
      {
        schedule: { type: "crontab", value: "*/5 * * * *" },
        // Generous: a slow TBO search is not a dead monitor.
        checkinMargin: 5,
        maxRuntime: 5,
        timezone: "Etc/UTC",
      },
    );
  } catch (e) {
    console.error("[healthcheck] Sentry check-in failed to start", e);
  }

  // The proxy check and the Cashfree check share nothing with the TBO booking
  // pair, so they run alongside it. Search → quote is sequential by necessity:
  // the quote needs the trace the search just minted.
  const [proxy, cashfree, queue, orphans, email, search] = await Promise.all([
    probeProxy(),
    probeCashfree(),
    probeCallbackQueue(),
    probeLedgerOrphans(),
    probeEmail(),
    probeTboSearch(),
  ]);
  const quote = await probeTboQuote(search);
  const config = probeConfig();

  const results: CheckResult[] = [config, proxy, search, quote, cashfree, queue, orphans, email];

  // Record sequentially: each one may send mail, and a burst of parallel Resend
  // calls during a total outage is its own small denial of service.
  const decisions: Array<{ key: string; ok: boolean; detail: string; alerted: boolean; reason: string }> = [];
  for (const r of results) {
    const d = await recordCheck(r);
    decisions.push({ key: r.key, ok: r.ok, detail: r.detail, alerted: d.alerted, reason: d.reason });
  }

  const failing = results.filter((r) => !r.ok);

  // One line per run, always. Alerts only fire on transitions, so without this
  // a healthy monitor is indistinguishable in the logs from one that never ran —
  // and "did the check even happen?" is the first question during an incident.
  console.log(
    `[healthcheck] ${failing.length ? `FAILING: ${failing.map((f) => f.key).join(", ")}` : "all ok"} · ` +
      results.map((r) => `${r.key}=${r.ok ? "ok" : "FAIL"}(${r.durationMs ?? "-"}ms)`).join(" "),
  );

  try {
    if (checkInId) {
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: CRON_MONITOR_SLUG,
        // "error" marks the RUN as failing, which is what a failing dependency
        // is. The per-check email is still the detailed signal.
        status: failing.length ? "error" : "ok",
      });
      // captureCheckIn only QUEUES the event. On a serverless function the
      // response goes out and the instance freezes before the SDK's transport
      // gets to send it — so the opening "in_progress" arrived (the function
      // kept running for seconds after it) and the closing "ok" silently did
      // not, and Sentry reported every run as timed out while the site was
      // healthy. Wait for the transport; a couple of seconds is nothing next to
      // the TBO calls above.
      await Sentry.flush(3000);
    }
  } catch (e) {
    console.error("[healthcheck] Sentry check-in failed to close", e);
  }

  // 200 even when checks fail: the response describes the SITE's health, and a
  // non-200 here would make an uptime pinger alert about the monitor instead of
  // about the thing that broke. `ok` in the body is the signal.
  return Response.json({
    ok: failing.length === 0,
    checkedAt: new Date().toISOString(),
    tookMs: Date.now() - started,
    failing: failing.map((f) => f.key),
    checks: decisions,
  });
}
