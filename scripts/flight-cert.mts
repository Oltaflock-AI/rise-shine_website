/**
 * TBO Flight API certification runner.
 *
 * Executes the 5 mandatory certification cases against the TBO TEST environment
 * using the SAME production code path (src/lib/tbo.ts + tbo-book.ts), and dumps
 * every raw JSON request/response CASEWISE — exactly the format TBO's API team
 * asks for ("JSON Request/Response for these cases along with the pnr numbers…
 * Casewise rather than all test cases in a single notepad file").
 *
 *   Case 1  GDS Domestic Oneway   — 1 Adult                         (DEL→BOM)
 *   Case 2  LCC Domestic Oneway   — 1 Adult + 1 Child + 1 Infant    (DEL→BOM, with SSR)
 *   Case 3  LCC Domestic Return   — 2 Adults + 2 Children + 1 Infant (DEL⇄BOM)
 *   Case 4  LCC International Oneway — 1 Adult + 1 Child + 1 Infant (DEL→DXB, with SSR)
 *   Case 5  GDS International Return — 2 Adults + 2 Children + 1 Infant (DEL⇄DXB)
 *
 * Test-server sectors per FlightFAQ: DEL-BOM / DEL-BLR / BLR-BOM (dom),
 * DEL-DXB / DEL-BKK (intl).
 *
 * Usage:  npx tsx scripts/flight-cert.ts <1|2|3|4|5|6|7|all>
 * Logs :  reference/flight-certification/case-N.json   (gitignored)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./load-env.mjs";

// ── env: load .env.local the way Next would ──────────────────────────────────
const ROOT = join(import.meta.dirname, "..");
loadEnvLocal(ROOT);

// ── raw traffic recorder: wrap fetch BEFORE the libs make any call ───────────
type Call = { step: string; url: string; request: unknown; response: unknown; at: string; ms: number };
let calls: Call[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const started = Date.now();
  let res: Response;
  try {
    res = await realFetch(input, init);
  } catch (e) {
    console.error(`   [fetch ✗] ${url}:`, e instanceof Error ? `${e.message} ${(e.cause as Error | undefined)?.message ?? ""}` : e);
    throw e;
  }
  let request: unknown = null;
  try {
    request = init?.body ? JSON.parse(init.body as string) : null;
  } catch {
    request = String(init?.body ?? "");
  }
  // Never write the account password into a log that leaves the machine.
  if (/Authenticate/i.test(url) && request && typeof request === "object") {
    request = { ...(request as Record<string, unknown>), Password: "********" };
  }
  let response: unknown;
  try {
    response = await res.clone().json();
  } catch {
    response = await res.clone().text();
  }
  calls.push({
    step: url.split("/").pop() || url,
    url,
    request,
    response,
    at: new Date(started).toISOString(),
    ms: Date.now() - started,
  });
  return res;
}) as typeof fetch;

// Import AFTER the fetch wrap so every TBO call is captured (type-only imports
// are erased at build time and load nothing).
const { searchFlights, clearFlightSearchCache, getAuthToken } = await import("../src/lib/tbo");
const { bookFlight, quoteFare } = await import("../src/lib/tbo-book");
type BookingRequest = import("../src/lib/tbo-book").BookingRequest;
type BookingPax = import("../src/lib/tbo-book").BookingPax;
type FlightOffer = import("../src/lib/tbo").FlightOffer;
type FlightSearch = import("../src/lib/tbo").FlightSearch;

// ── shared pax fixtures ───────────────────────────────────────────────────────
// Letters-only per-run suffix so re-runs never trip TBO's 24h duplicate rule.
const SUFFIX = Date.now()
  .toString()
  .slice(-5)
  .replace(/\d/g, (d) => "AEIOUBCDFG"[Number(d)]);

const CONTACT = {
  ContactNo: "9898012345",
  CellCountryCode: "+91",
  Email: "ops@riseandshinetravels.com",
  AddressLine1: "5 Shivranjani Cross Roads, Satellite, Ahmedabad",
  City: "Ahmedabad",
  CountryCode: "IN",
  CountryName: "India",
  Nationality: "IN",
};
const ADULT_PAN = "BNZAA2318J"; // valid format; test environment
const GUARDIAN = { Title: "Mr", FirstName: "Rajesh", LastName: `Sharma${SUFFIX}`, PAN: ADULT_PAN };

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

type PaxKind = "adult" | "child" | "infant";
type PaxNeeds = { pan: boolean; passport: boolean; passportFull: boolean };
function mkPax(kind: PaxKind, n: number, lead: boolean, intl: boolean, needs: PaxNeeds): BookingPax {
  const male = n % 2 === 1;
  const base: BookingPax = {
    Title: kind === "adult" ? (male ? "Mr" : "Mrs") : kind === "child" ? (male ? "Mr" : "Ms") : "Mstr",
    FirstName:
      kind === "adult" ? (male ? "Rajesh" : "Priya") : kind === "child" ? (male ? "Arjun" : "Diya") : "Vivaan",
    LastName: `Sharma${SUFFIX}`,
    PaxType: kind === "adult" ? 1 : kind === "child" ? 2 : 3,
    DateOfBirth:
      kind === "adult"
        ? `199${n}-04-1${n}T00:00:00`
        : kind === "child"
          ? `2019-0${n}-15T00:00:00`
          : "2025-09-15T00:00:00",
    Gender: male ? 1 : 2,
    IsLeadPax: lead,
    ...CONTACT,
  };
  // PAN only when the FareQuote demands it — TBO fails a booking that carries
  // PAN details it did not ask for unless they are verifiably correct.
  // Adults carry their own PAN; child/infant carry the guardian's (checklist §PAN).
  if (needs.pan) {
    if (kind === "adult") base.PAN = ADULT_PAN;
    else base.GuardianDetails = { ...GUARDIAN };
  }
  // Same principle for passports: only when required (per flags / intl carrier rules).
  // Indian passport format (1 letter + 7 digits) — AI international bookings demand
  // valid passport details even on the test environment (checklist §Passport).
  if (intl && needs.passport) {
    const serial = { adult: 2345670, child: 4567890, infant: 6789010 }[kind] + n;
    base.PassportNo = `Z${serial}`;
    base.PassportExpiry = "2032-01-01T00:00:00";
    if (needs.passportFull) {
      base.PassportIssueDate = kind === "infant" ? "2025-10-01T00:00:00" : "2022-01-01T00:00:00";
      base.PassportIssueCountryCode = "IN";
    }
  }
  // Distinct first/last (SpiceJet) is satisfied by the fixtures above.
  return base;
}

function paxSet(adults: number, children: number, infants: number, intl: boolean, needs: PaxNeeds): BookingPax[] {
  const out: BookingPax[] = [];
  for (let i = 1; i <= adults; i++) out.push(mkPax("adult", i, i === 1, intl, needs));
  for (let i = 1; i <= children; i++) out.push(mkPax("child", i, false, intl, needs));
  for (let i = 1; i <= infants; i++) out.push(mkPax("infant", i, false, intl, needs));
  return out;
}

// ── case definitions ──────────────────────────────────────────────────────────
type CertCase = {
  n: number;
  title: string;
  from: string;
  to: string;
  departDays: number;
  returnDays?: number;
  wantLCC: boolean;
  intl: boolean;
  adults: number;
  children: number;
  infants: number;
  /** Try this airline's itineraries first (only some test-env suppliers can ticket). */
  airlinePref?: string;
  /** TBO Special Return (JourneyType 5) — OB+IB must be the SAME airline. */
  specialReturn?: boolean;
  /** GDS static SSR: include Meal/Seat preference codes in the Book request. */
  gdsSsr?: boolean;
  /** Supplier sources for the search (Special Return wants exactly one). */
  sources?: string[];
};

