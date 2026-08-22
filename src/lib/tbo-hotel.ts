/**
 * TBO (TekTravels) Hotel API — SEARCH + PRE-BOOK client. SERVER ONLY.
 *
 * The dynamic (priced) half of the hotel flow. Per TBO these use HTTP **Basic
 * auth** with your AGENCY credentials (the same login as the flight API), on a
 * different host than the static-data endpoints. Docs:
 * https://apidoc.tektravels.com/hotelnew
 *
 *   Search   → priced rooms, each carrying a `BookingCode`
 *   PreBook  → re-price one `BookingCode` + return `ValidationInfo`
 *              (PAN/passport/GST rules that drive what Book must collect)
 *
 * There is no TraceId/ResultIndex here — the unit of work is the `BookingCode`.
 * Dates are `YYYY-MM-DD`. Never import from a client component; reach via /api/*.
 *
 * Env: TBO_HOTEL_URL (base), TBO_HOTEL_USERNAME/PASSWORD (fall back to
 * TBO_USERNAME/PASSWORD), TBO_END_USER_IP.
 */
import { TboHotelError } from "./tbo-hotel-static";
import { tboFetch } from "./tbo-fetch";

const DEFAULT_BASE = "https://affiliate.tektravels.com/HotelAPI";

function cfg() {
  const username =
    process.env.TBO_HOTEL_USERNAME || process.env.TBO_USERNAME || "";
  const password =
    process.env.TBO_HOTEL_PASSWORD || process.env.TBO_PASSWORD || "";
  return {
    base: (process.env.TBO_HOTEL_URL || DEFAULT_BASE).replace(/\/+$/, ""),
    username,
    password,
    /** The flight login is standing in because no hotel-specific one is set. */
    usingFlightCredentials:
      !process.env.TBO_HOTEL_USERNAME || !process.env.TBO_HOTEL_PASSWORD,
    ip: process.env.TBO_END_USER_IP || "115.112.175.13",
  };
}

/** True once agency creds are present (own hotel creds or reused flight creds). */
export function hotelBookingConfigured(): boolean {
  const c = cfg();
  return Boolean(c.username && c.password);
}

function authHeader(): string {
  const c = cfg();
  return (
    "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64")
  );
}

type TboStatus = { Code?: number; Description?: string };

/**
 * POST a booking-host method. TBO returns gzip (Node decompresses) and signals
 * success via Status.Code === 200; on failure the reason is in Status.Description
 * even under an HTTP 400, so we always parse the body and match on the code.
 */
