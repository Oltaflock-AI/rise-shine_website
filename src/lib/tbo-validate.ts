/**
 * TBO Flight API — request validations (SERVER ONLY).
 *
 * Implements every rule on TBO's Flight API checklist so a request is rejected
 * here, with a readable message, rather than failing at the supplier and burning
 * a booking attempt. Reference: https://apidoc.tektravels.com/flight/apivalidation.aspx
 *
 * Each exported function maps to a numbered checklist item; see
 * reference/api-setup/TBO-VALIDATION-CHECKLIST.md for the mapping.
 */

export type PaxType = 1 | 2 | 3; // 1 Adult, 2 Child, 3 Infant

export type Pax = {
  Title: string;
  FirstName: string;
  LastName: string;
  PaxType: PaxType;
  DateOfBirth: string; // yyyy-MM-ddTHH:mm:ss
  Gender: 1 | 2;
  IsLeadPax: boolean;
  ContactNo?: string;
  CellCountryCode?: string;
  Email?: string;
  AddressLine1?: string;
  City?: string;
  CountryCode?: string;
  CountryName?: string;
  Nationality?: string;
  PAN?: string;
  PassportNo?: string;
  PassportExpiry?: string;
  PassportIssueDate?: string;
  PassportIssueCountryCode?: string;
  GuardianDetails?: { Title: string; FirstName: string; LastName: string; PAN: string };
  Baggage?: unknown[];
  MealDynamic?: unknown[];
  Seat?: unknown[];
  Fare?: Record<string, number>;
};

/** FareQuote flags that drive what Book/Ticket must carry. */
export type FareQuoteFlags = {
  IsPanRequiredAtBook?: boolean;
  IsPanRequiredAtTicket?: boolean;
  IsPassportRequiredAtBook?: boolean;
  IsPassportRequiredAtTicket?: boolean;
  IsPassportFullDetailRequiredAtBook?: boolean;
  IsGSTMandatory?: boolean;
  IsPriceChanged?: boolean;
  FlightDetailChangeInfo?: string | null;
  isseatmandatory?: boolean;
  ismealmandatory?: boolean;
};

export class TboValidationError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = "TboValidationError";
    this.rule = rule;
  }
}
const fail = (rule: string, msg: string): never => {
  throw new TboValidationError(rule, msg);
};

// ── airline groups the checklist calls out by name ──
const SPICEJET = "SG";
const AIRASIA = "I5";
const FLYDUBAI = "FZ";
const INDIGO = "6E";
const NO_SPACE_IN_LASTNAME = new Set(["2T", "ZO"]); // TruJet, Zoom Air
/** SpiceJet destinations where passport is mandatory for every pax type. */
const SG_PASSPORT_PORTS = new Set(["DXB", "RUH", "SHJ"]);
const NEPAL_PORTS = new Set(["KTM", "PKR", "BWA"]);

// ── 1. Pax details ────────────────────────────────────────────────────────────
/**
 * Valid titles (Navitaire 4X / SpiceJet):
 *   Adult male MR · Adult female MRS|MS · Child MR|MS · Infant MSTR|MR|MS
 * "Master"/"Miss" are NOT accepted — normalize before sending.
 */
const VALID_TITLES: Record<PaxType, string[]> = {
  1: ["MR", "MRS", "MS"],
  2: ["MR", "MS"],
  3: ["MSTR", "MR", "MS"],
};
const TITLE_ALIASES: Record<string, string> = {
  MASTER: "MSTR",
  MISS: "MS",
  MSTR: "MSTR",
  MR: "MR",
  MRS: "MRS",
  MS: "MS",
};

export function normalizeTitle(title: string, paxType: PaxType, gender: 1 | 2): string {
  const t = TITLE_ALIASES[(title || "").trim().toUpperCase()] ?? "";
  if (t && VALID_TITLES[paxType].includes(t)) return t;
  // fall back to a valid title for the pax type + gender
  if (paxType === 1) return gender === 1 ? "MR" : "MRS";
  if (paxType === 2) return gender === 1 ? "MR" : "MS";
  return "MSTR";
}

/** Names may not contain . , / ( ) — TBO rejects them outright. */
const BAD_NAME_CHARS = /[.,/()]/;

