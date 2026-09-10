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
import { probeEmailAuth } from "@/lib/email";
import net from "node:net";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import type { CheckResult } from "@/lib/ops-health";

/** The route the monitor prices. Busy, always-served domestic pair. */
const PROBE_FROM = "AMD";
const PROBE_TO = "BOM";

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
 * The static-IP proxy VPS, checked as itself.
 *
 * Opens a TCP connection to the proxy and closes it. That is deliberately all:
 * the proxy only permits CONNECT to TBO's hosts, so an earlier version of this
 * check that asked an IP-echo service what our egress address was could not get
 * out and reported a false outage on a proxy that was serving live searches
 * perfectly well. Reachability is the part that can be tested without going
 * through it.
 *
 * Whether the address is still the WHITELISTED one needs no separate check:
 * TBO rejects calls from any other IP, so `tbo_search` fails within the same
 * five minutes if the VPS is rebuilt onto a new address. This probe's job is to
 * tell "the box is gone" apart from "TBO is having a bad day".
 */
export async function probeProxy(): Promise<CheckResult> {
  const base = { key: "tbo_proxy", label: "TBO static-IP proxy" };
  const raw = process.env.TBO_PROXY_URL?.trim();
  if (!raw) return { ...base, ok: true, detail: "no proxy configured (direct egress)" };

  let host: string;
  let port: number;
  try {
    const u = new URL(raw);
    host = u.hostname;
    port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
  } catch {
    return { ...base, ok: false, detail: "TBO_PROXY_URL is not a valid URL" };
  }

  const t0 = Date.now();
  const outcome = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean, detail: string) => {
      sock.removeAllListeners();
      sock.destroy();
      resolve({ ok, detail });
    };
    sock.setTimeout(8000);
    sock.once("connect", () => done(true, `TCP connect to ${host}:${port} ok`));
    sock.once("timeout", () => done(false, `no answer from ${host}:${port} within 8s — VPS down or firewalled`));
    sock.once("error", (e) => done(false, `${host}:${port} — ${e.message}`));
    sock.connect(port, host);
  });

  return { ...base, ...outcome, durationMs: Date.now() - t0 };
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

/**
 * Resend — the transport under every confirmation email and every ops alert.
 * A revoked key fails twice: the customer gets no ticket mail, and the alert
 * about it cannot send either. Sends nothing.
 */
export async function probeEmail(): Promise<CheckResult> {
  const base = { key: "email_auth", label: "Resend email transport" };
  try {
    const { value, ms } = await timed(() => probeEmailAuth());
    return { ...base, ok: value.ok, detail: value.detail, durationMs: ms };
  } catch (e) {
    return { ...base, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The environment variables production cannot run without.
 *
 * Every one of these has a "degrades silently" failure mode by design — the
 * build succeeds without any of them, so that dev and CI work — which is also
 * why a variable dropped in a Vercel settings edit, or never copied to a new
 * project, shows up as customers quietly not getting something rather than as
 * an error. `ELEVENLABS_AGENT_ID` did exactly that once: the webhook returned
 * 200 on every event and recorded none. This turns "unset" into a red check.
 *
 * Pure over an env-shaped record so it can be tested without the process.
 */
export const REQUIRED_ENV: ReadonlyArray<{ key: string; why: string }> = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", why: "auth, accounts, every table" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", why: "browser auth" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", why: "booking mirror, ledger, queues, this monitor's state" },
  { key: "TBO_CLIENT_ID", why: "flight search and ticketing" },
  { key: "TBO_USERNAME", why: "flight search and ticketing" },
  { key: "TBO_PASSWORD", why: "flight search and ticketing" },
  { key: "CASHFREE_APP_ID", why: "no payment page, no flight bookings" },
  { key: "CASHFREE_SECRET_KEY", why: "no payment page, webhooks rejected" },
  { key: "RESEND_API_KEY", why: "confirmation email and every ops alert" },
  { key: "CRON_SECRET", why: "every cron route answers 503" },
  { key: "ELEVENLABS_AGENT_ID", why: "outbound calls fail, inbound webhook drops every event" },
  { key: "ELEVENLABS_API_KEY", why: "callback queue cannot dial" },
  { key: "ELEVENLABS_PHONE_NUMBER_ID", why: "callback queue cannot dial" },
  { key: "ELEVENLABS_WEBHOOK_SECRET", why: "call records rejected" },
];

export function missingRequiredEnv(env: Record<string, string | undefined>): Array<{ key: string; why: string }> {
  return REQUIRED_ENV.filter(({ key }) => !env[key]?.trim());
}

export function probeConfig(env: Record<string, string | undefined> = process.env): CheckResult {
  const base = { key: "config", label: "Required environment variables" };
  // Only meaningful where the variables are expected to exist: a local run
  // without ElevenLabs is not an outage.
  if (env.VERCEL_ENV !== "production") return { ...base, ok: true, detail: `skipped — VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}` };
  const missing = missingRequiredEnv(env);
  if (!missing.length) return { ...base, ok: true, detail: `${REQUIRED_ENV.length} present` };
  return {
    ...base,
    ok: false,
    detail: `missing: ${missing.map((m) => `${m.key} (${m.why})`).join("; ")}`,
  };
}