const CASES: CertCase[] = [
  { n: 1, title: "GDS Domestic Oneway - 1 Adult", from: "DEL", to: "BOM", departDays: 21, wantLCC: false, intl: false, adults: 1, children: 0, infants: 0 },
  { n: 2, title: "LCC Domestic Oneway - 1 Adult + 1 Child + 1 Infant (With SSR)", from: "DEL", to: "BOM", departDays: 22, wantLCC: true, intl: false, adults: 1, children: 1, infants: 1 },
  { n: 3, title: "LCC Domestic Return - 2 Adults + 2 Children + 1 Infant", from: "DEL", to: "BOM", departDays: 23, returnDays: 27, wantLCC: true, intl: false, adults: 2, children: 2, infants: 1 },
  { n: 4, title: "LCC International Oneway - 1 Adult + 1 Child + 1 Infant (With SSR)", from: "DEL", to: "DXB", departDays: 24, wantLCC: true, intl: true, adults: 1, children: 1, infants: 1 },
  { n: 5, title: "GDS International Return - 2 Adults + 2 Children + 1 Infant", from: "DEL", to: "BKK", departDays: 40, returnDays: 46, wantLCC: false, intl: true, adults: 2, children: 2, infants: 1, airlinePref: "AI" },
  { n: 6, title: "LCC Domestic Special Return - 2 Adults + 1 Child", from: "BLR", to: "BOM", departDays: 28, returnDays: 32, wantLCC: true, intl: false, adults: 2, children: 1, infants: 0, specialReturn: true, sources: ["SG"] },
  { n: 7, title: "GDS Domestic Special Return SSR - 2 Adults + 2 Children + 1 Infant", from: "DEL", to: "BOM", departDays: 30, returnDays: 34, wantLCC: false, intl: false, adults: 2, children: 2, infants: 1, specialReturn: true, gdsSsr: true },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function pickOffers(
  offers: FlightOffer[] | undefined,
  wantLCC: boolean,
  label: string,
  airlinePref?: string,
): FlightOffer[] {
  // Distinct airlines first — TBO's test suppliers are flaky per flight, so a
  // failed Book is retried on the next candidate (cheapest-first within airline).
  // With airlinePref, that airline's itineraries all go first (only some suppliers
  // are live on the test server at any given time).
  const match = (offers ?? []).filter((o) => o.isLCC === wantLCC);
  if (!match.length) throw new Error(`${label}: no ${wantLCC ? "LCC" : "GDS"} result on the test server.`);
  if (airlinePref) {
    const pref = match.filter((o) => o.airlineCode === airlinePref);
    if (pref.length) return [...pref, ...match.filter((o) => o.airlineCode !== airlinePref)].slice(0, 8);
  }
  const seen = new Set<string>();
  const distinct = match.filter((o) => (seen.has(o.airlineCode) ? false : (seen.add(o.airlineCode), true)));
  return [...distinct, ...match.filter((o) => !distinct.includes(o))].slice(0, 6);
}

function toRequest(
  c: CertCase,
  search: FlightSearch,
  offer: FlightOffer,
  leg: "out" | "in",
  needs: PaxNeeds,
): BookingRequest {
  return {
    traceId: search.traceId!,
    searchedAt: search.searchedAt!,
    resultIndex: offer.id,
    isLCC: offer.isLCC,
    airlineCode: offer.airlineCode,
    flightNumber: offer.segments[0]?.flightNumber ?? "",
    origin: leg === "out" ? c.from : c.to,
    destination: leg === "out" ? c.to : c.from,
    departDate: leg === "out" ? isoDate(c.departDays) : isoDate(c.returnDays!),
    isInternational: c.intl,
    passengers: paxSet(c.adults, c.children, c.infants, c.intl, needs),
  };
}

/**
 * Quote the fare (site's /api/quote step), derive what the pax must carry, then book.
 *
 * A TraceId "expires after booking" — so when a candidate Books (held) but fails at
 * Ticket, every later call on that TraceId dies. We re-SEARCH for a fresh TraceId and
 * move to the next untried flight instead.
 */
async function bookLeg(
  c: CertCase,
  initial: FlightSearch,
  research: () => Promise<FlightSearch>,
  leg: "out" | "in",
  lockAirline?: string,
) {
  let search = initial;
  const tried = new Set<string>();
  const flightKey = (o: FlightOffer) => (c.specialReturn ? o.id : o.segments.map((s) => s.flightNumber).join(">"));
  let lastErr = "no candidates";

  // Special Return with split OB/IB lists: FareQuote/Ticket take ONE combined
  // "OBx,IBy" ResultIndex — same airline AND same fare family (FareClassification)
  // both legs, booked in a single call. Built from the RAW search response (the
  // app-level dedupe collapses fare families, which breaks supplier pairing).
  const candidatePool = (): FlightOffer[] => {
    if (c.specialReturn && leg === "out" && search.inbound?.length) {
      return specialReturnPairs(c.wantLCC);
    }
    let pool = leg === "out" ? search.outbound : search.inbound;
    // Special Return pairs OB+IB fares of ONE airline — the return leg must match.
    if (lockAirline) pool = pool?.filter((o) => o.airlineCode === lockAirline);
    return pickOffers(pool, c.wantLCC, leg, c.airlinePref);
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const offer = candidatePool().find((o) => !tried.has(flightKey(o)));
    if (!offer) break;
    tried.add(flightKey(offer));

    const q = await quoteFare({ traceId: search.traceId!, searchedAt: search.searchedAt!, resultIndex: offer.id });
    if (!q.ok) {
      lastErr = `FareQuote failed: ${q.error}`;
      console.log(`   ↻ ${offer.airlineName} ${offer.segments[0]?.flightNumber}: ${lastErr}`);
      continue;
    }
    const needs: PaxNeeds = {
      pan: Boolean(q.flags?.IsPanRequiredAtBook || q.flags?.IsPanRequiredAtTicket),
      passport: Boolean(
        c.intl || q.flags?.IsPassportRequiredAtBook || q.flags?.IsPassportRequiredAtTicket,
      ),
      passportFull: Boolean(q.flags?.IsPassportFullDetailRequiredAtBook),
    };
    console.log(
      `   ${leg === "out" ? "outbound" : "inbound"} try: ${offer.airlineName} ${offer.segments[0]?.flightNumber} — ₹${offer.fareINR}/adult ${offer.isLCC ? "LCC" : "GDS"} (PAN:${needs.pan} PPT:${needs.passport})`,
    );
    const req = toRequest(c, search, offer, leg, needs);
    // GDS "SSR" case: static Meal/Seat preference codes go on the lead passenger.
    if (c.gdsSsr && !offer.isLCC) {
      Object.assign(req.passengers[0] as unknown as Record<string, unknown>, await gdsSsrExtras(search.traceId!, offer.id));
    }
    const r = await bookFlight(req);
    if (r.ok) return { r, airline: offer.airlineCode };
    lastErr = r.error ?? "unknown booking error";
    console.log(`   ↻ ${lastErr}`);
    if (r.pnr) {
      // Booked-but-not-ticketed: the hold consumed this TraceId — get a fresh one.
      console.log(`   ↻ held PNR ${r.pnr} left at TBO; re-searching for a fresh TraceId…`);
      search = await research();
      if (!search.ok || !search.traceId) throw new Error(`Re-search failed: ${search.error ?? "no results"}`);
    }
  }
  throw new Error(`${leg === "out" ? "Outbound" : "Return"} booking failed on all candidates: ${lastErr}`);
}

type RawSpecialResult = {
  ResultIndex: string;
  IsLCC?: boolean;
  AirlineCode?: string;
  FareClassification?: { Type?: string };
  Fare?: { PublishedFare?: number };
  Segments?: { Airline?: { AirlineCode?: string; FlightNumber?: string } }[][];
};

/** Pair OB×IB from the raw Special Return search: same airline + same fare family. */
function specialReturnPairs(wantLCC: boolean): FlightOffer[] {
  const sc = [...calls].reverse().find((x) => x.step === "Search");
  const R = (sc?.response as { Response?: { Results?: RawSpecialResult[][] } })?.Response;
  const obs = R?.Results?.[0] ?? [];
  const ibs = R?.Results?.[1] ?? [];
  const family = (x: RawSpecialResult) => (x.FareClassification?.Type ?? "").trim();
  const seg = (x: RawSpecialResult) => {
    const a = x.Segments?.[0]?.[0]?.Airline;
    return {
      airlineCode: a?.AirlineCode ?? "",
      airlineName: a?.AirlineCode ?? "",
      flightNumber: `${a?.AirlineCode ?? ""} ${a?.FlightNumber ?? ""}`.trim(),
      from: "", fromCity: "", fromTerminal: "", to: "", toCity: "", toTerminal: "",
      depTime: "", arrTime: "", durationMin: 0, baggage: "", cabinBaggage: "",
      cabinClass: "", fareClass: "", operatedBy: "",
      fromAirportName: "", toAirportName: "", aircraftCode: "",
    };
  };
  const pairs: FlightOffer[] = [];
  for (const ob of obs) {
    for (const ib of ibs) {
      if (Boolean(ob.IsLCC) !== wantLCC || Boolean(ib.IsLCC) !== wantLCC) continue;
      if (ob.AirlineCode !== ib.AirlineCode) continue;
      if (family(ob) !== family(ib)) continue;
      pairs.push({
        id: `${ob.ResultIndex},${ib.ResultIndex}`,
        airlineCode: ob.AirlineCode ?? "",
        airlineName: `${ob.AirlineCode} (${family(ob) || "?"})`,
        isLCC: Boolean(ob.IsLCC),
        isRefundable: true,
        stops: 0,
        durationMin: 0,
        fareINR: Math.round((ob.Fare?.PublishedFare ?? 0) + (ib.Fare?.PublishedFare ?? 0)),
        baseINR: 0,
        taxINR: 0,
        segments: [seg(ob)],
        fareInclusions: [],
        miniRules: [],
        freeMeal: false,
      });
    }
  }
  return pairs.sort((a, b) => a.fareINR - b.fareINR).slice(0, 8);
}

/** Static (GDS) SSR: first Meal / Seat preference code from the SSR response. */
const SSR_URL = "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/SSR";
async function gdsSsrExtras(traceId: string, resultIndex: string): Promise<Record<string, unknown>> {
  const token = await getAuthToken();
  const res = await fetch(SSR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      EndUserIp: process.env.TBO_END_USER_IP || "115.112.175.13",
      TokenId: token,
      TraceId: traceId,
      ResultIndex: resultIndex,
    }),
    cache: "no-store",
  });
  type SsrOpt = { Code?: string; Price?: number; Weight?: number };
  const j = (await res.json()) as {
    Response?: {
      Meal?: { Code?: string; Description?: string }[];
      SeatPreference?: { Code?: string; Description?: string }[];
      Baggage?: SsrOpt[][];
    };
  };
  const extras: Record<string, unknown> = {};
  const meal = j.Response?.Meal?.[0];
  const seat = j.Response?.SeatPreference?.[0];
  if (meal?.Code) extras.Meal = { Code: meal.Code, Description: meal.Description ?? "" };
  if (seat?.Code) extras.Seat = { Code: seat.Code, Description: seat.Description ?? "" };
  // The cert case must SHOW an SSR selection. When nothing is free (test-env GDS),
  // take the cheapest real (Weight > 0) baggage option on every leg.
  const bags = (j.Response?.Baggage ?? [])
    .map((grp) =>
      (Array.isArray(grp) ? grp : [])
        .filter((b) => (b.Weight ?? 0) > 0 && b.Code)
        .sort((a, b) => (a.Price ?? 0) - (b.Price ?? 0))[0],
    )
    .filter(Boolean);
  if (bags.length) extras.Baggage = bags;
  return extras;
}