export function validatePax(pax: Pax[], ctx: { isLCC: boolean; airlineCode: string }): void {
  if (!pax.length) fail("pax", "At least one passenger is required.");
  if (pax.length > 9) fail("search", "Total passenger count cannot be more than 9.");

  const airline = (ctx.airlineCode || "").toUpperCase();
  const adults = pax.filter((p) => p.PaxType === 1).length;
  const infants = pax.filter((p) => p.PaxType === 3).length;
  if (adults < 1) fail("pax", "At least one adult is required.");
  if (infants > adults) fail("pax", "Infants cannot outnumber adults.");

  pax.forEach((p, i) => {
    const who = `Passenger ${i + 1}`;
    if (!p.Title?.trim()) fail("pax", `${who}: title is mandatory.`);
    if (!p.FirstName?.trim()) fail("pax", `${who}: first name is mandatory.`);
    if (!p.LastName?.trim()) fail("pax", `${who}: last name is mandatory.`);
    if (p.Gender !== 1 && p.Gender !== 2) fail("pax", `${who}: gender is mandatory.`);

    if (!VALID_TITLES[p.PaxType].includes(p.Title.trim().toUpperCase()))
      fail("pax", `${who}: title "${p.Title}" is not valid — use ${VALID_TITLES[p.PaxType].join(" / ")}.`);

    if (BAD_NAME_CHARS.test(p.FirstName) || BAD_NAME_CHARS.test(p.LastName))
      fail("pax", `${who}: names cannot contain . , / ( ) characters.`);

    // DOB mandatory for child + infant (and for AirAsia adults too)
    if ((p.PaxType === 2 || p.PaxType === 3) && !p.DateOfBirth)
      fail("pax", `${who}: date of birth is mandatory for children and infants.`);
    if (airline === AIRASIA && p.PaxType === 1 && !p.DateOfBirth)
      fail("pax", `${who}: AirAsia requires date of birth for adults.`);

    // Phone is mandatory on every journey type
    if (!p.ContactNo?.trim()) fail("pax", `${who}: phone number is mandatory.`);
    // TBO rejects a bare "91" — the country code must carry its plus sign.
    if (p.CellCountryCode && !p.CellCountryCode.startsWith("+"))
      fail("pax", `${who}: cell country code must include "+" (e.g. +91).`);

    // SpiceJet: first + last name must be distinct
    if (airline === SPICEJET && p.FirstName.trim().toUpperCase() === p.LastName.trim().toUpperCase())
      fail("pax", `${who}: SpiceJet requires first and last name to be different.`);

    // TruJet / Zoom Air: no space in last name
    if (NO_SPACE_IN_LASTNAME.has(airline) && /\s/.test(p.LastName.trim()))
      fail("pax", `${who}: ${airline} does not allow spaces in the last name.`);
  });

  // Extra checks that apply to the FIRST (lead) passenger on LCC flights
  const lead = pax.find((p) => p.IsLeadPax) ?? pax[0];
  if (ctx.isLCC) {
    if (!lead.AddressLine1?.trim()) fail("pax", "LCC booking: address is mandatory for the lead passenger.");
    if (!lead.Email?.trim()) fail("pax", "LCC booking: email is mandatory for the lead passenger.");
    if (airline === AIRASIA) {
      if (!lead.CountryCode?.trim() || !lead.CountryName?.trim())
        fail("pax", "AirAsia: country code and country name are mandatory for the lead passenger.");
    }
  }
}

// ── 2. PAN / Passport / Guardian ──────────────────────────────────────────────
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function ageOn(dob: string, when = new Date()): number {
  const d = new Date(dob);
  let a = when.getFullYear() - d.getFullYear();
  const m = when.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && when.getDate() < d.getDate())) a--;
  return a;
}

/**
 * PAN rules:
 *  · Adult 18+       → own PAN. A guardian's PAN is NOT accepted; without one the
 *                      booking must go offline to the ops team.
 *  · Age 12–18       → pax PAN wins if supplied; guardian details are discarded.
 *  · Child / Infant  → guardian's PAN + name (as printed on the PAN).
 * A PAN that is supplied when not required must still be well-formed, or the
 * booking fails at the supplier.
 */
