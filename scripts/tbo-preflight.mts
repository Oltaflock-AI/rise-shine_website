/**
 * TBO go-live preflight — verify live credentials, endpoints and egress IP
 * BEFORE any customer traffic depends on them.
 *
 * Read-only: it calls Authenticate and (optionally) Search. It never books,
 * tickets or cancels anything, so it is safe to run against production.
 *
 * It exists because the three things that break a TBO cutover all fail at the
 * same place — the first Authenticate — with errors that look alike:
 *
 *   wrong ClientId      production uses a different ClientId from staging, and
 *                       forgetting it authenticates against the wrong tenant
 *   wrong endpoint      TBO's mail lists service bases ending `.svc`; the REST
 *                       methods hang off `.svc/rest`. A wrong path answers with
 *                       the plain-text body `Invalid Resource Requested`
 *   un-whitelisted IP   production creds are IP-scoped and Vercel has no fixed
 *                       egress IP, so calls must leave via TBO_PROXY_URL. A
 *                       proxy that is down or bypassed reads as "bad credentials"
 *
 * Usage:  npx tsx --conditions=react-server scripts/tbo-preflight.mts [--search]
 *
 *   --conditions=react-server  required: lib/tbo-fetch declares `server-only`, which
 *                              throws under plain Node. This resolves it to the no-op
 *                              variant so the script exercises the REAL fetch path
 *                              (and therefore the real proxy behaviour), not a copy.
 *   --search                   additionally run one live Search against the Air host.
 *
 * Exit code 0 = safe to cut over, 1 = do not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
try {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {
  console.log("No .env.local found — reading configuration from the environment.\n");
}

// Imported dynamically, AFTER .env.local is loaded — tbo-fetch builds its ProxyAgent
// from TBO_PROXY_URL at module scope, so a static import would capture an unset value.
const { tboFetch } = await import("../src/lib/tbo-fetch");

const AUTH_BASE = (
  process.env.TBO_AUTH_URL || "http://Sharedapi.tektravels.com/SharedData.svc/rest"
).replace(/\/+$/, "");
const AIR_BASE = (
  process.env.TBO_AIR_URL || "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest"
).replace(/\/+$/, "");
const BOOK_BASE = (
  process.env.TBO_BOOK_URL ||
  "http://api.tektravels.com/BookingEngineService_AirBook/AirService.svc/rest"
).replace(/\/+$/, "");

const clientId = process.env.TBO_CLIENT_ID ?? "";
const username = process.env.TBO_USERNAME ?? "";
const password = process.env.TBO_PASSWORD ?? "";
const endUserIp = process.env.TBO_END_USER_IP || "115.112.175.13";
const proxy = process.env.TBO_PROXY_URL?.trim();

const ok = (s: string) => `  PASS  ${s}`;
const bad = (s: string) => `  FAIL  ${s}`;
const warn = (s: string) => `  WARN  ${s}`;

/** Redact a secret to a recognisable stub — enough to spot a wrong value, not enough to leak one. */
const stub = (v: string) => (v ? `${v.slice(0, 2)}${"*".repeat(Math.max(v.length - 2, 0))}` : "(unset)");

console.log("── Configuration ──────────────────────────────────────────────");
console.log(`  Authenticate  ${AUTH_BASE}`);
console.log(`  Air service   ${AIR_BASE}`);
console.log(`  Book service  ${BOOK_BASE}`);
console.log(`  ClientId      ${clientId || "(unset)"}`);
console.log(`  Username      ${stub(username)}`);
console.log(`  Password      ${stub(password)}`);
console.log(`  EndUserIp     ${endUserIp}`);
console.log(`  Proxy         ${proxy ? proxy.replace(/\/\/[^@]*@/, "//***:***@") : "(unset — calls go direct)"}`);
console.log();

let failed = false;
const fail = (m: string) => {
  console.log(bad(m));
  failed = true;
};

console.log("── Preflight ──────────────────────────────────────────────────");

if (!clientId || !username || !password) {
  fail("TBO_CLIENT_ID / TBO_USERNAME / TBO_PASSWORD are not all set — nothing to verify.");
  process.exit(1);
}

const isProdEndpoint = AUTH_BASE.includes("travelboutiqueonline.com");
if (isProdEndpoint && !proxy) {
  console.log(
    warn(
      "Production endpoints with no TBO_PROXY_URL. Production credentials are IP-whitelisted; " +
        "unless this machine's IP is the whitelisted one, Authenticate will fail below.",
    ),
  );
}
if (isProdEndpoint && !process.env.TBO_BOOK_URL) {
  console.log(
    warn(
      "TBO_BOOK_URL is unset while using production endpoints. Production serves Book from its " +
        "own host; leaving this unset points Book at the staging AirBook default.",
    ),
  );
}

