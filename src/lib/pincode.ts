import { INDIAN_STATES } from "@/data/indian-states";

/**
 * PIN code → city + state, from India Post's public directory
 * (api.postalpincode.in). Pure parsing lives here so it is testable; the
 * network call is in `lookupPincode`, reached only through `/api/pincode`.
 *
 * India Post answers per POST OFFICE, not per PIN, and one PIN can straddle two
 * districts (400001 lists Mumbai's Bazargate beside Elephanta Caves in Raigarh).
 * The district the most offices agree on wins — the guest can still edit it.
 */

export type PincodePlace = { pin: string; city: string; state: string };

type PostOffice = { District?: string | null; State?: string | null };
type IndiaPostResponse = { Status?: string; PostOffice?: PostOffice[] | null }[];

export const PIN_RE = /^\d{6}$/;

/**
 * India Post's state spellings that differ from the dropdown's. Anything not
 * listed is matched case-insensitively against INDIAN_STATES.
 */
const STATE_ALIASES: Record<string, string> = {
  chattisgarh: "Chhattisgarh",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  "jammu & kashmir": "Jammu and Kashmir",
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "dadra & nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "the dadra and nagar haveli and daman and diu":
    "Dadra and Nagar Haveli and Daman and Diu",
  "nct of delhi": "Delhi",
  "new delhi": "Delhi",
};

/** Map any spelling of a state onto the dropdown's value, or "" if unknown. */
export function canonicalState(raw: string | null | undefined): string {
  const key = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "";
  const alias = STATE_ALIASES[key];
  if (alias) return alias;
  return INDIAN_STATES.find((s) => s.toLowerCase() === key) ?? "";
}

/**
 * India Post's districts are administrative, not postal: a Delhi PIN comes back
 * as "Central Delhi" / "South West Delhi", which is not what anyone writes as
 * their city. Anything in Delhi is New Delhi for a billing address. Suffixes
 * like "Raigarh(MH)" lose their disambiguator.
 */
function cityFromDistrict(district: string, state: string): string {
  const clean = district.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (state === "Delhi") return "New Delhi";
  return clean;
}

/** Pure: pick city + state out of an India Post response. Null when nothing usable. */
export function parsePincodeResponse(
  pin: string,
  body: unknown,
): PincodePlace | null {
  if (!Array.isArray(body)) return null;
  const first = (body as IndiaPostResponse)[0];
  if (!first || first.Status !== "Success" || !Array.isArray(first.PostOffice)) {
    return null;
  }
  const districts = new Map<string, number>();
  const states = new Map<string, number>();
  for (const po of first.PostOffice) {
    const state = canonicalState(po.State);
    if (!state) continue;
    states.set(state, (states.get(state) ?? 0) + 1);
    const district = (po.District ?? "").trim();
    if (district) districts.set(district, (districts.get(district) ?? 0) + 1);
  }
  const state = mostCommon(states);
  if (!state) return null;
  const district = mostCommon(districts);
  return { pin, state, city: district ? cityFromDistrict(district, state) : "" };
}

function mostCommon(counts: Map<string, number>): string {
  let best = "";
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

const cache = new Map<string, { at: number; place: PincodePlace | null }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5_000;

/**
 * Live lookup with a 4s ceiling. A PIN directory that is slow or down must not
 * hold the checkout — the caller treats null as "type it yourself", nothing more.
 */
export async function lookupPincode(pin: string): Promise<PincodePlace | null> {
  if (!PIN_RE.test(pin)) return null;
  const hit = cache.get(pin);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.place;

  let place: PincodePlace | null = null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      signal: AbortSignal.timeout(4_000),
      headers: { accept: "application/json" },
    });
    if (res.ok) place = parsePincodeResponse(pin, await res.json());
  } catch (err) {
    console.warn(`[pincode] lookup failed for ${pin}:`, (err as Error).message);
    return null; // transient — don't cache a failure
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(pin, { at: Date.now(), place });
  return place;
}