export async function bookingCall<T extends { Status?: TboStatus }>(
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 60_000,
  baseUrl?: string,
): Promise<T> {
  if (!hotelBookingConfigured()) {
    throw new TboHotelError("Hotel agency credentials are not configured.", -1);
  }
  const url = `${(baseUrl ?? cfg().base).replace(/\/+$/, "")}/${method}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await tboFetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctl.signal,
    });
  } catch {
    throw new TboHotelError(`Network error calling ${method}.`, 0);
  } finally {
    clearTimeout(t);
  }

  let json: T;
  try {
    json = (await res.json()) as T;
  } catch {
    throw new TboHotelError(
      `${method} returned a non-JSON response (HTTP ${res.status}).`,
      res.status,
    );
  }
  const code = json?.Status?.Code;
  if (code !== undefined && code !== 200) {
    // A 401 here empties the whole site of inventory, and the most likely cause
    // is that no hotel-specific login is configured, so the FLIGHT login is
    // standing in — which TBO's hotel hosts reject once the flight account moves
    // to live. That outage (18-Aug-2026) looked like "no availability" and cost
    // TBO a verification round, so say plainly what to check.
    if (code === 401 && cfg().usingFlightCredentials) {
      console.error(
        `[tbo-hotel] ${method} refused with 401 and no TBO_HOTEL_USERNAME/TBO_HOTEL_PASSWORD is set — ` +
          "the flight login is being reused for hotels and TBO's hotel hosts do not accept it. " +
          "Set the hotel-specific credentials.",
      );
    }
    throw new TboHotelError(
      json.Status?.Description || `${method} failed (Status ${code}).`,
      code,
    );
  }
  return json;
}

// ── request/normalized shapes ──
export type RoomOccupancy = {
  adults: number;
  /** Ages of each child (0–17). Length must equal the child count. */
  childrenAges?: number[];
};

export type HotelSearchArgs = {
  checkInISO: string; // YYYY-MM-DD
  checkOutISO: string; // YYYY-MM-DD
  /** TBO hotel codes to price (comma-joined on the wire; keep ≤100). */
  hotelCodes: string[];
  /** Guest nationality, ISO-3166-1 alpha-2 (e.g. "IN"). */
  nationality: string;
  rooms: RoomOccupancy[];
  refundableOnly?: boolean;
  mealType?: "All" | "WithMeal" | "RoomOnly";
  /**
   * Ask TBO for the detailed Search RS (room amenities, promotions, richer
   * inclusions). Heavier payload — used on the single-hotel room page, not on
   * a 100-code city sweep.
   */
  detailed?: boolean;
};

/**
 * How many of a city's hotels we price per search. TBO caps ONE Search RQ at
 * 100 HotelCodes, so this is covered by parallel ≤100-code requests; the
 * ceiling only keeps a mega-city's fan-out (and the page's latency) bounded.
 */
export const CITY_SEARCH_CODE_CEILING = 500;

export type CancelPolicy = {
  fromDate: string;
  chargeType?: string | number;
  charge: number;
};

export type HotelRoomOffer = {
  bookingCode: string;
  name: string;
  mealType?: string;
  inclusion?: string;
  isRefundable: boolean;
  totalFare: number;
  totalTax: number;
  cancelPolicies: CancelPolicy[];
  /** Shown on the room page — TBO portal checkpoints 18, 19, 24. */
  amenities?: string[];
  roomPromotions?: string[];
  /** Mandatory charges the guest pays AT the hotel, in the hotel's currency. */
  supplements?: HotelSupplement[];
  /** TBO's bedding caveat, when the rate carries one. */
  beddingNote?: string;
  /** The rate bundles airport/city transfers — a real differentiator, and free
   *  to surface: TBO has always sent it. */
  withTransfers?: boolean;
  /** A package rate rather than a room-only one. */
  packageFare?: boolean;
};

/** A charge payable at the hotel (Search/PreBook `Supplements`) — local currency. */
export type HotelSupplement = {
  type?: string;
  description?: string;
  price?: number;
  currency?: string;
};

export type HotelOffer = {
  hotelCode: string;
  currency: string;
  /** Rooms for this hotel, cheapest first. */
  rooms: HotelRoomOffer[];
  cheapestFare: number;
};

export type HotelSearchResult = {
  ok: boolean;
  source: "live" | "unavailable";
  checkInISO: string;
  checkOutISO: string;
  currency?: string;
  offers: HotelOffer[];
  error?: string;
};

type RawRoom = {
  Name?: string[] | string;
  BookingCode?: string;
  MealType?: string;
  Inclusion?: string;
  IsRefundable?: boolean;
  TotalFare?: number;
  TotalTax?: number;
  /** B2C feeds return a floor price (field name varies across TBO docs). */
  RecommendedSellingRate?: number;
  RecommendedSellingPrice?: number;
  /** Detailed Search RS extras. */
  Amenities?: string[] | string;
  Amenity?: string[] | string;
  RoomPromotion?: string[] | string;
  BeddingGroup?: string;
  /** TBO nests supplements per room as an array of arrays. */
  Supplements?: Array<
    Array<{
      Type?: string;
      Description?: string;
      Price?: number;
      Currency?: string;
    }>
  >;
  CancelPolicies?: Array<{
    FromDate?: string;
    ChargeType?: string | number;
    CancellationCharge?: number;
  }>;
  WithTransfers?: boolean;
  PackageFare?: boolean;
};
type RawHotelResult = {
  HotelCode?: string | number;
  Currency?: string;
  Rooms?: RawRoom[];
};

/** TBO returns these as either a string or a string[] depending on the method. */
function strList(v: string[] | string | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v])
    .map((s) => String(s).trim())
    .filter(Boolean);
}

/**
 * The customer-facing selling price for a room.
 *
 * TBO portal rule: the page must show **TotalFare** — never NetAmount, which is
 * TBO's charge to the agency and belongs only in the Book RQ. The one permitted
 * adjustment is the B2C floor: a selling price may never sit below the
 * RecommendedSellingRate. No rounding — TBO checks the exact fare.
 */
export function sellingFare(r: {
  TotalFare?: number;
  RecommendedSellingRate?: number;
  RecommendedSellingPrice?: number;
}): number {
  const rsp = r.RecommendedSellingRate ?? r.RecommendedSellingPrice ?? 0;
  return Math.max(r.TotalFare ?? 0, rsp);
}

function mapRoom(r: RawRoom): HotelRoomOffer {
  const amenities = [...strList(r.Amenities), ...strList(r.Amenity)];
  return {
    bookingCode: r.BookingCode ?? "",
    name: Array.isArray(r.Name) ? r.Name.join(", ") : (r.Name ?? ""),
    mealType: r.MealType,
    inclusion: r.Inclusion,
    isRefundable: Boolean(r.IsRefundable),
    totalFare: sellingFare(r),
    totalTax: r.TotalTax ?? 0,
    cancelPolicies: (r.CancelPolicies ?? []).map((p) => ({
      fromDate: p.FromDate ?? "",
      chargeType: p.ChargeType,
      charge: p.CancellationCharge ?? 0,
    })),
    ...(amenities.length ? { amenities: [...new Set(amenities)] } : {}),
    ...(strList(r.RoomPromotion).length
      ? { roomPromotions: strList(r.RoomPromotion) }
      : {}),
    ...(r.BeddingGroup ? { beddingNote: r.BeddingGroup } : {}),
    ...(r.WithTransfers ? { withTransfers: true } : {}),
    ...(r.PackageFare ? { packageFare: true } : {}),
    // Verified live against TBO's own sample HotelCodes: Search (not just
    // PreBook) returns mandatory Supplements, so the guest can see the
    // pay-at-hotel charges on the room page — portal checkpoint 19.
    ...((r.Supplements ?? []).flat().length
      ? {
          supplements: (r.Supplements ?? []).flat().map((sp) => ({
            type: sp.Type,
            description: sp.Description,
            price: sp.Price,
            currency: sp.Currency,
          })),
        }
      : {}),
  };
}

// ── short result cache: a BookingCode is only valid for a short window ──
const searchCache = new Map<string, { data: HotelSearchResult; exp: number }>();
const SEARCH_TTL = 5 * 60 * 1000;

/**
 * Search — price rooms across the given hotel codes for the stay + occupancy.
 * Returns one HotelOffer per hotel (rooms cheapest-first), or an `ok:false`
 * result the caller can degrade on. Never throws for a normal supplier "no
 * rooms" — only wraps hard config/network faults.
 */
export async function searchHotels(
  args: HotelSearchArgs,
): Promise<HotelSearchResult> {
  const base: Omit<HotelSearchResult, "ok" | "source" | "offers"> = {
    checkInISO: args.checkInISO,
    checkOutISO: args.checkOutISO,
  };
  const fail = (error: string): HotelSearchResult => ({
    ...base,
    ok: false,
    source: "unavailable",
    offers: [],
    error,
  });

  if (!hotelBookingConfigured()) return fail("not-configured");
  if (!args.hotelCodes.length) return fail("no-hotel-codes");

  const key = JSON.stringify([
    args.checkInISO,
    args.checkOutISO,
    args.hotelCodes,
    args.nationality,
    args.rooms,
    args.refundableOnly,
    args.mealType,
    args.detailed,
  ]);
  const hit = searchCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;

  const PaxRooms = args.rooms.map((r) => {
    const ages = (r.childrenAges ?? []).filter((a) => a >= 0);
    return {
      Adults: Math.max(1, r.adults),
      Children: ages.length,
      ChildrenAges: ages.length ? ages : null,
    };
  });

  // Filters.NoOfRooms caps how many ROOM OPTIONS TBO returns per hotel
  // (verified live: with it = 1 room/hotel, without = full list, e.g. 13).
  // TBO portal checkpoint 11: it must be 0 — i.e. omitted — so the full room
  // feed comes back for every hotel. The results page still *renders* the
  // cheapest room per hotel; that trim happens on our side, not in the RQ.
  const filters: Record<string, unknown> = {};
  if (args.refundableOnly) filters.Refundable = true;
  if (args.mealType) filters.MealType = args.mealType;

  const body = {
    CheckIn: args.checkInISO,
    CheckOut: args.checkOutISO,
    HotelCodes: args.hotelCodes.join(","),
    GuestNationality: args.nationality.toUpperCase(),
    PaxRooms,
    // TBO wants ResponseTime scaled to the request size (allowed 5–23s):
    // a single-hotel reprice shouldn't ask for the full 23s a 100-code
    // city sweep needs.
    ResponseTime: Math.min(
      23,
      Math.max(5, Math.ceil(args.hotelCodes.length / 5)),
    ),
    // Detailed only where we render the extra content (single-hotel room page)
    // — a 100-code city sweep would pay for detail it never shows.
    IsDetailedResponse: Boolean(args.detailed),
    Filters: filters,
  };

  type Resp = { Status?: TboStatus; HotelResult?: RawHotelResult[] };
  let j: Resp;
  try {
    j = await bookingCall<Resp>("Search", body, 60_000);
  } catch (e) {
    return fail(e instanceof TboHotelError ? e.message : "network");
  }

  // De-dupe — mandatory for TBO certification: the same hotel can come back
  // more than once (multi-supplier inventory), so merge duplicate HotelCodes
  // into one offer and collapse room options that are the same room + board at
  // the same fare, keeping the cheapest set. A hotel is never rendered twice.
  const byCode = new Map<
    string,
    { currency: string; rooms: HotelRoomOffer[] }
  >();
  for (const h of j.HotelResult ?? []) {
    const code = String(h.HotelCode ?? "");
    const rooms = (h.Rooms ?? []).map(mapRoom);
    if (!code || !rooms.length) continue;
    const prev = byCode.get(code);
    if (prev) prev.rooms.push(...rooms);
    else byCode.set(code, { currency: h.Currency ?? "INR", rooms });
  }
  const offers: HotelOffer[] = [...byCode.entries()]
    .map(([hotelCode, { currency, rooms }]) => {
      const seen = new Set<string>();
      const deduped = rooms
        .sort((a, b) => a.totalFare - b.totalFare)
        .filter((r) => {
          const key = `${r.name}|${r.mealType ?? ""}|${r.inclusion ?? ""}|${r.totalFare}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return {
        hotelCode,
        currency,
        rooms: deduped,
        cheapestFare: deduped[0]?.totalFare ?? 0,
      };
    })
    .sort((a, b) => a.cheapestFare - b.cheapestFare);

  const data: HotelSearchResult = {
    ...base,
    ok: true,
    source: "live",
    currency: offers[0]?.currency,
    offers,
  };
  searchCache.set(key, { data, exp: Date.now() + SEARCH_TTL });
  return data;
}

