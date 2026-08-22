/**
 * TBO (TekTravels) Hotel API — STATIC DATA client. SERVER ONLY.
 *
 * Reference/content endpoints: CountryList, CityList, TBOHotelCodeList,
 * HotelDetails. Per TBO these use HTTP **Basic auth** with the separate
 * "static data credentials" (NOT the agency login used for Search/Book), and a
 * different host than the flight API. Docs: https://apidoc.tektravels.com/hotelnew
 *
 * Never import from a client component: reads credentials from env and calls
 * TBO server-side. Reach it only through /api/*.
 *
 * Static data barely changes, so results are cached hard (see TTLs below) to keep
 * us well under any fair-use limits and to make the hotel search UI snappy.
 *
 * Env (.env.local, gitignored):
 *   TBO_HOTEL_STATIC_URL       base host, default api.tbotechnology.in/TBOHolidays_HotelAPI
 *   TBO_HOTEL_STATIC_USERNAME  static-data username
 *   TBO_HOTEL_STATIC_PASSWORD  static-data password
 */
import { tboFetch } from "./tbo-fetch";
import type { RoomContent } from "./hotel-room-match";

const DEFAULT_BASE = "http://api.tbotechnology.in/TBOHolidays_HotelAPI";

function cfg() {
  return {
    base: (process.env.TBO_HOTEL_STATIC_URL || DEFAULT_BASE).replace(
      /\/+$/,
      "",
    ),
    username: process.env.TBO_HOTEL_STATIC_USERNAME ?? "",
    password: process.env.TBO_HOTEL_STATIC_PASSWORD ?? "",
  };
}

/** True once static-data creds are present, so callers can degrade gracefully. */
export function hotelStaticConfigured(): boolean {
  const c = cfg();
  return Boolean(c.username && c.password);
}

function authHeader(): string {
  const c = cfg();
  return (
    "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64")
  );
}

// ── TBO's Basic-auth family wraps every response in a Status object ──
// Status.Code === 200 means success; anything else is an error we surface.
type TboStatus = { Code?: number; Description?: string };

export class TboHotelError extends Error {
  constructor(
    message: string,
    readonly code = 0,
  ) {
    super(message);
    this.name = "TboHotelError";
  }
}

/**
 * POST (or GET) a static-data method and return its parsed JSON.
 * TBO returns gzip; Node's fetch decompresses transparently. On HTTP 400 TBO
 * puts the reason in the body, so we read it either way and match on Status.Code.
 */
