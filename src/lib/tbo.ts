/**
 * TBO (TekTravels) Flight API client — SERVER ONLY.
 *
 * Talks to the TBO staging Air API (Authenticate → Search) to return real-time
 * flight fares. Never import this from a client component: it reads credentials
 * from env and calls TBO's HTTP endpoints server-side (no CORS, IP-scoped).
 *
 * Creds live in .env (gitignored): TBO_CLIENT_ID / TBO_USERNAME / TBO_PASSWORD /
 * TBO_END_USER_IP. See reference/api-setup/apiSetup.md. Booking is not wired
 * (certification pending) — we surface live search fares with an enquiry CTA.
 */
import { TboValidationError, validateSearch } from "./tbo-validate";
import { tboFetch } from "./tbo-fetch";
import { todayInIndiaISO } from "./stay-dates";
import { displayAirportName, displayPlaceName } from "./place-names";

// Live and staging are wholly different hosts, not just different credentials, so
// both bases are env-driven. Unset = staging. Live (issued 2026-08-11):
//   TBO_AUTH_URL    https://api.travelboutiqueonline.com/SharedAPI/SharedData.svc/rest
//   TBO_SEARCH_URL  https://tboapi.travelboutiqueonline.com/AirAPI_V10/AirService.svc/rest
const trimSlash = (u: string) => u.replace(/\/+$/, "");

const AUTH_URL = `${trimSlash(
  process.env.TBO_AUTH_URL ||
    "http://Sharedapi.tektravels.com/SharedData.svc/rest",
)}/Authenticate`;
// Search lives on the Air service; Book/Ticket use the separate AirBook service
// (see tbo-book.ts) — TBO requires each method to go to its own URL.
const SEARCH_URL = `${trimSlash(
  process.env.TBO_SEARCH_URL ||
    "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest",
)}/Search`;

function cfg() {
  return {
    clientId: process.env.TBO_CLIENT_ID ?? "",
    username: process.env.TBO_USERNAME ?? "",
    password: process.env.TBO_PASSWORD ?? "",
    ip: process.env.TBO_END_USER_IP || "115.112.175.13",
  };
}

export function tboConfigured(): boolean {
  const c = cfg();
  return Boolean(c.clientId && c.username && c.password);
}

// ── normalized shapes returned to the app ──
export type FlightSegment = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  from: string;
  fromCity: string;
  fromTerminal: string;
  to: string;
  toCity: string;
  toTerminal: string;
  depTime: string;
  arrTime: string;
  durationMin: number;
  /** Checked-in allowance as TBO reports it, e.g. "15 KG" / "1 PC" (empty when unknown). */
  baggage: string;
  /** Cabin allowance, e.g. "7 KG" (empty when unknown). */
  cabinBaggage: string;
  /** Cabin of travel, e.g. "Economy" (empty when TBO omits the code). */
  cabinClass: string;
  /** Booking/fare class letter, e.g. "T" (empty when unknown). */
  fareClass: string;
  /** Operating carrier code when the flight is code-shared (empty otherwise). */
  operatedBy: string;
  /** Full airport names, e.g. "Indira Gandhi Airport" (empty when TBO omits). */
  fromAirportName: string;
  toAirportName: string;
  /** IATA aircraft code as TBO sends it, e.g. "7M8". */
  aircraftCode: string;
  /** Seats left on this leg (undefined when TBO omits it). */
  seatsLeft?: number;
  /**
   * A technical stop — the aircraft lands but the flight number does not change
   * and the passenger does not deplane. Distinct from a connection, which is a
   * separate segment, and worth saying: a "non-stop" that refuels somewhere is
   * otherwise indistinguishable from one that does not.
   */
  stopPoint?: string;
};

/**
 * One penalty row from TBO's MiniFareRules: what the airline charges to cancel or
 * change this fare, and in which window before departure. This is the closest thing
 * TBO gives to a plain-language refund policy, so it is surfaced verbatim — never
 * summarised into a single "refundable / non-refundable" word.
 */
