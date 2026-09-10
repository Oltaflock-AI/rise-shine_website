import "server-only";

/**
 * Synthetic probes for the paths that take money.
 *
 * Everything here answers one question: if a customer pressed "Pay & issue
 * ticket" right now, would it work? Each probe is independent and returns a
 * CheckResult rather than throwing, so one broken dependency still lets the
 * rest report — the point of a monitor is to say WHICH part died.
 *
 * Read-only by construction. Nothing here books, charges, dials or writes to a
 * supplier; see `probeCashfreeAuth` for why the payment probe reads a
 * non-existent order instead of opening a real one.
 */
import { searchFlights } from "@/lib/tbo";
import { todayInIndiaISO } from "@/lib/stay-dates";
import { quoteFare } from "@/lib/tbo-book";
import { probeCashfreeAuth, cashfreeConfigured } from "@/lib/cashfree";
import { tboFetch } from "@/lib/tbo-fetch";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import type { CheckResult } from "@/lib/ops-health";

/** The route the monitor prices. Busy, always-served domestic pair. */
const PROBE_FROM = "AMD";
const PROBE_TO = "BOM";

/**
 * The static egress IP TBO whitelists for our production credentials. If the
 * proxy VPS is rebuilt and comes back on a different address, every TBO call
 * starts failing and nothing else in the system would say why.
 */
const EXPECTED_EGRESS_IP = process.env.TBO_EXPECTED_EGRESS_IP?.trim() || "";

/** Two services, because a single one being down must not read as our outage. */
const IP_ECHO_URLS = ["https://api.ipify.org?format=json", "https://ifconfig.co/json"];

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

/** A date far enough out to always have inventory, in IST (see defaultDates). */
function probeDateISO(): string {
  const d = new Date(`${todayInIndiaISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString().slice(0, 10);
}

/**
 * TBO Search. Proves, in one call: the credentials, the auth token, the proxy
 * path, the IP whitelist and that the supplier is returning inventory.
 * Also hands back the trace the fare-quote probe needs.
 */
export async function probeTboSearch(): Promise<
  CheckResult & { traceId?: string; searchedAt?: number; resultIndex?: string }
> {
  const base = { key: "tbo_search", label: "TBO flight search" };
  try {
    const { value: res, ms } = await timed(() =>
      searchFlights({ from: PROBE_FROM, to: PROBE_TO, departISO: probeDateISO(), adults: 1 }),
    );
    if (!res.ok || !res.traceId) {
      return { ...base, ok: false, detail: res.error || "search returned no TraceId", durationMs: ms };
    }
    if (!res.outbound.length) {
      // A live, correctly-authenticated search that finds nothing on a trunk
      // route is not "fine" — it is what a de-provisioned account looks like.
      return { ...base, ok: false, detail: "search returned 0 offers", durationMs: ms };
    }
    return {
      ...base,
      ok: true,
      detail: `${res.outbound.length} offers, cheapest INR ${res.cheapestINR ?? "?"}`,
      durationMs: ms,
      traceId: res.traceId,
      searchedAt: res.searchedAt,
      resultIndex: res.outbound[0].id,
    };
  } catch (e) {
    return { ...base, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * FareQuote — the last supplier call before a customer is charged, and the one
 * that decides the amount. A search that works while this fails still means no
 * one can pay.
 */
export async function probeTboQuote(args: {
  traceId?: string;
  searchedAt?: number;
  resultIndex?: string;
}): Promise<CheckResult> {
  const base = { key: "tbo_quote", label: "TBO fare quote (pre-payment pricing)" };
  if (!args.traceId || !args.resultIndex || !args.searchedAt) {
    return { ...base, ok: false, detail: "skipped — search did not produce a quotable result" };
  }
  try {
    const { value: q, ms } = await timed(() =>
      quoteFare({ traceId: args.traceId!, searchedAt: args.searchedAt!, resultIndex: args.resultIndex! }),
    );
    if (!q.ok || !q.publishedFare) {
      return { ...base, ok: false, detail: q.error || "quote returned no fare", durationMs: ms };
    }
    return { ...base, ok: true, detail: `re-priced at INR ${q.publishedFare}`, durationMs: ms };
  } catch (e) {
    return { ...base, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Cashfree credentials + reachability. Creates nothing. */
export async function probeCashfree(): Promise<CheckResult> {
  const base = { key: "cashfree_auth", label: "Cashfree payment gateway" };
  if (!cashfreeConfigured) {
    return { ...base, ok: false, detail: "Cashfree keys are not configured — no flight can be paid for." };
  }
  try {
    const { value, ms } = await timed(() => probeCashfreeAuth("flight"));
    return { ...base, ok: value.ok, detail: value.detail, durationMs: ms };
  } catch (e) {
    return { ...base, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The static-IP proxy, checked as itself.
 *
 * TBO Search failing already implies something is wrong, but not what: this
 * separates "the proxy VPS is gone" and "the VPS came back on a new IP" — which
 * silently voids the whitelist — from "TBO is having a bad day". Set
 * TBO_EXPECTED_EGRESS_IP to the whitelisted address to get the second check.
 */
export async function probeEgressIp(): Promise<CheckResult> {
  const base = { key: "tbo_egress_ip", label: "TBO static-IP proxy" };
  if (!process.env.TBO_PROXY_URL?.trim()) {
    return { ...base, ok: true, detail: "no proxy configured (direct egress)" };
  }
  const failures: string[] = [];
  for (const url of IP_ECHO_URLS) {
    try {
      const { value: ip, ms } = await timed(async () => {
        const r = await tboFetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const j = (await r.json()) as { ip?: string };
        return (j.ip ?? "").trim();
      });
      if (!ip) {
        failures.push(`${url}: no ip in response`);
        continue;
      }
      if (EXPECTED_EGRESS_IP && ip !== EXPECTED_EGRESS_IP) {
        return {
          ...base,
          ok: false,
          detail: `egress IP is ${ip}, expected ${EXPECTED_EGRESS_IP} — TBO's whitelist will reject this`,
          durationMs: ms,
        };
      }
      return {
        ...base,
        ok: true,
        detail: EXPECTED_EGRESS_IP ? `egress IP ${ip} (whitelisted)` : `egress IP ${ip} (no expected IP set)`,
        durationMs: ms,
      };
    } catch (e) {
      failures.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Both echo services failed THROUGH the proxy — the proxy is the common factor.
  return { ...base, ok: false, detail: `proxy unreachable — ${failures.join("; ")}` };
}

