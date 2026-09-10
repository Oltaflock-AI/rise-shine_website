import {
  probeTboSearch,
  probeTboQuote,
  probeCashfree,
  probeProxy,
  probeCallbackQueue,
  probeLedgerOrphans,
} from "@/lib/health-probe";
import { recordCheck, type CheckResult } from "@/lib/ops-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// TBO Search + FareQuote against a live supplier; generous, but it must never be
// the monitor that times out and reports the site as broken.
export const maxDuration = 120;

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

  // The proxy check and the Cashfree check share nothing with the TBO booking
  // pair, so they run alongside it. Search → quote is sequential by necessity:
  // the quote needs the trace the search just minted.
  const [proxy, cashfree, queue, orphans, search] = await Promise.all([
    probeProxy(),
    probeCashfree(),
    probeCallbackQueue(),
    probeLedgerOrphans(),
    probeTboSearch(),
  ]);
  const quote = await probeTboQuote(search);

  const results: CheckResult[] = [proxy, search, quote, cashfree, queue, orphans];

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