const OUT_DIR = join(ROOT, "reference", "flight-certification");

async function runCase(c: CertCase): Promise<{ ok: boolean; pnrs: string[]; file: string; error?: string }> {
  calls = [];
  const pnrs: string[] = [];
  const results: unknown[] = [];
  let error: string | undefined;

  console.log(`\n━━ Case ${c.n}: ${c.title}`);
  try {
    const search = await searchFlights({
      from: c.from,
      to: c.to,
      departISO: isoDate(c.departDays),
      returnISO: c.returnDays !== undefined ? isoDate(c.returnDays) : undefined,
      adults: c.adults,
      children: c.children,
      infants: c.infants,
      specialReturn: c.specialReturn,
      sources: c.sources,
    });
    if (!search.ok || !search.traceId) throw new Error(`Search failed: ${search.error ?? "no results"}`);
    console.log(`   search ok — ${search.outbound.length} outbound / ${search.inbound?.length ?? 0} inbound results`);

    const doSearch = () => {
      clearFlightSearchCache(); // a consumed TraceId must not be served from cache
      return searchFlights({
        from: c.from,
        to: c.to,
        departISO: isoDate(c.departDays),
        returnISO: c.returnDays !== undefined ? isoDate(c.returnDays) : undefined,
        adults: c.adults,
        children: c.children,
        infants: c.infants,
        specialReturn: c.specialReturn,
        sources: c.sources,
      });
    };

    const { r: r1, airline: outAirline } = await bookLeg(c, search, doSearch, "out");
    results.push(r1);
    if (r1.pnr) pnrs.push(r1.pnr);
    console.log(`   ✈ PNR ${r1.pnr} status=${r1.status} tickets=${r1.ticketNumbers?.join(",") || "-"}`);

    // Domestic returns come back as separate OB/IB result sets → book the return
    // leg too (same TraceId). International GDS returns are one combined itinerary.
    // Special Return books both legs in ONE combined call — no separate inbound.
    if (c.returnDays !== undefined && search.inbound?.length && !c.specialReturn) {
      const { r: r2 } = await bookLeg(c, search, doSearch, "in", outAirline && undefined);
      results.push(r2);
      if (r2.pnr) pnrs.push(r2.pnr);
      console.log(`   ✈ return PNR ${r2.pnr} status=${r2.status} tickets=${r2.ticketNumbers?.join(",") || "-"}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`   ✗ ${error}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `case-${c.n}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        case: `Case ${c.n}`,
        description: c.title,
        environment: "TBO Test",
        sector: c.returnDays !== undefined ? `${c.from}-${c.to}-${c.from}` : `${c.from}-${c.to}`,
        runAt: new Date().toISOString(),
        pnrs,
        bookingResults: results,
        ...(error ? { error } : {}),
        apiLogs: calls,
      },
      null,
      2,
    ),
  );
  console.log(`   log → ${file} (${calls.length} API calls captured)`);
  return { ok: !error, pnrs, file, error };
}

// ── main ──────────────────────────────────────────────────────────────────────
const arg = process.argv[2] ?? "all";
const toRun = arg === "all" ? CASES : CASES.filter((c) => String(c.n) === arg);
if (!toRun.length) {
  console.error("Usage: npx tsx scripts/flight-cert.ts <1|2|3|4|5|all>");
  process.exit(1);
}

const summary: Record<string, unknown>[] = [];
for (const c of toRun) {
  const r = await runCase(c);
  summary.push({ case: c.n, title: c.title, ok: r.ok, pnrs: r.pnrs, error: r.error, log: r.file });
}
console.log("\n━━ SUMMARY");
for (const s of summary) console.log(JSON.stringify(s));
process.exit(summary.every((s) => s.ok) ? 0 : 1);
