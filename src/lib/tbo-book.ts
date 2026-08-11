/**
 * TBO Flight API — booking flow (SERVER ONLY).
 *
 *   LCC      Search → FareRule → FareQuote → SSR → Ticket → GetBookingDetails
 *   Non-LCC  Search → FareRule → FareQuote → SSR → Book → Ticket → GetBookingDetails
 *
 * Every rule on TBO's checklist is enforced here or in ./tbo-validate:
 * separate Search/Book service URLs, ErrorCode-6 token refresh, 15-minute TraceId
 * expiry, price/time-change re-submission, GST, SSR free baggage/meal/seat,
 * duplicate-booking guard, and the timeout + GetBookingDetails recovery that
 * prevents a timed-out Book from being re-booked (and double-charged).
 *
 * Reference: https://apidoc.tektravels.com/flight/apivalidation.aspx
 */
import { tboFetch } from "./tbo-fetch";
import {
  type FareBreakdown,
  type FareQuoteFlags,
  type Pax,
  TboValidationError,
  assertNotDuplicate,
  duplicateKey,
  farePerPax,
  pickFreeBaggage,
  pickFreeMeal,
  pickFreeSeats,
  rememberBooking,
  validateGst,
  validatePanPassport,
  validatePax,
  validateSpecialFare,
} from "./tbo-validate";

// ── Checklist: "Search and Book Url's are different so use each accordingly" ──
// Staging and live are different hosts entirely — see tbo.ts for the live values.
const trimSlash = (u: string) => u.replace(/\/+$/, "");
const AUTH_URL = trimSlash(
  process.env.TBO_AUTH_URL || "http://Sharedapi.tektravels.com/SharedData.svc/rest",
);
/** Search / FareRule / FareQuote / SSR / GetCalendarFare live on the Air service. */
const SEARCH_SVC = trimSlash(
  process.env.TBO_SEARCH_URL ||
    "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest",
);
/**
 * Book / Ticket / GetBookingDetails — TBO's docs contradict themselves here:
 *
 *   apivalidation.aspx  "Book URL: .../BookingEngineService_AirBook/AirService.svc"
 *   Book.aspx/Ticket.aspx  ".../BookingEngineService_Air/AirService.svc/rest/Book"
 *
 * Live staging agrees with the METHOD pages: every AirBook path returns the plain-text
 * body `Invalid Resource Requested` (TBO's signature for a wrong/absent path), while the
 * Air service serves Book/Ticket correctly — which is how all certification cases ticketed.
 *
 * So we address AirBook first and fall back to Air when it isn't there. That satisfies the
 * checklist as written, keeps staging working, and needs no change if TBO enables AirBook.
 * Override with TBO_BOOK_URL.
 */
const BOOK_SVC = trimSlash(
  process.env.TBO_BOOK_URL ||
    "http://api.tektravels.com/BookingEngineService_AirBook/AirService.svc/rest",
);
/**
 * The Air-service fallback below is a staging-only accommodation. When TBO_BOOK_URL is set
 * explicitly (live gives Book its own host, booking.travelboutiqueonline.com), a failure
 * must surface — silently re-posting Book to the search host is how you lose a ticket.
 */
const BOOK_URL_EXPLICIT = Boolean(process.env.TBO_BOOK_URL?.trim());
/** Set once we learn AirBook isn't serving this account, so we stop re-probing it. */
let bookSvcUnavailable = false;

// ── Checklist: response-time benchmarks → client timeouts ──
// (Search's own 60s ceiling is enforced in tbo.ts.)
const TIMEOUT_BOOK = 300_000; // Book/Ticket may take up to 300s — never cut this short
const TIMEOUT_OTHER = 60_000;

/** TraceId expires 15 minutes after Search (or once booked). */
const TRACE_TTL_MS = 15 * 60 * 1000;
const TOKEN_INVALID = 6; // check the CODE, never the message

function cfg() {
  return {
    clientId: process.env.TBO_CLIENT_ID ?? "",
    username: process.env.TBO_USERNAME ?? "",
    password: process.env.TBO_PASSWORD ?? "",
    ip: process.env.TBO_END_USER_IP || "115.112.175.13",
  };
}