export type MiniFareRule = {
  /** "Cancellation" | "Reissue" | "No Show" — TBO's own wording. */
  type: string;
  /** Sector the rule applies to, e.g. "DEL-BOM". */
  journey: string;
  /** Window start, in `unit` before departure ("" when the row has no window). */
  from: string;
  /** Window end, in `unit` before departure. */
  to: string;
  /** "HOURS" | "DAYS" | "" */
  unit: string;
  /** The charge itself, e.g. "INR 3000" or "100%". */
  details: string;
};

export type FlightOffer = {
  id: string;
  airlineCode: string;
  airlineName: string;
  isLCC: boolean;
  isRefundable: boolean;
  stops: number;
  durationMin: number;
  fareINR: number;
  baseINR: number;
  taxINR: number;
  segments: FlightSegment[];
  /** Airline's own inclusion list, e.g. ["Cabin Baggage Included", "Reissue fees apply"]. */
  fareInclusions: string[];
  /** Cancellation / date-change penalties as TBO reports them (may be empty). */
  miniRules: MiniFareRule[];
  /**
   * The airline's OWN name for this fare — "Corporate Value", "Spice Max",
   * "Flexi Plus", "UpFront" — with the colour TBO ships alongside it. 21
   * distinct types on a single DEL-BOM search, and the only thing that explains
   * why two seats on the same aircraft cost different amounts.
   */
  fareType?: { label: string; color?: string };
  /** Fewest seats left across the legs — the real constraint on the booking. */
  seatsLeft?: number;
  /** The airline includes a meal in this fare at no charge. */
  freeMeal: boolean;
  /**
   * TBO's own orderings, 1 = best, dense over the whole result set.
   * `nonStopRank` puts non-stops first and then sorts by price; `smartRank` is
   * TBO's blended "smart choice", which is NOT price-ordered — on a live
   * DEL-BOM search its top pick was ₹760 above the cheapest non-stop of the
   * same duration. Offered as its own sort, never silently folded into ours.
   */
  smartRank?: number;
  nonStopRank?: number;
};

export type FlightSearch = {
  ok: boolean;
  source: "live" | "unavailable";
  from: string;
  to: string;
  departISO: string;
  returnISO?: string;
  adults: number;
  /** Outbound offers, sorted cheapest first. */
  outbound: FlightOffer[];
  /** Return offers (only for round-trip searches). */
  inbound?: FlightOffer[];
  /** Cheapest total per adult (round-trip = out + in). */
  cheapestINR?: number;
  /** TBO transaction id — must be passed to FareQuote/Book/Ticket. Expires 15 min after search. */
  traceId?: string;
  /** When the search ran, so the booking flow can enforce TBO's 15-minute TraceId window. */
  searchedAt?: number;
  error?: string;
};

// ── auth token cache (session-scoped; refresh well within TBO's window) ──
let tokenCache: { token: string; exp: number } | null = null;

async function authenticate(force = false): Promise<string | null> {
  if (!force && tokenCache && tokenCache.exp > Date.now())
    return tokenCache.token;
  if (!tboConfigured()) return null;
  const c = cfg();
  try {
    const r = await tboFetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ClientId: c.clientId,
        UserName: c.username,
        Password: c.password,
        EndUserIp: c.ip,
      }),
      cache: "no-store",
    });
    const j = await r.json();
    if (j?.Status !== 1 || !j?.TokenId) return null;
    tokenCache = { token: j.TokenId, exp: Date.now() + 20 * 60 * 1000 };
    return j.TokenId;
  } catch {
    return null;
  }
}

/**
 * Shared TBO TokenId for OTHER TBO services (e.g. the hotel post-booking
 * family on HotelBE) — same Sharedapi Authenticate, same agency creds, same
 * cache. Returns null when creds are missing/rejected.
 */
export async function getAuthToken(force = false): Promise<string | null> {
  return authenticate(force);
}