export function validatePanPassport(pax: Pax[], flags: FareQuoteFlags, stage: "Book" | "Ticket"): void {
  const panRequired = stage === "Book" ? flags.IsPanRequiredAtBook : flags.IsPanRequiredAtTicket;
  const passportRequired =
    stage === "Book" ? flags.IsPassportRequiredAtBook : flags.IsPassportRequiredAtTicket;

  pax.forEach((p, i) => {
    const who = `Passenger ${i + 1}`;
    const age = p.DateOfBirth ? ageOn(p.DateOfBirth) : p.PaxType === 1 ? 30 : 5;

    // A supplied PAN must be valid whether or not it was required.
    if (p.PAN && !PAN_RE.test(p.PAN.trim().toUpperCase()))
      fail("pan", `${who}: PAN "${p.PAN}" is not a valid PAN number.`);
    if (p.GuardianDetails?.PAN && !PAN_RE.test(p.GuardianDetails.PAN.trim().toUpperCase()))
      fail("pan", `${who}: guardian PAN "${p.GuardianDetails.PAN}" is not a valid PAN number.`);

    if (panRequired) {
      if (p.PaxType === 1 && age >= 18) {
        if (!p.PAN)
          fail(
            "pan",
            `${who}: PAN is mandatory for adults (18+). A parent/guardian PAN is not accepted — book offline via the ops team if unavailable.`,
          );
        if (p.GuardianDetails)
          fail("pan", `${who}: guardian details are not accepted for an adult (18+).`);
      } else if (age >= 12 && age < 18) {
        // pax PAN wins; guardian is discarded (not an error)
        if (!p.PAN && !p.GuardianDetails?.PAN)
          fail("pan", `${who}: PAN (own or guardian's) is mandatory for ages 12–18.`);
      } else {
        // child / infant
        if (!p.GuardianDetails?.PAN)
          fail("pan", `${who}: a parent/guardian PAN and name are mandatory for children and infants.`);
        if (!p.GuardianDetails?.FirstName?.trim() || !p.GuardianDetails?.LastName?.trim())
          fail("pan", `${who}: guardian name (as printed on the PAN) is mandatory.`);
      }
    }

    if (passportRequired) {
      if (!p.PassportNo?.trim()) fail("passport", `${who}: passport number is mandatory.`);
      if (!p.PassportExpiry) fail("passport", `${who}: passport expiry is mandatory.`);
      if (flags.IsPassportFullDetailRequiredAtBook) {
        if (!p.PassportIssueDate)
          fail("passport", `${who}: passport issue date is mandatory (full detail required).`);
        if (!p.PassportIssueCountryCode?.trim())
          fail("passport", `${who}: passport issue country code is mandatory (full detail required).`);
      }
    }

    // Sanity: a passport cannot be issued before the passenger was born, or expire before travel.
    if (p.PassportIssueDate && p.DateOfBirth && new Date(p.PassportIssueDate) < new Date(p.DateOfBirth))
      fail("passport", `${who}: passport issue date cannot be before the date of birth.`);
    if (p.PassportExpiry && new Date(p.PassportExpiry) < new Date())
      fail("passport", `${who}: passport has expired.`);
  });
}

/**
 * International passport rules keyed off carrier + destination:
 *  · SpiceJet → DXB / RUH / SHJ : passport for ALL pax
 *  · FlyDubai                   : passport for ALL pax
 *  · SpiceJet / IndiGo → Nepal  : passport for adult + child
 *  · GDS (non-LCC)              : passport for adult + child (except Nepal)
 */
export function requiresPassport(
  ctx: { airlineCode: string; isLCC: boolean; destination: string; isInternational: boolean },
  paxType: PaxType,
): boolean {
  if (!ctx.isInternational) return false;
  const air = (ctx.airlineCode || "").toUpperCase();
  const dest = (ctx.destination || "").toUpperCase();

  if (air === FLYDUBAI) return true;
  if (air === SPICEJET && SG_PASSPORT_PORTS.has(dest)) return true;
  if ((air === SPICEJET || air === INDIGO) && NEPAL_PORTS.has(dest)) return paxType !== 3;
  if (!ctx.isLCC) return NEPAL_PORTS.has(dest) ? false : paxType !== 3;
  return false;
}

// ── 3. Fare (per-pax split + published/offered) ───────────────────────────────
export type FareBreakdown = {
  PassengerType: number;
  PassengerCount: number;
  BaseFare: number;
  Tax: number;
  YQTax?: number;
  AdditionalTxnFeeOfrd?: number;
  AdditionalTxnFeePub?: number;
};