export class TboError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "TboError";
    this.code = code;
  }
}

// ── token ──
let tokenCache: { token: string; exp: number } | null = null;

async function authenticate(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  const c = cfg();
  const r = await post(`${AUTH_URL}/Authenticate`, {
    ClientId: c.clientId,
    UserName: c.username,
    Password: c.password,
    EndUserIp: c.ip,
  }, TIMEOUT_OTHER);
  if (r?.Status !== 1 || !r?.TokenId) throw new TboError(r?.Error?.ErrorMessage || "TBO authentication failed");
  tokenCache = { token: r.TokenId, exp: Date.now() + 20 * 60 * 1000 };
  return r.TokenId;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Thrown when the request exceeded our timeout — the ONLY case where a booking may be in flight. */
export class TboTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TboTimeoutError";
  }
}
/** Thrown when a service answers with something that isn't JSON (e.g. "Invalid Resource Requested"). */
class TboNotJsonError extends Error {
  readonly body: string;
  constructor(body: string) {
    super(`TBO returned a non-JSON response: ${body.slice(0, 80)}`);
    this.name = "TboNotJsonError";
    this.body = body;
  }
}

async function post(url: string, body: Json, timeoutMs: number): Promise<Json> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let text: string;
  try {
    const r = await tboFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: "no-store",
    });
    text = await r.text();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new TboTimeoutError(`TBO did not respond within ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new TboNotJsonError(text);
  }
}

/** TBO's staging suppliers are flaky: ErrorCode 35 / "supplier side" clears on a retry. */
function isTransient(res: Json): boolean {
  const e = errOf(res);
  return e.code === 35 || /supplier side|please try again/i.test(e.message);
}

/**
 * Call TBO, refreshing the token on ErrorCode 6 ("Invalid Token") and retrying once.
 * The checklist is explicit: match on the code, not the message text.
 *
 * Read-only methods (everything but Book/Ticket) are also retried on a transient
 * supplier error or timeout. Book/Ticket are NEVER auto-retried — a retry there could
 * double-book; that path goes through recoverFromTimeout() instead.
 */
async function call(url: string, body: Json, timeoutMs = TIMEOUT_OTHER, retries = 0): Promise<Json> {
  const method = url.split("/").pop() || "TBO";
  for (let attempt = 0; ; attempt++) {
    const token = await authenticate(attempt > 0);
    let res: Json;
    try {
      res = await post(url, { ...body, EndUserIp: cfg().ip, TokenId: token }, timeoutMs);
    } catch (e) {
      if (e instanceof TboTimeoutError) {
        if (attempt < retries) continue;
        throw new TboTimeoutError(`${method} did not respond within ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw e;
    }
    const err = res?.Response?.Error ?? res?.Error;
    if (err?.ErrorCode === TOKEN_INVALID) {
      const fresh = await authenticate(true);
      res = await post(url, { ...body, EndUserIp: cfg().ip, TokenId: fresh }, timeoutMs);
    }
    if (attempt < retries && isTransient(res)) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    return res;
  }
}

/**
 * Book / Ticket / GetBookingDetails: address the AirBook service, falling back to the
 * Air service when AirBook isn't provisioned for this account (staging today).
 */
async function bookCall(method: string, body: Json, timeoutMs = TIMEOUT_OTHER): Promise<Json> {
  if (!bookSvcUnavailable) {
    try {
      return await call(`${BOOK_SVC}/${method}`, body, timeoutMs);
    } catch (e) {
      if (!(e instanceof TboNotJsonError)) throw e; // a timeout here must NOT trigger a retry
      if (BOOK_URL_EXPLICIT) throw e; // configured host is authoritative — never re-route Book
      bookSvcUnavailable = true;
      console.warn(
        `[TBO] AirBook service unavailable (${e.body.trim().slice(0, 40)}) — falling back to the Air service for ${method}.`,
      );
    }
  }
  return call(`${SEARCH_SVC}/${method}`, body, timeoutMs);
}

