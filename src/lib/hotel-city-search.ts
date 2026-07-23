import "server-only";

/**
 * Search/resolve over the full TBO hotel-city dataset — SERVER ONLY.
 *
 * `data/hotel-cities.json` (43k+ cities, ~2 MB) is generated from TBO's static
 * CityList API by `scripts/fetch-hotel-cities.mjs`. Keeping it as a checked-in
 * dataset makes autocomplete instant and deterministic on serverless — no
 * cold-start TBO round-trips — at the cost of a re-run when coverage changes.
 */
import { HOTEL_CITY_DATA, type HotelCityRow as Row } from "@/data/hotel-cities.generated";
import { POPULAR_CITIES, type HotelCity } from "@/data/hotel-cities";

const DATA: Row[] = HOTEL_CITY_DATA;

const toCity = (r: Row): HotelCity => ({ label: r.n, cityCode: r.c, countryCode: r.cc });

/** Case/diacritic-insensitive normalize for matching. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Autocomplete: prefix matches first (then substring), shorter names first so
 * "Goa, Goa" beats "Goa Velha, Goa". India before international on ties —
 * this is an Indian agency, most searches are domestic.
 */
export function searchCities(q: string, limit = 12): HotelCity[] {
  const needle = norm(q);
  if (needle.length < 2) return [];
  const scored: Array<{ r: Row; score: number }> = [];
  for (const r of DATA) {
    const name = norm(r.n);
    let score: number;
    if (name.startsWith(needle)) score = 0;
    else if (name.includes(needle)) score = 1;
    else continue;
    if (r.cc !== "IN") score += 0.5;
    scored.push({ r, score });
  }
  scored.sort((a, b) => a.score - b.score || a.r.n.length - b.r.n.length || a.r.n.localeCompare(b.r.n));
  return scored.slice(0, limit).map((s) => toCity(s.r));
}

/** Exact CityCode → city (the autocomplete round-trips codes through the URL). */
export function cityByCode(code: string): HotelCity | undefined {
  const hit = DATA.find((r) => r.c === code);
  return hit ? toCity(hit) : undefined;
}

/**
 * Loose resolve for free-typed input: popular label → exact name → best search
 * hit. Lets /hotels?city=goa (typed, shared, or legacy URLs) still work.
 */
export function resolveCity(input?: string): HotelCity | undefined {
  if (!input) return undefined;
  const q = input.trim();
  if (/^\d+$/.test(q)) return cityByCode(q);
  const nq = norm(q);
  return (
    POPULAR_CITIES.find((c) => norm(c.label) === nq) ??
    POPULAR_CITIES.find((c) => norm(c.label).includes(nq)) ??
    searchCities(q, 1)[0]
  );
}