async function call<T extends { Status?: TboStatus }>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!hotelStaticConfigured()) {
    throw new TboHotelError(
      "Hotel static-data credentials are not configured.",
      -1,
    );
  }
  const url = `${cfg().base}/${method}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30_000);
  let res: Response;
  try {
    res = await tboFetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: body ? JSON.stringify(body) : undefined,
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
    throw new TboHotelError(
      json.Status?.Description || `${method} failed (Status ${code}).`,
      code,
    );
  }
  return json;
}

// ── normalized shapes returned to the app ──
export type TboCountry = { code: string; name: string };
export type TboCity = { code: string; name: string };
export type TboHotelStub = {
  code: string;
  name: string;
  rating: string;
  address: string;
  lat?: string;
  lng?: string;
  cityName?: string;
  countryCode?: string;
};

// ── in-memory caches (static data changes rarely) ──
const DAY = 24 * 60 * 60 * 1000;
const countryCache = new Map<string, { data: TboCountry[]; exp: number }>();
const cityCache = new Map<string, { data: TboCity[]; exp: number }>();
const hotelCodeCache = new Map<string, { data: TboHotelStub[]; exp: number }>();

/** CountryList — GET, no request body. Returns ISO-2 code + name. */
export async function countryList(): Promise<TboCountry[]> {
  const hit = countryCache.get("all");
  if (hit && hit.exp > Date.now()) return hit.data;

  type Resp = {
    Status?: TboStatus;
    CountryList?: Array<{ Code?: string; Name?: string }>;
  };
  const j = await call<Resp>("CountryList");
  const data = (j.CountryList ?? []).map((c) => ({
    code: c.Code ?? "",
    name: c.Name ?? "",
  }));
  countryCache.set("all", { data, exp: Date.now() + 7 * DAY });
  return data;
}

/** CityList — POST { CountryCode }. Returns TBO numeric city ids + names. */
export async function cityList(countryCode: string): Promise<TboCity[]> {
  const key = countryCode.toUpperCase();
  const hit = cityCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;

  type Resp = {
    Status?: TboStatus;
    CityList?: Array<{ Code?: string; Name?: string }>;
  };
  const j = await call<Resp>("CityList", { CountryCode: key });
  const data = (j.CityList ?? []).map((c) => ({
    code: c.Code ?? "",
    name: c.Name ?? "",
  }));
  cityCache.set(key, { data, exp: Date.now() + 7 * DAY });
  return data;
}

/**
 * TBOHotelCodeList — POST { CityCode }. City-wise hotel stubs (code, name,
 * rating, address, geo) used to seed a Search's HotelCodes for that city.
 */
export async function hotelCodesByCity(
  cityCode: string | number,
): Promise<TboHotelStub[]> {
  const key = String(cityCode);
  const hit = hotelCodeCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;

  type RawHotel = {
    HotelCode?: string | number;
    HotelName?: string;
    HotelRating?: string;
    Address?: string;
    Latitude?: string;
    Longitude?: string;
    CityName?: string;
    CountryCode?: string;
  };
  type Resp = { Status?: TboStatus; Hotels?: RawHotel[] };
  const j = await call<Resp>("TBOHotelCodeList", { CityCode: key });
  const data = (j.Hotels ?? []).map((h) => ({
    code: String(h.HotelCode ?? ""),
    name: h.HotelName ?? "",
    rating: h.HotelRating ?? "",
    address: h.Address ?? "",
    lat: h.Latitude,
    lng: h.Longitude,
    cityName: h.CityName,
    countryCode: h.CountryCode,
  }));
  hotelCodeCache.set(key, { data, exp: Date.now() + DAY });
  return data;
}

/**
 * HotelDetails — POST { Hotelcodes, Language, IsRoomDetailRequired }.
 * `codes` may be a single code or comma-joined list. Returns TBO's raw detail
 * objects (rich + verbose) — the search/detail UI picks the fields it needs.
 */
export async function hotelDetails(
  codes: string | string[],
  opts: { language?: string; withRooms?: boolean } = {},
): Promise<Array<Record<string, unknown>>> {
  const Hotelcodes = Array.isArray(codes) ? codes.join(",") : codes;
  type Resp = {
    Status?: TboStatus;
    HotelDetails?: Array<Record<string, unknown>>;
  };
  const j = await call<Resp>("HotelDetails", {
    Hotelcodes,
    Language: opts.language ?? "EN",
    IsRoomDetailRequired: opts.withRooms ?? true,
  });
  return j.HotelDetails ?? [];
}

// ── normalized hotel content (images / description / facilities) ──
export type TboHotelInfo = {
  code: string;
  name: string;
  /** 0–5; TBO sends an int here (the code-list sends words like "FourStar"). */
  rating: number;
  description: string;
  facilities: string[];
  /** Absolute image URLs (tboholidays.com) — often 50–90 per hotel. */
  images: string[];
  address: string;
  cityName?: string;
  lat?: string;
  lng?: string;
  checkInTime?: string;
  checkOutTime?: string;
  /**
   * Per-room-type content, present only when fetched via `hotelInfoWithRooms`.
   * Absent on the search-results path: TBO lists every rate-plan variant here
   * (one Dubai hotel returns 1,831 entries), which is dead weight on a card
   * that shows a price and a photo.
   */
  rooms?: RoomContent[];
};

const infoCache = new Map<string, { data: TboHotelInfo; exp: number }>();

function mapInfo(
  raw: Record<string, unknown>,
  withRooms = false,
): TboHotelInfo {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  // Map arrives as "lat|long".
  const [lat, lng] = s(raw.Map).split("|");
  return {
    code: String(raw.HotelCode ?? ""),
    name: s(raw.HotelName),
    rating: Math.max(0, Math.min(5, Number(raw.HotelRating) || 0)),
    description: s(raw.Description),
    facilities: arr(raw.HotelFacilities),
    images: arr(raw.Images),
    address: s(raw.Address),
    cityName: s(raw.CityName) || undefined,
    lat: lat || undefined,
    lng: lng || undefined,
    checkInTime: s(raw.CheckInTime) || undefined,
    checkOutTime: s(raw.CheckOutTime) || undefined,
    ...(withRooms ? { rooms: mapRooms(raw.RoomDetails) } : {}),
  };
}

/**
 * `RoomDetails` → the three fields the room list can actually use. Deduped by
 * name, because TBO repeats a room type once per rate plan, and trimmed because
 * the raw array is most of the response weight.
 */
function mapRooms(raw: unknown): RoomContent[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, RoomContent>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.RoomName === "string" ? r.RoomName.trim() : "";
    if (!name || byName.has(name)) continue;
    // TBO writes an unknown size as "0 ft" rather than omitting it; rendering
    // that tells the guest their room is zero square feet.
    const rawSize = typeof r.RoomSize === "string" ? r.RoomSize.trim() : "";
    const size = /^0+\s*(ft|sq\s*ft|sqft|sqm|m2)?$/i.test(rawSize)
      ? ""
      : rawSize;
    const description =
      typeof r.RoomDescription === "string" ? r.RoomDescription.trim() : "";
    const image = typeof r.imageURL === "string" ? r.imageURL.trim() : "";
    if (!size && !description && !image) continue;
    byName.set(name, {
      name,
      ...(size ? { size } : {}),
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
    });
  }
  return [...byName.values()];
}

/**
 * How many hotel codes go into one HotelDetails call.
 *
 * HotelDetails returns ~21 kB per hotel, so a whole result page in one request
 * is a 3–4 MB response — and the static-IP proxy that every TBO call is routed
 * through (`TBO_PROXY_URL`) drops large responses part-way, closing the socket
 * around the 1 MB mark. Measured on a 167-hotel Dubai search: the single call
 * failed 5 times in 12 through the proxy and 0 times in 12 without it. Because
 * one failure lost the whole map, 40% of searches rendered with no photos at all.
 *
 * At 25 codes a chunk is ~500 kB, comfortably under where the proxy gives up,
 * and a chunk that does fail costs 25 cards their photo instead of every card.
 * Same 12 rounds chunked: one bad chunk total, ~2 hotels of 167 affected.
 */
const INFO_CHUNK = 25;

/**
 * HotelDetails with one retry, returning [] rather than throwing.
 *
 * The proxy's truncation is transient — the same request usually succeeds
 * immediately afterwards — so one retry removes most of it. What is NOT
 * acceptable is the silent failure this replaces: content is cosmetic enough to
 * drop, but never quiet enough to hide, or a 40% failure rate goes unnoticed in
 * production for weeks.
 */
async function detailsOrNone(
  codes: string[],
  withRooms: boolean,
): Promise<Array<Record<string, unknown>>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await hotelDetails(codes, { withRooms });
    } catch (e) {
      if (attempt === 1) {
        console.warn(
          `[tbo-hotel-static] HotelDetails failed for ${codes.length} code(s) ` +
            `(${codes[0]}…) after 2 attempts — that content is missing from the page:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  return [];
}