/**
 * Price a whole city: ONE Search RQ per ≤100 HotelCodes, all dispatched together.
 *
 * TBO caps a Search at 100 codes and asks for parallel requests rather than a
 * truncated one (portal checkpoints 0 and 10). The per-batch timings are logged
 * because TBO twice read our fan-out as sequential — "sent at +0ms" for every
 * batch is the evidence, and it costs one log line.
 *
 * Batches that return nothing are normal on a city sweep: the merged result is
 * every hotel that priced, cheapest first, and only an all-batches failure is a
 * failure.
 */
export async function searchCityHotels(
  args: Omit<HotelSearchArgs, "hotelCodes"> & { hotelCodes: string[] },
): Promise<HotelSearchResult> {
  const { hotelCodes, ...rest } = args;
  const chunks: string[][] = [];
  for (let i = 0; i < hotelCodes.length; i += 100)
    chunks.push(hotelCodes.slice(i, i + 100));

  if (!chunks.length) {
    return {
      ok: false,
      source: "unavailable",
      checkInISO: args.checkInISO,
      checkOutISO: args.checkOutISO,
      offers: [],
      error: "no-hotel-codes",
    };
  }

  const t0 = Date.now();
  const settled = await Promise.all(
    chunks.map((codes, i) => {
      const sentAt = Date.now() - t0;
      return searchHotels({ ...rest, hotelCodes: codes }).then((r) => {
        console.info(
          `[tbo-hotel] batch ${i + 1}/${chunks.length} · ${codes.length} codes · sent +${sentAt}ms · done +${Date.now() - t0}ms · ${r.ok ? `${r.offers.length} hotels` : r.error}`,
        );
        return r;
      });
    }),
  );
  console.info(
    `[tbo-hotel] ${chunks.length} parallel batches finished in ${Date.now() - t0}ms`,
  );

  const live = settled.filter((r) => r.ok);
  if (!live.length) return settled[0];
  return {
    ...live[0],
    offers: live
      .flatMap((r) => r.offers)
      .sort((a, b) => a.cheapestFare - b.cheapestFare),
  };
}