type RawSeg = {
  Airline?: {
    AirlineCode?: string;
    AirlineName?: string;
    FlightNumber?: string;
    FareClass?: string;
    OperatingCarrier?: string;
  };
  CabinClass?: number;
  Origin?: {
    Airport?: {
      AirportCode?: string;
      AirportName?: string;
      CityName?: string;
      Terminal?: string;
    };
    DepTime?: string;
  };
  Destination?: {
    Airport?: {
      AirportCode?: string;
      AirportName?: string;
      CityName?: string;
      Terminal?: string;
    };
    ArrTime?: string;
  };
  Duration?: number;
  GroundTime?: number;
  Baggage?: string;
  CabinBaggage?: string;
  /** Remaining inventory on THIS leg — TBO reports 1-135 in practice. */
  NoOfSeatAvailable?: number;
  /** IATA aircraft code, e.g. "7M8" = 737 MAX 8. */
  Craft?: string;
  IsETicketEligible?: boolean;
  /** A technical stop that is NOT a connection — same flight number, no change. */
  StopOver?: boolean;
  StopPoint?: string;
  StopPointArrivalTime?: string;
  StopPointDepartureTime?: string;
};

/** One row of TBO's MiniFareRules — the airline's cancellation / date-change penalty grid. */
type RawMiniRule = {
  Type?: string;
  JourneyPoints?: string;
  From?: string | number | null;
  To?: string | number | null;
  Unit?: string | null;
  Details?: string | null;
  OnlineRefundAllowed?: boolean;
  OnlineReissueAllowed?: boolean;
};
type RawFareBreakdown = {
  PassengerType?: number; // 1 = Adult, 2 = Child, 3 = Infant
  PassengerCount?: number;
  BaseFare?: number;
  Tax?: number;
  /**
   * Per-segment allowance, positionally aligned with Segments[0]. Some suppliers fill
   * this and leave Segments[].Baggage empty, so it is the fallback for the card.
   */
  SegmentDetails?: {
    CabinBaggage?: { FreeText?: string } | null;
    CheckedInBaggage?: { FreeText?: string } | null;
  }[];
};
type RawResult = {
  ResultIndex: string;
  IsLCC?: boolean;
  IsRefundable?: boolean;
  AirlineCode?: string;
  // ServiceFee is the agency's per-passenger fee. It lives ONLY here, never in
  // FareBreakdown, and is already inside PublishedFare — see perAdultFare.
  Fare?: {
    PublishedFare?: number;
    OfferedFare?: number;
    BaseFare?: number;
    Tax?: number;
    ServiceFee?: number;
  };
  FareBreakdown?: RawFareBreakdown[];
  Segments?: RawSeg[][];
  FareInclusions?: string[] | null;
  // TBO nests this one level deep (per journey) on Search, flat on some sources.
  MiniFareRules?: RawMiniRule[][] | RawMiniRule[] | null;
  /** The airline's own fare-family name and TBO's colour for it. */
  FareClassification?: { Type?: string; Color?: string };
  IsFreeMealAvailable?: boolean;
  /** TBO's own result orderings, 1 = best. See FlightOffer for the caveat. */
  SmartChoiceRanking?: number;
  NonStopFirstRanking?: number;
};

function mapSegment(s: RawSeg): FlightSegment {
  const a = s.Airline ?? {};
  return {
    airlineCode: a.AirlineCode ?? "",
    airlineName: a.AirlineName ?? a.AirlineCode ?? "",
    flightNumber: `${a.AirlineCode ?? ""} ${a.FlightNumber ?? ""}`.trim(),
    from: s.Origin?.Airport?.AirportCode ?? "",
    fromCity: displayPlaceName(s.Origin?.Airport?.CityName),
    fromTerminal: s.Origin?.Airport?.Terminal ?? "",
    to: s.Destination?.Airport?.AirportCode ?? "",
    toCity: displayPlaceName(s.Destination?.Airport?.CityName),
    toTerminal: s.Destination?.Airport?.Terminal ?? "",
    depTime: s.Origin?.DepTime ?? "",
    arrTime: s.Destination?.ArrTime ?? "",
    durationMin: s.Duration ?? 0,
    baggage: s.Baggage ?? "",
    cabinBaggage: s.CabinBaggage ?? "",
    cabinClass: CABIN_NAME[s.CabinClass ?? 0] ?? "",
    fareClass: a.FareClass ?? "",
    operatedBy:
      a.OperatingCarrier && a.OperatingCarrier !== a.AirlineCode
        ? a.OperatingCarrier
        : "",
    fromAirportName: displayAirportName(s.Origin?.Airport?.AirportName),
    toAirportName: displayAirportName(s.Destination?.Airport?.AirportName),
    aircraftCode: (s.Craft ?? "").trim(),
    ...(typeof s.NoOfSeatAvailable === "number" && s.NoOfSeatAvailable > 0
      ? { seatsLeft: s.NoOfSeatAvailable }
      : {}),
    ...(s.StopOver && s.StopPoint ? { stopPoint: s.StopPoint.trim() } : {}),
  };
}