// ── Authenticate ──────────────────────────────────────────────────────────────
let token = "";
try {
  const started = Date.now();
  const r = await tboFetch(`${AUTH_BASE}/Authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ClientId: clientId, UserName: username, Password: password, EndUserIp: endUserIp }),
    cache: "no-store",
  });
  const text = await r.text();
  const ms = Date.now() - started;

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Non-JSON has two very different causes and guessing wrong costs hours.
    // TBO's own "wrong path" reply is a short plain-text body on a 200/404 FROM
    // TBO; anything else here is usually something in between us and TBO — the
    // static-IP proxy, a corporate egress filter, a captive gateway.
    const body = text.trim();
    const looksLikeTbo = /invalid resource requested/i.test(body);
    fail(`Authenticate returned non-JSON in ${ms}ms (HTTP ${r.status}): "${body.slice(0, 90)}"`);
    console.log(
      looksLikeTbo
        ? "        That is TBO's wrong-path signature. Check the /rest suffix on TBO_AUTH_URL."
        : "        This does not look like TBO's wrong-path reply, so suspect the network path\n" +
          "        first (TBO_PROXY_URL down, or an egress filter blocking the host) and the\n" +
          "        /rest suffix on TBO_AUTH_URL second.",
    );
    process.exit(1);
  }

  if (j.Status === 1 && typeof j.TokenId === "string" && j.TokenId) {
    token = j.TokenId;
    console.log(ok(`Authenticate (${ms}ms) — TokenId issued, ${proxy ? "via the proxy" : "direct"}.`));
    const member = j.Member as Record<string, unknown> | undefined;
    if (member?.AgencyId) console.log(`        AgencyId ${member.AgencyId}  MemberId ${member.MemberId ?? "?"}`);
  } else {
    const err = (j.Error ?? {}) as { ErrorCode?: number; ErrorMessage?: string };
    fail(`Authenticate rejected (${ms}ms): [${err.ErrorCode ?? "?"}] ${err.ErrorMessage ?? JSON.stringify(j).slice(0, 120)}`);
    console.log(
      "        Most likely causes, in order: the IP this call left from is not whitelisted " +
        "with TBO; the ClientId is the staging one; the username/password belong to the other environment.",
    );
  }
} catch (e) {
  fail(`Authenticate threw: ${e instanceof Error ? e.message : String(e)}`);
  console.log("        A connection error here usually means TBO_PROXY_URL is unreachable.");
}

// ── Search (optional) ─────────────────────────────────────────────────────────
if (token && process.argv.includes("--search")) {
  const depart = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  try {
    const started = Date.now();
    const r = await tboFetch(`${AIR_BASE}/Search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        EndUserIp: endUserIp,
        TokenId: token,
        AdultCount: 1,
        ChildCount: 0,
        InfantCount: 0,
        JourneyType: 1,
        Segments: [
          {
            Origin: "DEL",
            Destination: "BOM",
            FlightCabinClass: 1,
            PreferredDepartureTime: `${depart}T00:00:00`,
            PreferredArrivalTime: `${depart}T00:00:00`,
          },
        ],
      }),
      cache: "no-store",
    });
    const text = await r.text();
    const ms = Date.now() - started;
    let j: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      j = JSON.parse(text);
    } catch {
      fail(`Search returned non-JSON in ${ms}ms: "${text.trim().slice(0, 80)}" — check TBO_AIR_URL's /rest suffix.`);
      j = {};
    }
    const results = j?.Response?.Results?.[0]?.length ?? 0;
    const err = j?.Response?.Error;
    if (results > 0) {
      console.log(ok(`Search DEL→BOM ${depart} (${ms}ms) — ${results} live results, TraceId ${j.Response.TraceId}.`));
    } else if (err?.ErrorCode) {
      fail(`Search rejected (${ms}ms): [${err.ErrorCode}] ${err.ErrorMessage}`);
    } else if (Object.keys(j).length) {
      console.log(warn(`Search returned 0 results (${ms}ms). Not necessarily an error on this date/sector.`));
    }
  } catch (e) {
    fail(`Search threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log();
console.log(failed ? "Preflight FAILED — do not cut over." : "Preflight passed.");
process.exit(failed ? 1 : 0);