/**
 * Is anything actually draining the callback queue?
 *
 * The external pinger died in August and nothing announced it: leads sat in
 * `callback_queue` past their promised time while the site kept accepting more.
 * A row overdue by more than STALE_MIN means the dispatcher is not running.
 */
const STALE_MIN = 15;

export async function probeCallbackQueue(): Promise<CheckResult> {
  const base = { key: "callback_queue", label: "Callback queue dispatcher" };
  if (!supabaseAdminConfigured) return { ...base, ok: true, detail: "skipped — no Supabase admin" };
  try {
    const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
    const admin = createAdminClient();
    const { data, error, count } = await admin
      .from("callback_queue")
      .select("id, phone, due_at", { count: "exact" })
      .eq("status", "pending")
      .lt("due_at", cutoff)
      .order("due_at", { ascending: true })
      .limit(5);
    if (error) return { ...base, ok: false, detail: `queue read failed: ${error.message}` };
    const n = count ?? data?.length ?? 0;
    if (!n) return { ...base, ok: true, detail: "no overdue callbacks" };
    const oldest = data?.[0]?.due_at ?? "?";
    return {
      ...base,
      ok: false,
      detail: `${n} callback(s) overdue by >${STALE_MIN} min — nothing is draining the queue. Oldest due ${oldest}.`,
    };
  } catch (e) {
    return { ...base, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Money captured with no booking on record.
 *
 * The weekly reconcile digest already reports this, but a week is far too long
 * to learn that a customer paid and got nothing. Anything unmatched for over an
 * hour (well past the 120s booking-detail re-read and any retry) is escalated
 * now. Guest bookings are never mirrored by design, so this reads as
 * "check by hand", not as proof of loss.
 */
export async function probeLedgerOrphans(): Promise<CheckResult> {
  const base = { key: "ledger_orphans", label: "Captured payments with no booking" };
  if (!supabaseAdminConfigured) return { ...base, ok: true, detail: "skipped — no Supabase admin" };
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: captured, error } = await admin
      .from("payments")
      .select("cf_payment_id, amount_inr, email, created_at")
      .eq("status", "captured")
      .gte("created_at", since)
      .lt("created_at", until);
    if (error) return { ...base, ok: false, detail: `ledger read failed: ${error.message}` };
    const rows = captured ?? [];
    if (!rows.length) return { ...base, ok: true, detail: "no captured payments in the window" };

    const ids = rows.map((p) => p.cf_payment_id);
    const { data: matched } = await admin
      .from("bookings")
      .select("cf_payment_id")
      .in("cf_payment_id", ids);
    const known = new Set((matched ?? []).map((b) => b.cf_payment_id));
    const orphans = rows.filter((p) => !known.has(p.cf_payment_id));
    if (!orphans.length) return { ...base, ok: true, detail: `${rows.length} captured, all matched` };
    return {
      ...base,
      ok: false,
      detail:
        `${orphans.length} captured payment(s) over an hour old with no booking row — ` +
        `verify in Cashfree/TBO: ${orphans.slice(0, 5).map((o) => o.cf_payment_id).join(", ")}`,
    };
  } catch (e) {
    return { ...base, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