/** TBO FlightCabinClass code → display name (1 = All is not a cabin, so it is blank). */
const CABIN_NAME: Record<number, string> = {
  2: "Economy",
  3: "Premium Economy",
  4: "Business",
  5: "Premium First",
  6: "First",
};

/** Flatten TBO's per-journey MiniFareRules into one displayable list. */
function mapMiniRules(raw: RawResult["MiniFareRules"]): MiniFareRule[] {
  if (!raw) return [];
  const flat = (Array.isArray(raw) ? raw : []).flatMap((r) =>
    Array.isArray(r) ? r : [r as RawMiniRule],
  );
  const seen = new Set<string>();
  const out: MiniFareRule[] = [];
  for (const r of flat) {
    const details = String(r?.Details ?? "").trim();
    if (!details) continue; // a row with no charge tells the customer nothing
    const rule: MiniFareRule = {
      type: String(r.Type ?? "").trim(),
      journey: String(r.JourneyPoints ?? "").trim(),
      from: r.From == null ? "" : String(r.From).trim(),
      to: r.To == null ? "" : String(r.To).trim(),
      unit: String(r.Unit ?? "").trim(),
      details,
    };
    const key = `${rule.type}|${rule.journey}|${rule.from}|${rule.to}|${rule.unit}|${rule.details}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

/** Total journey time incl. layovers: first departure → last arrival. */
function totalDuration(legs: RawSeg[]): number {
  const dep = legs[0]?.Origin?.DepTime;
  const arr = legs[legs.length - 1]?.Destination?.ArrTime;
  if (dep && arr) {
    const mins = (new Date(arr).getTime() - new Date(dep).getTime()) / 60000;
    if (mins > 0 && mins < 48 * 60) return Math.round(mins);
  }
  return legs.reduce((a, s) => a + (s.Duration ?? 0), 0);
}

/**
 * Fare PER ADULT, ALL-INCLUSIVE — what the customer is actually charged, divided by
 * heads. This is the only fare that may reach a search card.
 *
 * `Fare.PublishedFare` is the booking TOTAL across every passenger, so a 2-adult
 * search returns double the single-seat price; dividing by the adult count gives one
 * seat. Search is adults-only — `/api/flights` accepts no child or infant count — so
 * that division is exact.
 *
 * Do NOT price this from `FareBreakdown`. It carries base and tax per passenger type
 * and has no service-fee field at all: `Fare.ServiceFee` (the agency's per-passenger
 * fee, ₹1,000 on the live account) exists only on the top-level `Fare`, folded into
 * PublishedFare. Pricing the card off the breakdown understated every listing by the
 * whole fee, so a customer saw ₹5,601 in results and was asked for ₹6,601 at
 * checkout — ₹3,000 adrift for a family of three. `tests/flight-displayed-fare.test.ts`
 * pins this.
 *
 * `baseINR` / `taxINR` remain the genuine airline split, for anywhere that wants to
 * itemise. `fareINR` is the displayable number.
 */
export function perAdultFare(
  r: RawResult,
  adults: number,
): { fareINR: number; baseINR: number; taxINR: number } {
  const heads = Math.max(1, adults);
  const fb = r.FareBreakdown?.find(
    (b) => (b.PassengerType ?? 0) === 1 && (b.PassengerCount ?? 0) > 0,
  );
  const n = (fb?.PassengerCount as number) || heads;
  const base = fb ? (fb.BaseFare ?? 0) / n : (r.Fare?.BaseFare ?? 0) / heads;
  const tax = fb ? (fb.Tax ?? 0) / n : (r.Fare?.Tax ?? 0) / heads;

  // PublishedFare is the customer-facing total and already contains the service fee.
  // Only when TBO omits it do we rebuild the same number from its parts; OfferedFare
  // is the last resort and is TBO's charge to the agency, never a price to display.
  const published = r.Fare?.PublishedFare ?? 0;
  let allIn: number;
  if (published > 0) {
    allIn = published / heads;
  } else {
    const rebuilt = base + tax + (r.Fare?.ServiceFee ?? 0) / heads;
    allIn = rebuilt > 0 ? rebuilt : (r.Fare?.OfferedFare ?? 0) / heads;
  }

  return {
    fareINR: Math.round(allIn),
    baseINR: Math.round(base),
    taxINR: Math.round(tax),
  };
}

/** Exported for tests — the mapping that decides what a search card can show. */
export function mapResult(r: RawResult, adults: number): FlightOffer {
  const legs = r.Segments?.[0] ?? [];
  const fare = perAdultFare(r, adults);
  // Baggage lives on the segment for most suppliers and only in the adult fare
  // breakdown for others. Read both so a card never shows a blank allowance when
  // TBO did in fact tell us one.
  const paxSegs =
    r.FareBreakdown?.find((b) => (b.PassengerType ?? 0) === 1)
      ?.SegmentDetails ?? [];
  const segments = legs.map((s, i) => {
    const seg = mapSegment(s);
    if (!seg.baggage)
      seg.baggage = paxSegs[i]?.CheckedInBaggage?.FreeText?.trim() ?? "";
    if (!seg.cabinBaggage)
      seg.cabinBaggage = paxSegs[i]?.CabinBaggage?.FreeText?.trim() ?? "";
    return seg;
  });
  // The binding constraint is the tightest leg: nine seats on the first leg is
  // no comfort if the second has one.
  const seatCounts = segments
    .map((x) => x.seatsLeft)
    .filter((n): n is number => n != null);
  const seatsLeft = seatCounts.length ? Math.min(...seatCounts) : undefined;

  return {
    id: r.ResultIndex,
    airlineCode: r.AirlineCode ?? legs[0]?.Airline?.AirlineCode ?? "",
    airlineName: legs[0]?.Airline?.AirlineName ?? r.AirlineCode ?? "",
    isLCC: Boolean(r.IsLCC),
    isRefundable: Boolean(r.IsRefundable),
    stops: Math.max(0, legs.length - 1),
    durationMin: totalDuration(legs),
    fareINR: fare.fareINR,
    baseINR: fare.baseINR,
    taxINR: fare.taxINR,
    segments,
    fareInclusions: (r.FareInclusions ?? [])
      .map((t) => String(t).trim())
      .filter(Boolean),
    miniRules: mapMiniRules(r.MiniFareRules),
    ...(r.FareClassification?.Type
      ? {
          fareType: {
            label: String(r.FareClassification.Type).trim(),
            ...(r.FareClassification.Color
              ? { color: r.FareClassification.Color }
              : {}),
          },
        }
      : {}),
    ...(seatsLeft != null ? { seatsLeft } : {}),
    freeMeal: Boolean(r.IsFreeMealAvailable),
    ...(typeof r.SmartChoiceRanking === "number"
      ? { smartRank: r.SmartChoiceRanking }
      : {}),
    ...(typeof r.NonStopFirstRanking === "number"
      ? { nonStopRank: r.NonStopFirstRanking }
      : {}),
  };
}

/** Collapse duplicate fare-classes of the same physical flight to the cheapest. */
function dedupe(offers: FlightOffer[]): FlightOffer[] {
  const seen = new Set<string>();
  return offers.filter((o) => {
    const key = o.segments
      .map((s) => `${s.flightNumber}@${s.depTime}`)
      .join(">");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Cabin display name → TBO FlightCabinClass code (1=All, 2=Economy, …). */
const CABIN_CODE: Record<string, string> = {
  Economy: "2",
  "Premium Economy": "3",
  Business: "4",
  First: "6",
};

type RawSearchOpts = {
  from: string;
  to: string;
  departISO: string;
  returnISO?: string;
  adults: number;
  children: number;
  infants: number;
  cabinCode: string;
  directOnly: boolean;
  preferredAirlines: string[] | null;
  /** TBO Special Return (JourneyType 5): paired discounted round-trip fares. */
  specialReturn: boolean;
  /** Supplier sources (e.g. ["SG"]). Special Return allows only ONE source. */
  sources: string[] | null;
};

async function rawSearch(token: string, o: RawSearchOpts) {
  const seg = (from: string, to: string, date: string) => ({
    Origin: from,
    Destination: to,
    FlightCabinClass: o.cabinCode,
    PreferredDepartureTime: `${date}T00:00:00`,
    PreferredArrivalTime: `${date}T00:00:00`,
  });
  const segments = [seg(o.from, o.to, o.departISO)];
  if (o.returnISO) segments.push(seg(o.to, o.from, o.returnISO));
  const body = {
    EndUserIp: cfg().ip,
    TokenId: token,
    AdultCount: String(Math.max(1, o.adults)),
    ChildCount: String(o.children),
    InfantCount: String(o.infants),
    DirectFlight: o.directOnly ? "true" : "false",
    OneStopFlight: "false",
    JourneyType: o.specialReturn && o.returnISO ? "5" : o.returnISO ? "2" : "1",
    PreferredAirlines: o.preferredAirlines,
    Segments: segments,
    Sources: o.sources,
  };
  // Reject a bad search here rather than at the supplier (TBO checklist: Search Method Validation).
  validateSearch(body);

  // International searches can exceed 30s; TBO recommends a 60s ceiling.
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60_000);
  try {
    const r = await tboFetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: "no-store",
    });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ── result cache (in-memory, per route+date+pax) ──
const searchCache = new Map<string, { data: FlightSearch; exp: number }>();

/**
 * Drop all cached search results. Needed when a TraceId has been CONSUMED by a
 * booking ("expires after booking") and the same route/date/pax must be
 * re-searched for a fresh one — the cache would otherwise serve the dead trace.
 */
export function clearFlightSearchCache(): void {
  searchCache.clear();
}
/**
 * Under TBO's 15-minute TraceId window — a cached result carries its TraceId, and
 * serving one past expiry would fail at FareQuote/Book with "session expired".
 */
const SEARCH_TTL = 10 * 60 * 1000;

export type SearchArgs = {
  from: string;
  to: string;
  departISO: string;
  returnISO?: string;
  adults?: number;
  children?: number;
  infants?: number;
  /** Cabin display name: "Economy" | "Premium Economy" | "Business" | "First". */
  cabin?: string;
  /** Non-stop flights only. */
  directOnly?: boolean;
  /** Restrict to specific airline codes (e.g. ["6E"]); null/undefined = all. */
  preferredAirlines?: string[];
  /** Search TBO Special Return fares (JourneyType 5) — requires returnISO. */
  specialReturn?: boolean;
  /** Supplier sources (e.g. ["SG"]); Special Return accepts a single source only. */
  sources?: string[];
};

export async function searchFlights(args: SearchArgs): Promise<FlightSearch> {
  const from = args.from.toUpperCase();
  const to = args.to.toUpperCase();
  const adults = Math.max(1, args.adults ?? 1);
  const children = Math.max(0, args.children ?? 0);
  const infants = Math.max(0, args.infants ?? 0);
  const cabinCode = CABIN_CODE[args.cabin ?? ""] ?? "1";
  const directOnly = Boolean(args.directOnly);
  const specialReturn = Boolean(args.specialReturn && args.returnISO);
  const sources = args.sources && args.sources.length ? args.sources : null;
  const preferredAirlines =
    args.preferredAirlines && args.preferredAirlines.length
      ? args.preferredAirlines
      : null;
  const base: Omit<FlightSearch, "ok" | "source" | "outbound"> = {
    from,
    to,
    departISO: args.departISO,
    returnISO: args.returnISO,
    adults,
  };
  const key = `${from}|${to}|${args.departISO}|${args.returnISO ?? ""}|${adults}|${children}|${infants}|${cabinCode}|${directOnly ? "D" : ""}|${specialReturn ? "SR" : ""}|${sources?.join(",") ?? ""}|${preferredAirlines?.join(",") ?? ""}`;
  const hit = searchCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;

  const opts: RawSearchOpts = {
    from,
    to,
    departISO: args.departISO,
    returnISO: args.returnISO,
    adults,
    children,
    infants,
    cabinCode,
    directOnly,
    preferredAirlines,
    specialReturn,
    sources,
  };

  const fail = (error: string): FlightSearch => ({
    ...base,
    ok: false,
    source: "unavailable",
    outbound: [],
    error,
  });

  // A journey that starts and ends at the same airport is not a route TBO can
  // price. Fail here rather than burning a Search call (and its 15-minute
  // TraceId) on a request that can only come back empty.
  if (from === to) return fail("same-airport");

  let token = await authenticate();
  if (!token) return fail("auth");

  type SearchResponse = {
    Response?: {
      ResponseStatus?: number;
      TraceId?: string;
      Results?: RawResult[][];
      Error?: { ErrorCode?: number; ErrorMessage?: string };
    };
  };
  let j: SearchResponse;
  try {
    j = await rawSearch(token, opts);
  } catch (e) {
    // A bad request never reaches TBO — surface why.
    if (e instanceof TboValidationError) return fail(e.message);
    return fail("network");
  }

  // ErrorCode 6 = Invalid Token → regenerate and retry once.
  // TBO's checklist is explicit: match the CODE, not the message text.
  if (j?.Response?.Error?.ErrorCode === 6) {
    token = await authenticate(true);
    if (token) {
      try {
        j = await rawSearch(token, opts);
      } catch (e) {
        if (e instanceof TboValidationError) return fail(e.message);
        return fail("network");
      }
    }
  }

  const R = j?.Response;
  if (!R || R.ResponseStatus !== 1 || !R.Results?.length) {
    return fail(R?.Error?.ErrorMessage || "no results");
  }

  const groups = R.Results;
  const outbound = dedupe(
    groups[0]
      .map((r) => mapResult(r, adults))
      .sort((a, b) => a.fareINR - b.fareINR),
  );
  const inbound = groups[1]
    ? dedupe(
        groups[1]
          .map((r) => mapResult(r, adults))
          .sort((a, b) => a.fareINR - b.fareINR),
      )
    : undefined;
  const cheapestINR =
    args.returnISO && inbound?.length
      ? (outbound[0]?.fareINR ?? 0) + (inbound[0]?.fareINR ?? 0)
      : outbound[0]?.fareINR;

  const data: FlightSearch = {
    ...base,
    ok: true,
    source: "live",
    outbound,
    inbound,
    cheapestINR,
    traceId: R.TraceId,
    searchedAt: Date.now(),
  };
  // Cache results for the list view, but never past TBO's 15-minute TraceId window —
  // a stale TraceId would fail at FareQuote/Book.
  searchCache.set(key, { data, exp: Date.now() + SEARCH_TTL });
  return data;
}

/**
 * Default outbound/return dates when a search arrives without any: **tomorrow**
 * and `nights` later. Someone who reaches a results page with no date wants to
 * see what is flying, not fares a month out that they then have to correct.
 *
 * "Tomorrow" is measured in Asia/Kolkata, never in the server's clock. Vercel
 * runs UTC, which is 5h30m BEHIND India — a naive `new Date()` + 1 day resolves
 * to *today* in IST for every request placed between 18:30 and midnight UTC,
 * and TBO rejects a same-day search once the day's flights have gone.
 */
export function defaultDates(nights = 7): {
  departISO: string;
  returnISO: string;
} {
  const [y, m, day] = todayInIndiaISO().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  d.setUTCDate(d.getUTCDate() + 1);
  const dep = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + Math.max(2, nights));
  return { departISO: dep, returnISO: d.toISOString().slice(0, 10) };
}
