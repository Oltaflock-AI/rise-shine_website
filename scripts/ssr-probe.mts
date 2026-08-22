/**
 * What flight add-ons does TBO actually sell us, and at which point in the flow?
 *
 * Three questions the docs alone do not settle:
 *   1. What is really in the SSR catalogue on OUR credentials — free vs. paid
 *      seat / meal / baggage, and how the LCC and GDS shapes differ.
 *   2. Whether an add-on can be sold AFTER a ticket is issued.
 *   3. Which methods exist at all. TBO answers an unknown method with an IIS
 *      404 page and a real one with HTTP 200 + its own error object, so the
 *      status code alone maps the API surface without needing a live booking.
 *
 * Usage: npx tsx --conditions=react-server scripts/ssr-probe.mts
 *
 * The `--conditions=react-server` flag is required: `src/lib/tbo-fetch.ts`
 * imports `server-only`, which throws outside a Server Component unless that
 * export condition resolves it to the empty module.
 */
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const { getAuthToken, searchFlights, defaultDates } = await import("../src/lib/tbo");
const { tboFetch } = await import("../src/lib/tbo-fetch");

// The SAME env names the app uses — TBO_SEARCH_URL / TBO_BOOK_URL. Reading a
// different name silently falls back to the tektravels demo host, where a
// production token is rejected as "Invalid Token" and every probe lies.
const SEARCH_SVC = (
  process.env.TBO_SEARCH_URL ||
  "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest"
).replace(/\/+$/, "");
const BOOK_SVC = (
  process.env.TBO_BOOK_URL ||
  "http://api.tektravels.com/BookingEngineService_AirBook/AirService.svc/rest"
).replace(/\/+$/, "");
console.log("Search svc:", SEARCH_SVC, "\nBook   svc:", BOOK_SVC);