/**
 * Normalized content for many hotels, hard-cached per code — this is what puts
 * photos and stars on result cards. Codes TBO returns nothing for are absent.
 *
 * Chunked and independently retried: content is cosmetic, so a chunk that fails
 * twice is dropped rather than failing the search, but it is LOGGED. The silent
 * catch this replaces made a 40% failure rate invisible in production.
 */
export async function hotelInfoBatch(
  codes: string[],
): Promise<Map<string, TboHotelInfo>> {
  const out = new Map<string, TboHotelInfo>();
  const missing: string[] = [];
  const now = Date.now();
  for (const code of codes) {
    const hit = infoCache.get(code);
    if (hit && hit.exp > now) out.set(code, hit.data);
    else missing.push(code);
  }
  if (!missing.length) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += INFO_CHUNK) {
    chunks.push(missing.slice(i, i + INFO_CHUNK));
  }

  const results = await Promise.all(
    chunks.map((chunk) => detailsOrNone(chunk, false)),
  );

  for (const raw of results.flat()) {
    const info = mapInfo(raw);
    if (!info.code) continue;
    infoCache.set(info.code, { data: info, exp: now + DAY });
    out.set(info.code, info);
  }
  return out;
}

/** Single-hotel convenience for the detail page. */
export async function hotelInfo(
  code: string,
): Promise<TboHotelInfo | undefined> {
  return (await hotelInfoBatch([code])).get(code);
}

/** Cached separately from `infoCache`: the same code has two shapes, and the
 *  room-less one must never satisfy a request that needs rooms. */
const infoWithRoomsCache = new Map<
  string,
  { data: TboHotelInfo; exp: number }
>();

/**
 * One hotel WITH its per-room content, for the room list on the detail page.
 *
 * Deliberately single-hotel: `RoomDetails` is most of the payload (a 1,831-room
 * hotel is 0.63 MB on its own), so this is never batched across a result page.
 */
export async function hotelInfoWithRooms(
  code: string,
): Promise<TboHotelInfo | undefined> {
  const now = Date.now();
  const hit = infoWithRoomsCache.get(code);
  if (hit && hit.exp > now) return hit.data;

  const [raw] = await detailsOrNone([code], true);
  if (!raw) return hotelInfo(code); // fall back to the room-less shape
  const info = mapInfo(raw, true);
  if (!info.code) return undefined;
  infoWithRoomsCache.set(code, { data: info, exp: now + DAY });
  return info;
}
