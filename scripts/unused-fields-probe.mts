/**
 * Which TBO fields do we receive and never read?
 *
 * Calls each live method, walks the RAW response for field NAMES, then greps
 * `src/` for each one. A name that appears nowhere in the code is data TBO is
 * sending us for free that no page can show. Sample values are printed so a
 * judgement about worth is possible without a second round-trip.
 *
 * Probe the RAW response, never our mapped shape — mapping is precisely what
 * drops fields, so a mapped object reports everything as used.
 *
 * Two known limits:
 *   - A grep cannot tell a read from a coincidence, so names too generic to
 *     mean anything are skipped (see AMBIGUOUS).
 *   - Objects keyed by DATA rather than by field — `Attractions` is
 *     `{ "1) ": "Dubai Creek" }` — report their keys as unreferenced. They are
 *     false positives; the values are read, the keys are not identifiers.
 *
 * Not covered here (each needs a real booking or a separate flow):
 * GetBookingDetails, Book/Ticket, FareRule, hotel cancellation, CountryList.
 *
 * Usage: npx tsx --conditions=react-server scripts/unused-fields-probe.mts
 */
import { execFileSync } from "node:child_process";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const { hotelCodesByCity, hotelDetails } =
  await import("../src/lib/tbo-hotel-static");
const { defaultDates } = await import("../src/lib/tbo");
const { tboFetch } = await import("../src/lib/tbo-fetch");
const { getAuthToken } = await import("../src/lib/tbo");

const iso = (d: number) =>
  new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

/** Every key name in a response, with one sample value each. */
function harvest(
  node: unknown,
  out = new Map<string, string>(),
  depth = 0,
): Map<string, string> {
  if (depth > 6 || node == null) return out;
  if (Array.isArray(node)) {
    for (const v of node.slice(0, 3)) harvest(v, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!out.has(k)) {
      const s =
        v == null
          ? "null"
          : Array.isArray(v)
            ? `[${v.length}] ${JSON.stringify(v[0] ?? "").slice(0, 60)}`
            : typeof v === "object"
              ? JSON.stringify(v).slice(0, 70)
              : JSON.stringify(v).slice(0, 70);
      out.set(k, s);
    }
    harvest(v, out, depth + 1);
  }
  return out;
}

/** Does this field name appear anywhere in src/ ? */
function usedInCode(name: string): boolean {
  try {
    execFileSync("grep", ["-rqE", `\\b${name}\\b`, "src"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Names too generic for a grep to mean anything. */
const AMBIGUOUS = new Set([
  "Error",
  "ErrorCode",
  "ErrorMessage",
  "Status",
  "Code",
  "Description",
  "Type",
  "Name",
  "Value",
  "Id",
  "Text",
  "Price",
  "Currency",
  "Address",
  "Email",
]);

function report(label: string, raw: unknown) {
  const keys = harvest(raw);
  const unused = [...keys].filter(([k]) => !AMBIGUOUS.has(k) && !usedInCode(k));
  console.log(
    `\n${"=".repeat(70)}\n${label} — ${keys.size} distinct fields, ${unused.length} unreferenced\n${"=".repeat(70)}`,
  );
  for (const [k, sample] of unused.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${k.padEnd(30)} ${sample}`);
  }
}

// ── hotels ───────────────────────────────────────────────────────────────────
const codes = (await hotelCodesByCity("115936")).map((h) => h.code);
const [detail] = await hotelDetails([codes[0]], { withRooms: true });
report("HotelDetails (static content)", detail);

// RAW, not our mapped shape — mapping is exactly what drops fields, so probing
// the mapped object would report everything as used.
const { bookingCall } = await import("../src/lib/tbo-hotel");
const rawSearch = await bookingCall<Record<string, unknown>>("Search", {
  CheckIn: iso(60),
  CheckOut: iso(62),
  HotelCodes: codes.slice(0, 20).join(","),
  GuestNationality: "IN",
  PaxRooms: [{ Adults: 2, Children: 0, ChildrenAges: [] }],
  ResponseTime: 23,
  IsDetailedResponse: true,
  Filters: { Refundable: false, NoOfRooms: 0, MealType: "All" },
});
report("Hotel Search (raw)", rawSearch);

const firstCode =
  (
    rawSearch.HotelResult as
      Array<{ Rooms?: Array<{ BookingCode?: string }> }> | undefined
  )?.[0]?.Rooms?.[0]?.BookingCode ?? "";
if (firstCode) {
  const rawPre = await bookingCall<Record<string, unknown>>("PreBook", {
    BookingCode: firstCode,
    PaymentMode: "Limit",
  });
  report("Hotel PreBook (raw)", rawPre);
}

// ── flights ──────────────────────────────────────────────────────────────────
const { departISO } = defaultDates();
const token = await getAuthToken();
const SEARCH = process.env.TBO_SEARCH_URL!.replace(/\/+$/, "");
const post = async (method: string, body: Record<string, unknown>) => {
  const r = await tboFetch(`${SEARCH}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      EndUserIp: process.env.TBO_END_USER_IP,
      TokenId: token,
      ...body,
    }),
  });
  return ((await r.json()) as { Response?: unknown }).Response;
};

const rawFlight = (await post("Search", {
  AdultCount: 1,
  ChildCount: 0,
  InfantCount: 0,
  JourneyType: 1,
  DirectFlight: false,
  OneStopFlight: false,
  PreferredAirlines: null,
  Segments: [
    {
      Origin: "DEL",
      Destination: "BOM",
      FlightCabinClass: 1,
      PreferredDepartureTime: `${departISO}T00:00:00`,
      PreferredArrivalTime: `${departISO}T00:00:00`,
    },
  ],
  Sources: null,
})) as { TraceId?: string; Results?: unknown[][] };
report("Flight Search (raw)", rawFlight);

const first = rawFlight?.Results?.[0]?.[0] as
  { ResultIndex?: string } | undefined;
if (first?.ResultIndex) {
  await post("FareRule", {
    TraceId: rawFlight!.TraceId,
    ResultIndex: first.ResultIndex,
  });
  const fqRes = await post("FareQuote", {
    TraceId: rawFlight!.TraceId,
    ResultIndex: first.ResultIndex,
  });
  report("Flight FareQuote (raw)", fqRes);
}