// ── PreBook: re-price one room + learn what Book requires ──
export type HotelValidationInfo = {
  panMandatory: boolean;
  passportMandatory: boolean;
  gstAllowed: boolean;
  paxNameMinLength?: number;
  paxNameMaxLength?: number;
  panCountRequired?: number;
};

export type PreBookResult = {
  ok: boolean;
  bookingCode: string;
  currency?: string;
  netAmount?: number;
  totalFare?: number;
  totalTax?: number;
  isPriceChanged?: boolean;
  isCancellationPolicyChanged?: boolean;
  cancelPolicies?: CancelPolicy[];
  // TBO certification: Inclusion, RateConditions and RoomPromotion from the
  // PreBook RS MUST be shown to the user before Book (TBO takes no liability
  // otherwise). Same for mandatory Supplements, which are paid at the hotel.
  mealType?: string;
  inclusion?: string;
  rateConditions?: string[];
  roomPromotions?: string[];
  supplements?: HotelSupplement[];
  /** Room-level amenities — PreBook carries these even when Search does not. */
  amenities?: string[];
  /** TBO's "book by" deadline for the rate, as returned ("DD-MM-YYYY hh:mm:ss", UTC). */
  lastCancellationDeadline?: string;
  validation?: HotelValidationInfo;
  error?: string;
};