/**
 * Base fare and tax in Book/Ticket are PER PASSENGER: take the FareBreakdown
 * entry for that pax type and divide by its PassengerCount. (Base 1000 across
 * 2 pax → send 500 each.)
 */
export function farePerPax(breakdown: FareBreakdown[] | undefined, paxType: PaxType) {
  const fb = (breakdown ?? []).find((b) => b.PassengerType === paxType);
  if (!fb || !fb.PassengerCount) {
    return { BaseFare: 0, Tax: 0, YQTax: 0, TransactionFee: 0, AdditionalTxnFeeOfrd: 0, AdditionalTxnFeePub: 0, AirTransFee: 0 };
  }
  const n = fb.PassengerCount;
  return {
    BaseFare: Math.round((fb.BaseFare || 0) / n),
    Tax: Math.round((fb.Tax || 0) / n),
    YQTax: Math.round((fb.YQTax || 0) / n),
    TransactionFee: 0,
    AdditionalTxnFeeOfrd: Math.round((fb.AdditionalTxnFeeOfrd || 0) / n),
    AdditionalTxnFeePub: Math.round((fb.AdditionalTxnFeePub || 0) / n),
    AirTransFee: 0,
  };
}

// ── 4. GST ────────────────────────────────────────────────────────────────────
export function validateGst(flags: FareQuoteFlags, gst?: { GSTCompanyName?: string; GSTNumber?: string }): void {
  if (!flags.IsGSTMandatory) return;
  if (!gst?.GSTNumber?.trim() || !gst?.GSTCompanyName?.trim())
    fail("gst", "IsGSTMandatory is true — GST company name and GST number must be supplied.");
}

// ── 5. SSR: free baggage / mandatory meal + seat ──────────────────────────────
type SsrOption = { Code?: string; Price?: number; Weight?: number; Description?: number; Origin?: string; Destination?: string };

/**
 * Free baggage (Price 0) must be explicitly selected or the included allowance
 * is NOT applied — mandatory for international LCC, and for I5 domestic (which
 * also needs the zero-priced meal).
 *
 * `groups` is the SSR response's per-segment array; on a return sector we take
 * the free option from EVERY segment group so both legs are covered.
 */
export function pickFreeBaggage(groups: SsrOption[][] | undefined): SsrOption[] {
  if (!Array.isArray(groups)) return [];
  const out: SsrOption[] = [];
  for (const seg of groups) {
    if (!Array.isArray(seg)) continue;
    const free = seg.find((b) => (b.Price ?? -1) === 0 && (b.Weight ?? 0) > 0);
    if (free) out.push(free);
  }
  return out;
}

export function pickFreeMeal(groups: SsrOption[][] | undefined): SsrOption[] {
  if (!Array.isArray(groups)) return [];
  const out: SsrOption[] = [];
  for (const seg of groups) {
    if (!Array.isArray(seg)) continue;
    const free = seg.find((m) => (m.Price ?? -1) === 0);
    if (free) out.push(free);
  }
  return out;
}

/** Free seats, per segment — required when a special fare sets isseatmandatory. */
type SeatRow = { Seats?: SsrOption[] };
export function pickFreeSeats(groups: (SeatRow[] | SsrOption[])[] | undefined): SsrOption[] {
  if (!Array.isArray(groups)) return [];
  const out: SsrOption[] = [];
  for (const seg of groups) {
    if (!Array.isArray(seg)) continue;
    // SeatDynamic nests rows of seats; older shapes are a flat option list.
    const flat: SsrOption[] = seg.flatMap((row) =>
      Array.isArray((row as SeatRow).Seats) ? ((row as SeatRow).Seats as SsrOption[]) : [row as SsrOption],
    );
    const free = flat.find((s) => (s.Price ?? -1) === 0 && s.Code);
    if (free) out.push(free);
  }
  return out;
}

/**
 * Special fares (Super 6E, SpiceMax) set isseatmandatory / ismealmandatory in
 * FareQuote. Ticketing fails unless a free seat / free meal from SSR is included.
 */
export function validateSpecialFare(
  flags: FareQuoteFlags,
  selected: { seats?: unknown[]; meals?: unknown[] },
): void {
  if (flags.ismealmandatory && !selected.meals?.length)
    fail("special-fare", "This fare requires a meal (ismealmandatory) — select a free meal from the SSR response.");
  if (flags.isseatmandatory && !selected.seats?.length)
    fail("special-fare", "This fare requires a seat (isseatmandatory) — select a free seat from the SSR response.");
}