function errOf(res: Json): { code: number; message: string } {
  const e = res?.Response?.Error ?? res?.Error ?? {};
  return { code: e.ErrorCode ?? 0, message: e.ErrorMessage ?? "" };
}
function assertOk(res: Json, what: string): Json {
  const R = res?.Response;
  const e = errOf(res);
  if (R?.ResponseStatus !== 1 || e.code) {
    throw new TboError(e.message || `${what} failed (status ${R?.ResponseStatus})`, e.code);
  }
  return R;
}

// ── flow types ──
export type BookingPax = Omit<Pax, "Fare">;

export type BookingRequest = {
  traceId: string;
  /** Search timestamp — used to enforce the 15-minute TraceId window. */
  searchedAt: number;
  resultIndex: string;
  isLCC: boolean;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departDate: string;
  isInternational: boolean;
  passengers: BookingPax[];
  gst?: {
    GSTCompanyName: string;
    GSTNumber: string;
    GSTCompanyAddress: string;
    GSTCompanyEmail: string;
    GSTCompanyContactNumber: string;
  };
};

export type BookingResult = {
  ok: boolean;
  pnr?: string;
  bookingId?: number;
  status?: number;
  invoiceNo?: string;
  ticketNumbers?: string[];
  /** Confirmed total fare (INR) from the ticketed itinerary, for the mirror row. */
  fareInr?: number;
  priceChanged?: boolean;
  newFare?: number;
  error?: string;
  rule?: string;
};

function assertTraceAlive(searchedAt: number): void {
  if (Date.now() - searchedAt > TRACE_TTL_MS)
    throw new TboError(
      "Your session (TraceId) is expired. Please search again — TBO expires a TraceId 15 minutes after search.",
    );
}

/**
 * On a Book/Ticket timeout, NEVER re-book — poll GetBookingDetails until TBO
 * stops reporting "booking under process", otherwise we risk a double booking
 * (and a double charge).
 */
async function recoverFromTimeout(traceId: string, bookingId?: number, pnr?: string): Promise<Json | null> {
  if (!bookingId && !pnr) return null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 12_000)); // 10–15s cadence per TBO
    try {
      const res = await bookCall("GetBookingDetails", { TraceId: traceId, BookingId: bookingId, PNR: pnr }, TIMEOUT_OTHER);
      const msg = errOf(res).message;
      if (/booking under process/i.test(msg)) continue;
      if (res?.Response?.FlightItinerary) return res.Response;
    } catch {
      // keep polling — a transient failure here must not trigger a re-book
    }
  }
  return null;
}

export type QuoteResult = {
  ok: boolean;
  isLCC?: boolean;
  /** Total fare for all passengers, re-priced by TBO (may differ from the search fare). */
  publishedFare?: number;
  offeredFare?: number;
  priceChanged?: boolean;
  /** What TBO says this fare requires — drives which fields the checkout form shows. */
  flags?: FareQuoteFlags;
  error?: string;
};

/**
 * FareRule + FareQuote only. The checkout page calls this before collecting passenger
 * details so the form can demand exactly what TBO demands — PAN, passport (and whether
 * full passport detail is needed), GST, a mandatory seat/meal — rather than guessing.
 */