/**
 * PreBook — mandatory re-price before Book. Returns the confirmed price and the
 * `ValidationInfo` block that tells the checkout form which fields (PAN /
 * passport / GST) TBO will require for this specific rate.
 */
export async function preBookHotel(args: {
  bookingCode: string;
  paymentMode?: string;
}): Promise<PreBookResult> {
  const fail = (error: string): PreBookResult => ({
    ok: false,
    bookingCode: args.bookingCode,
    error,
  });
  if (!hotelBookingConfigured()) return fail("not-configured");

  type RawVI = {
    PanMandatory?: boolean;
    PassportMandatory?: boolean;
    GSTAllowed?: boolean;
    PaxNameMinLength?: number;
    PaxNameMaxLength?: number;
    PanCountRequired?: number;
  };
  type RawSupplement = {
    Type?: string;
    Description?: string;
    Price?: number;
    Currency?: string;
  };
  type RawRoomPB = RawRoom & {
    NetAmount?: number;
    RateConditions?: string[];
    RoomPromotion?: string[];
    LastCancellationDeadline?: string;
    // TBO nests supplements per room as an array of arrays.
    Supplements?: RawSupplement[][];
    ValidationInfo?: RawVI;
  };
  type Resp = {
    Status?: TboStatus;
    HotelResult?: Array<{
      Currency?: string;
      IsPriceChanged?: boolean;
      IsCancellationPolicyChanged?: boolean;
      Rooms?: RawRoomPB[];
    }>;
  };

  let j: Resp;
  try {
    j = await bookingCall<Resp>(
      "PreBook",
      {
        BookingCode: args.bookingCode,
        PaymentMode: args.paymentMode ?? "Limit",
      },
      60_000,
    );
  } catch (e) {
    return fail(e instanceof TboHotelError ? e.message : "network");
  }

  const hr = j.HotelResult?.[0];
  const room = hr?.Rooms?.[0];
  if (!room)
    return fail("PreBook returned no room — the rate is no longer available.");
  const vi = room.ValidationInfo ?? {};

  // TBO portal checkpoint 30: the portal must show TotalFare throughout the
  // booking — NetAmount is TBO's charge to the agency and rides ONLY in the
  // Book RQ (checkpoint 31). The single permitted adjustment is the B2C floor
  // at RecommendedSellingRate. Exact, unrounded — checkpoints 12 and 16.
  const fare = sellingFare(room);
  return {
    ok: true,
    bookingCode: room.BookingCode ?? args.bookingCode,
    currency: hr?.Currency,
    netAmount: room.NetAmount,
    totalFare: fare > 0 ? fare : undefined,
    totalTax: room.TotalTax,
    isPriceChanged: Boolean(hr?.IsPriceChanged),
    isCancellationPolicyChanged: Boolean(hr?.IsCancellationPolicyChanged),
    cancelPolicies: (room.CancelPolicies ?? []).map((p) => ({
      fromDate: p.FromDate ?? "",
      chargeType: p.ChargeType,
      charge: p.CancellationCharge ?? 0,
    })),
    mealType: room.MealType,
    inclusion: room.Inclusion,
    rateConditions: (room.RateConditions ?? []).filter(Boolean),
    roomPromotions: strList(room.RoomPromotion),
    // Verified live: PreBook returns a room-level Amenities list (Search does not),
    // which is what TBO's portal checkpoint 24 looks for on the room/book pages.
    amenities: strList(room.Amenities).length
      ? strList(room.Amenities)
      : undefined,
    lastCancellationDeadline: room.LastCancellationDeadline,
    supplements: (room.Supplements ?? []).flat().map((s) => ({
      type: s.Type,
      description: s.Description,
      price: s.Price,
      currency: s.Currency,
    })),
    validation: {
      panMandatory: Boolean(vi.PanMandatory),
      passportMandatory: Boolean(vi.PassportMandatory),
      gstAllowed: Boolean(vi.GSTAllowed),
      paxNameMinLength: vi.PaxNameMinLength,
      paxNameMaxLength: vi.PaxNameMaxLength,
      panCountRequired: vi.PanCountRequired,
    },
  };
}