// ── 6. Search request ─────────────────────────────────────────────────────────
const VALID_PREF_TIMES = new Set(["00:00:00", "08:00:00", "14:00:00", "19:00:00", "01:00:00"]);
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export type SearchSegment = {
  Origin: string;
  Destination: string;
  FlightCabinClass: string;
  PreferredDepartureTime: string;
  PreferredArrivalTime: string;
};

export function validateSearch(req: {
  AdultCount: string;
  ChildCount: string;
  InfantCount: string;
  JourneyType: string;
  Segments: SearchSegment[];
  Sources?: string[] | null;
}): void {
  const a = parseInt(req.AdultCount, 10) || 0;
  const c = parseInt(req.ChildCount, 10) || 0;
  const i = parseInt(req.InfantCount, 10) || 0;
  if (a < 1) fail("search", "At least one adult is required.");
  if (a + c + i > 9) fail("search", "Total passenger count cannot be more than 9.");
  if (i > a) fail("search", "Infants cannot outnumber adults.");
  if (!req.Segments?.length) fail("search", "At least one segment is required.");

  // Multiple sources are not allowed for Special Return (JourneyType 5).
  if (req.JourneyType === "5" && (req.Sources?.length ?? 0) > 1)
    fail("search", "Multiple sources are not allowed for a Special Return search.");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  req.Segments.forEach((s, idx) => {
    const n = `Segment ${idx + 1}`;
    if (!s.Origin?.trim() || !s.Destination?.trim())
      fail("search", `${n}: origin and destination must not be null.`);
    if (!DATETIME_RE.test(s.PreferredDepartureTime))
      fail("search", `${n}: departure must use the yyyy-MM-ddTHH:mm:ss format.`);
    if (!DATETIME_RE.test(s.PreferredArrivalTime))
      fail("search", `${n}: arrival must use the yyyy-MM-ddTHH:mm:ss format.`);

    const dep = new Date(s.PreferredDepartureTime);
    if (dep < today) fail("search", `${n}: departure date cannot be earlier than today.`);

    // Only the 1st segment's departure TIME is constrained to TBO's buckets.
    if (idx === 0) {
      const time = s.PreferredDepartureTime.slice(11);
      if (!VALID_PREF_TIMES.has(time))
        fail(
          "search",
          `${n}: preferred departure time must be one of 00:00:00 (any), 08:00:00 (morning), 14:00:00 (afternoon), 19:00:00 (evening), 01:00:00 (night).`,
        );
    }

    // Departure of segment N must not precede arrival of segment N-1.
    if (idx > 0) {
      const prevArr = new Date(req.Segments[idx - 1].PreferredArrivalTime);
      if (dep < prevArr)
        fail("search", `${n}: departure cannot be earlier than the arrival of segment ${idx}.`);
    }
  });
}

// ── 7. Duplicate booking (24h, non-LCC) ───────────────────────────────────────
/**
 * TBO rejects an identical non-LCC booking within 24 hours even if the first was
 * cancelled. Criteria: sector + journey date + airline + flight number + pax.
 * We keep an in-memory ledger so we can warn before wasting a Book call.
 */
const recentBookings = new Map<string, number>();
const DUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function duplicateKey(x: {
  origin: string;
  destination: string;
  departDate: string;
  airlineCode: string;
  flightNumber: string;
  pax: Pax[];
}): string {
  const names = x.pax
    .map((p) => `${p.Title}${p.FirstName}${p.LastName}`.toUpperCase())
    .sort()
    .join("|");
  return `${x.origin}-${x.destination}-${x.departDate}-${x.airlineCode}${x.flightNumber}-${names}`;
}

export function assertNotDuplicate(key: string, isLCC: boolean): void {
  if (isLCC) return; // the 24h rule is a non-LCC rule
  const at = recentBookings.get(key);
  if (at && Date.now() - at < DUP_WINDOW_MS)
    fail(
      "duplicate",
      "A booking with the same sector, date, flight and passengers was already made in the last 24 hours. TBO does not allow duplicate non-LCC bookings within 24 hours, even if the first was cancelled.",
    );
}

export function rememberBooking(key: string): void {
  recentBookings.set(key, Date.now());
}