export async function quoteFare(args: {
  traceId: string;
  searchedAt: number;
  resultIndex: string;
}): Promise<QuoteResult> {
  try {
    assertTraceAlive(args.searchedAt);
    await call(`${SEARCH_SVC}/FareRule`, { TraceId: args.traceId, ResultIndex: args.resultIndex }, TIMEOUT_OTHER, 2);
    const res = await call(`${SEARCH_SVC}/FareQuote`, { TraceId: args.traceId, ResultIndex: args.resultIndex }, TIMEOUT_OTHER, 2);
    const FQ = assertOk(res, "FareQuote");
    const q = (Array.isArray(FQ.Results) ? FQ.Results[0] : FQ.Results) as Json;
    if (!q) throw new TboError("This fare is no longer available. Please search again.");
    return {
      ok: true,
      isLCC: Boolean(q.IsLCC),
      publishedFare: q.Fare?.PublishedFare,
      offeredFare: q.Fare?.OfferedFare,
      priceChanged: Boolean(FQ.IsPriceChanged),
      flags: {
        IsPanRequiredAtBook: q.IsPanRequiredAtBook,
        IsPanRequiredAtTicket: q.IsPanRequiredAtTicket,
        IsPassportRequiredAtBook: q.IsPassportRequiredAtBook,
        IsPassportRequiredAtTicket: q.IsPassportRequiredAtTicket,
        IsPassportFullDetailRequiredAtBook: q.IsPassportFullDetailRequiredAtBook,
        IsGSTMandatory: q.IsGSTMandatory,
        IsPriceChanged: Boolean(FQ.IsPriceChanged),
        FlightDetailChangeInfo: q.FlightDetailChangeInfo,
        isseatmandatory: q.IsSeatMandatory ?? q.isseatmandatory,
        ismealmandatory: q.IsMealMandatory ?? q.ismealmandatory,
      },
    };
  } catch (e) {
    if (e instanceof TboError || e instanceof TboTimeoutError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Could not price this fare." };
  }
}

type PreparedBooking = {
  passengers: Pax[];
  /**
   * ResultIndex to Book/Ticket with. FareQuote can REPLACE the searched index —
   * notably Special Return, where quoting "OBx,IBy" returns one merged index that
   * is the only one Ticket accepts.
   */
  resultIndex: string;
  dupKey: string;
  priceChanged: boolean;
  newFare?: number;
  /** Confirmed FareQuote total (all pax) — the amount to charge / display. */
  publishedFare?: number;
};

/**
 * Everything up to (but NOT including) Book/Ticket: TraceId window, FareRule +
 * FareQuote, every checklist validation, free-SSR selection, the per-pax fare split,
 * and the duplicate guard. Throws (TboValidationError / TboError) on the first problem.
 *
 * Shared by bookFlight and validateBooking so the checks a booking must pass are
 * IDENTICAL whether we're pre-validating (before charging the card) or actually
 * ticketing. It commits no booking — `rememberBooking` stays in bookFlight, after Book
 * succeeds — so running it twice (once to pre-validate, once to ticket) is safe.
 */
async function prepareBooking(req: BookingRequest): Promise<PreparedBooking> {
  assertTraceAlive(req.searchedAt);

  // 1. FareRule (informational, part of the mandated flow)
  await call(`${SEARCH_SVC}/FareRule`, { TraceId: req.traceId, ResultIndex: req.resultIndex }, TIMEOUT_OTHER, 2);

  // 2. FareQuote — the source of truth for PAN/passport/GST/price-change flags
  const fqRes = await call(`${SEARCH_SVC}/FareQuote`, { TraceId: req.traceId, ResultIndex: req.resultIndex }, TIMEOUT_OTHER, 2);
  const FQ = assertOk(fqRes, "FareQuote");
  const quoted = (Array.isArray(FQ.Results) ? FQ.Results[0] : FQ.Results) as Json;
  if (!quoted) throw new TboError("FareQuote returned no result — the fare is no longer available.");
  const resultIndex = (quoted.ResultIndex as string | undefined) || req.resultIndex;

  const flags: FareQuoteFlags = {
    IsPanRequiredAtBook: quoted.IsPanRequiredAtBook,
    IsPanRequiredAtTicket: quoted.IsPanRequiredAtTicket,
    IsPassportRequiredAtBook: quoted.IsPassportRequiredAtBook,
    IsPassportRequiredAtTicket: quoted.IsPassportRequiredAtTicket,
    IsPassportFullDetailRequiredAtBook: quoted.IsPassportFullDetailRequiredAtBook,
    IsGSTMandatory: quoted.IsGSTMandatory,
    IsPriceChanged: FQ.IsPriceChanged,
    FlightDetailChangeInfo: quoted.FlightDetailChangeInfo,
    isseatmandatory: quoted.IsSeatMandatory ?? quoted.isseatmandatory,
    ismealmandatory: quoted.IsMealMandatory ?? quoted.ismealmandatory,
  };

  // Price / flight-detail changes: rebuild from the QUOTED fare, not the search fare.
  const priceChanged = Boolean(FQ.IsPriceChanged);
  const newFare = quoted?.Fare?.PublishedFare as number | undefined;

  // 3. Validate everything TBO would reject at the supplier
  validatePax(req.passengers as Pax[], { isLCC: req.isLCC, airlineCode: req.airlineCode });
  validateGst(flags, req.gst);

  // 4. SSR — free baggage/meal must be explicitly selected or they aren't applied
  const ssrRes = await call(`${SEARCH_SVC}/SSR`, { TraceId: req.traceId, ResultIndex: req.resultIndex }, TIMEOUT_OTHER, 2);
  const SSR = ssrRes?.Response ?? {};
  const freeBags = pickFreeBaggage(SSR.Baggage);
  const freeMeals = pickFreeMeal(SSR.MealDynamic ?? SSR.Meal);
  // Special fares (Super 6E / SpiceMax) refuse to ticket without a seat + meal.
  const freeSeats = flags.isseatmandatory ? pickFreeSeats(SSR.SeatDynamic) : [];
  if (flags.isseatmandatory || flags.ismealmandatory) {
    validateSpecialFare(flags, { seats: freeSeats, meals: freeMeals });
  }

  // 5. Build passengers: per-pax fare split + SSR on the lead pax
  const breakdown = quoted.FareBreakdown as FareBreakdown[] | undefined;
  const passengers = req.passengers.map((p, i) => {
    const out: Pax = { ...(p as Pax), Fare: farePerPax(breakdown, p.PaxType) };
    if (i === 0) {
      if (freeBags.length) out.Baggage = freeBags; // both legs on a return sector
      if (freeMeals.length) out.MealDynamic = freeMeals;
      if (freeSeats.length) out.Seat = freeSeats;
      if (req.gst) Object.assign(out, req.gst);
    }
    return out;
  });

  const stage: "Book" | "Ticket" = req.isLCC ? "Ticket" : "Book";
  validatePanPassport(passengers, flags, stage);

  // 6. Duplicate guard (non-LCC, 24h) — read-only here; committed in bookFlight after Book
  const dupKey = duplicateKey({
    origin: req.origin,
    destination: req.destination,
    departDate: req.departDate,
    airlineCode: req.airlineCode,
    flightNumber: req.flightNumber,
    pax: passengers,
  });
  assertNotDuplicate(dupKey, req.isLCC);

  return { passengers, resultIndex, dupKey, priceChanged, newFare, publishedFare: newFare };
}

export type ValidateResult =
  | { ok: true; publishedFare?: number; isLCC: boolean; priceChanged: boolean }
  | { ok: false; error: string; rule?: string };

/**
 * Dry-run the whole pre-ticket flow WITHOUT calling Book/Ticket. The checkout runs
 * this BEFORE taking payment, so a booking TBO would reject (bad PAN/passport/GST,
 * a duplicate, a mandatory-SSR fare) fails before the customer is ever charged —
 * rather than being charged and then refunded. Returns the confirmed FareQuote total.
 */
export async function validateBooking(req: BookingRequest): Promise<ValidateResult> {
  try {
    const prep = await prepareBooking(req);
    return { ok: true, publishedFare: prep.publishedFare, isLCC: req.isLCC, priceChanged: prep.priceChanged };
  } catch (e) {
    if (e instanceof TboValidationError) return { ok: false, error: e.message, rule: e.rule };
    if (e instanceof TboError || e instanceof TboTimeoutError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Could not validate this booking." };
  }
}

export async function bookFlight(req: BookingRequest): Promise<BookingResult> {
  try {
    // Re-run all pre-ticket checks (parity with the pre-charge validation) then ticket.
    const { passengers, resultIndex, dupKey, priceChanged, newFare } = await prepareBooking(req);

    let bookingId: number | undefined;
    let pnr: string | undefined;

    if (req.isLCC) {
      // ── LCC: single Ticket call (no Book) ──
      let res: Json;
      try {
        res = await bookCall(
          "Ticket",
          { TraceId: req.traceId, ResultIndex: resultIndex, Passengers: passengers, IsPriceChangeAccepted: true },
          TIMEOUT_BOOK,
        );
      } catch (e) {
        if (!(e instanceof TboTimeoutError)) throw e;
        const rec = await recoverFromTimeout(req.traceId);
        if (!rec) throw new TboError("Ticket timed out. Check the booking queue before retrying — do not re-book.");
        res = { Response: rec };
      }
      const R = assertOk(res, "Ticket");
      bookingId = R.Response?.BookingId;
      pnr = R.Response?.PNR;
    } else {
      // ── Non-LCC: Book, then Ticket ──
      let bookRes: Json;
      try {
        bookRes = await bookCall(
          "Book",
          { TraceId: req.traceId, ResultIndex: resultIndex, Passengers: passengers },
          TIMEOUT_BOOK,
        );
      } catch (e) {
        if (!(e instanceof TboTimeoutError)) throw e;
        const rec = await recoverFromTimeout(req.traceId);
        if (!rec) throw new TboError("Book timed out. Check the booking queue before retrying — do not re-book.");
        bookRes = { Response: rec };
      }
      const B = assertOk(bookRes, "Book");
      bookingId = B.Response?.BookingId;
      pnr = B.Response?.PNR;
      rememberBooking(dupKey);

      let tktRes: Json;
      try {
        tktRes = await bookCall(
          "Ticket",
          { TraceId: req.traceId, PNR: pnr, BookingId: bookingId, IsPriceChangeAccepted: true },
          TIMEOUT_BOOK,
        );
      } catch (e) {
        if (!(e instanceof TboTimeoutError)) throw e;
        const rec = await recoverFromTimeout(req.traceId, bookingId, pnr);
        if (!rec) throw new TboError("Ticket timed out. Check the booking queue before retrying — do not re-ticket.");
        tktRes = { Response: rec };
      }
      // A Ticket failure AFTER a successful Book leaves a HELD booking at TBO —
      // surface the PNR/BookingId so ops can ticket it from the queue instead of
      // the hold silently vanishing behind a generic error.
      const heldResult = (e: TboError): BookingResult => ({
        ok: false,
        pnr,
        bookingId,
        error: `Ticketing failed after Book — the booking is HELD at TBO (PNR ${pnr}, BookingId ${bookingId}). ${e.message}`,
      });
      let T: Json;
      try {
        T = assertOk(tktRes, "Ticket");
      } catch (e) {
        if (e instanceof TboError) return heldResult(e);
        throw e;
      }

      // Ticket itself reported a price change → call Ticket again, accepting it.
      if (T.Response?.IsPriceChanged) {
        const retry = await bookCall(
          "Ticket",
          { TraceId: req.traceId, PNR: pnr, BookingId: bookingId, IsPriceChangeAccepted: true },
          TIMEOUT_BOOK,
        );
        try {
          T = assertOk(retry, "Ticket (price change accepted)");
        } catch (e) {
          if (e instanceof TboError) return heldResult(e);
          throw e;
        }
      }
    }

    // 7. GetBookingDetails — the only trustworthy confirmation
    const gbdRes = await bookCall("GetBookingDetails", { TraceId: req.traceId, BookingId: bookingId, PNR: pnr }, TIMEOUT_OTHER);
    const G = assertOk(gbdRes, "GetBookingDetails");
    const itin = G.FlightItinerary as Json | undefined;
    const tickets = (itin?.Passenger ?? [])
      .map((p: Json) => p?.Ticket?.TicketNumber)
      .filter(Boolean) as string[];

    return {
      ok: itin?.Status === 5,
      pnr: itin?.PNR ?? pnr,
      bookingId,
      status: itin?.Status,
      invoiceNo: itin?.InvoiceNo,
      ticketNumbers: tickets,
      fareInr:
        itin?.Fare?.PublishedFare != null
          ? Math.round(Number(itin.Fare.PublishedFare))
          : undefined,
      priceChanged,
      newFare,
      error:
        itin?.Status === 5
          ? undefined
          : `Booking is held (status ${itin?.Status}) and not ticketed. Our team will confirm it manually.`,
    };
  } catch (e) {
    if (e instanceof TboValidationError) return { ok: false, error: e.message, rule: e.rule };
    if (e instanceof TboError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Booking failed." };
  }
}