const token = await getAuthToken();
if (!token) {
  // Show WHY, rather than a bare null — creds are IP-whitelisted via TBO_PROXY_URL.
  const raw = await tboFetch(`${process.env.TBO_AUTH_URL}/Authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ClientId: process.env.TBO_CLIENT_ID,
      UserName: process.env.TBO_USERNAME,
      Password: process.env.TBO_PASSWORD,
      EndUserIp: process.env.TBO_END_USER_IP || "127.0.0.1",
    }),
  });
  console.error("Authenticate →", raw.status, (await raw.text()).slice(0, 300));
  process.exit(1);
}

async function post(url: string, body: Record<string, unknown>) {
  const res = await tboFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // TBO binds the search session to the EndUserIp it was opened with — send a
    // different one and the TraceId comes back "expired" seconds after Search.
    body: JSON.stringify({
      EndUserIp: process.env.TBO_END_USER_IP || "127.0.0.1",
      TokenId: token,
      ...body,
    }),
  });
  const text = await res.text();
  try {
    return { http: res.status, json: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { http: res.status, json: null, text: text.slice(0, 300) };
  }
}

// ── 1. a live search, so we have a TraceId + ResultIndex ─────────────────────
const { departISO } = defaultDates();
const search = await searchFlights({
  from: "DEL",
  to: "BOM",
  departISO,
  adults: 1,
  children: 0,
  infants: 0,
  cabin: "Economy",
});
if (!search.ok || !search.outbound.length)
  throw new Error(`search failed: ${search.error ?? "no results"}`);

// Probe both an LCC and a GDS fare — the SSR catalogue differs sharply between them.
const picks = [
  search.outbound.find((o) => o.isLCC),
  search.outbound.find((o) => !o.isLCC),
].filter(Boolean) as typeof search.outbound;
console.log(`\nSearch: ${search.outbound.length} offers · trace ${search.traceId}`);

// ── 2. SSR — the pre-book add-on catalogue ───────────────────────────────────

/** SSR nests differently per family:
 *    Baggage / MealDynamic  → [segment][option]
 *    SeatDynamic            → [segment].SegmentSeat[].RowSeats[].Seats[]
 *    SpecialServices        → [segment].SegmentSpecialService[].SSRService[]
 *  A one-level flatten counts a whole seat map as a single "option", which is
 *  how an earlier read of these logs undercounted the seat map to 1.
 */
const flatten = (groups: unknown): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const nested = ["SegmentSeat", "RowSeats", "Seats", "SegmentSpecialService", "SSRService"];
    const child = nested.find((k) => Array.isArray(o[k]));
    if (child) return walk(o[child]);
    out.push(o);
  };
  walk(groups);
  return out;
};

const summarise = (label: string, groups: unknown) => {
  if (!Array.isArray(groups)) return console.log(`  ${label.padEnd(16)} absent`);
  const flat = flatten(groups);
  const prices = flat.map((o) => Number(o?.Price ?? 0));
  const paid = prices.filter((p) => p > 0);
  console.log(
    `  ${label.padEnd(16)} ${String(flat.length).padStart(4)} options · ` +
      `${prices.filter((p) => p === 0).length} free · ${paid.length} paid` +
      (paid.length ? ` (₹${Math.min(...paid)}–₹${Math.max(...paid)})` : ""),
  );
  const sample = flat.find((o) => Number(o?.Price ?? 0) > 0) ?? flat[0];
  if (sample) console.log(`     e.g. ${JSON.stringify(sample).slice(0, 190)}`);
};

for (const offer of picks) {
  const seg = offer.segments[0];
  console.log(
    `\n── ${offer.airlineName} ${seg.airlineCode}${seg.flightNumber} · ` +
      `${offer.isLCC ? "LCC" : "GDS"} · ₹${offer.fareINR} ──`,
  );
  // The certification logs show SSR is only ever called AFTER FareRule +
  // FareQuote. Calling it straight off Search answers "your session (TraceId)
  // is expired" seconds after the search — the itinerary was never opened.
  await post(`${SEARCH_SVC}/FareRule`, { TraceId: search.traceId, ResultIndex: offer.id });
  const fq = await post(`${SEARCH_SVC}/FareQuote`, { TraceId: search.traceId, ResultIndex: offer.id });
  const fqErr = ((fq.json?.Response as Record<string, unknown>)?.Error ?? {}) as Record<string, unknown>;
  if (fqErr.ErrorCode) console.log(`  FareQuote → ${fqErr.ErrorCode}: ${fqErr.ErrorMessage}`);

  const ssr = await post(`${SEARCH_SVC}/SSR`, {
    TraceId: search.traceId,
    ResultIndex: offer.id,
  });
  const R = (ssr.json?.Response ?? {}) as Record<string, unknown>;
  const ssrErr = (R.Error ?? {}) as Record<string, unknown>;
  console.log(
    "  keys:", Object.keys(R).join(", ") || "(none)",
    "| Error:", `${ssrErr.ErrorCode ?? "-"}: ${ssrErr.ErrorMessage ?? "-"}`,
  );
  summarise("Baggage", R.Baggage);
  summarise("MealDynamic", R.MealDynamic ?? R.Meal);
  summarise("SeatDynamic", R.SeatDynamic ?? R.Seat);
  summarise("SpecialServices", R.SpecialServices);
}

// ── 3. which methods exist on which service? ────────────────────────────────
//
// TBO answers an unknown method with an HTTP 404 IIS page; a method that EXISTS
// answers HTTP 200 with its own error object (bad token, missing booking id).
// That difference is the whole test — it tells us what the API surface is
// without needing a real booking to poke at.
console.log("\nMethod surface — 404 = no such method, 200 = exists (and complained):");
const METHODS = [
  // known-good controls, so we can trust the signal
  "Search", "FareQuote", "SSR", "Book", "Ticket", "GetBookingDetails",
  // cancellation / amendment family
  "SendChangeRequest", "GetChangeRequestStatus", "ReleasePNRRequest",
  // the add-on family we are actually asking about
  "UpdateSSR", "AddSSR", "SSRUpdate", "BookSSR", "SeatMap", "GetSeatMap",
  "UpdateBooking", "AddOn", "AncillaryServices",
];
for (const [name, svc] of [["Air(search)", SEARCH_SVC], ["AirBook(book)", BOOK_SVC]] as const) {
  console.log(`\n  ${name}  ${svc}`);
  for (const method of METHODS) {
    const r = await post(`${svc}/${method}`, {});
    if (r.http === 404) {
      console.log(`    ${method.padEnd(24)} 404  — no such method`);
      continue;
    }
    const resp = (r.json?.Response ?? r.json ?? {}) as Record<string, unknown>;
    const err = (resp.Error ?? {}) as Record<string, unknown>;
    console.log(
      `    ${method.padEnd(24)} 200  — ${err.ErrorCode ?? "?"}: ${String(err.ErrorMessage ?? JSON.stringify(r.json).slice(0, 80))}`,
    );
  }
}

// ── 4. the post-ticket path, on a BookingId rather than a TraceId ────────────
//
// Air Amendment ("buy baggage, meal or seat after Ticket is created") is SSR
// called with a BookingId, then TicketReIssue. `Invalid BookingId` here is the
// SUCCESS signal — the method exists and validated the field we sent.
console.log("\nPost-ticket amendment surface (BookingId form):");
for (const [name, svc] of [["Air ", SEARCH_SVC], ["Book", BOOK_SVC]] as const) {
  for (const m of ["SSR", "TicketReIssue", "UpdateSSR", "GetCancellationCharges"]) {
    const r = await post(`${svc}/${m}`, { BookingId: 1 });
    const e = ((r.json?.Response as Record<string, unknown>)?.Error ??
      r.json?.Error ??
      {}) as Record<string, unknown>;
    console.log(
      `  ${name} ${m.padEnd(24)} ${r.http === 404 ? "404 — no such method" : `${e.ErrorCode ?? "?"}: ${e.ErrorMessage ?? "(none)"}`}`,
    );
  }
}
