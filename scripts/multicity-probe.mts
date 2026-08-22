/**
 * Does TBO sell MULTI-CITY (JourneyType 3) on OUR credentials?
 *
 * The docs list five JourneyTypes (1 OneWay · 2 Return · 3 MultiStop ·
 * 4 AdvanceSearch · 5 SpecialReturn) but the app only ever sends 1/2/5, so
 * nothing here proves 3 is enabled for this agency. TBO answers a disabled or
 * malformed search with HTTP 200 + its own Error object, so a live call is the
 * only honest test.
 *
 * Usage: npx tsx --conditions=react-server scripts/multicity-probe.mts
 */
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const { getAuthToken, defaultDates } = await import("../src/lib/tbo");
const { tboFetch } = await import("../src/lib/tbo-fetch");

const SEARCH_SVC = (
  process.env.TBO_SEARCH_URL ||
  "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest"
).replace(/\/+$/, "");

const token = await getAuthToken();
if (!token) {
  console.error("Authenticate failed — cannot probe.");
  process.exit(1);
}

const { departISO } = defaultDates();
const plus = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const seg = (from: string, to: string, date: string) => ({
  Origin: from,
  Destination: to,
  FlightCabinClass: "1",
  PreferredDepartureTime: `${date}T00:00:00`,
  PreferredArrivalTime: `${date}T00:00:00`,
});

async function search(label: string, journeyType: string, segments: unknown[]) {
  const res = await tboFetch(`${SEARCH_SVC}/Search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      EndUserIp: process.env.TBO_END_USER_IP || "127.0.0.1",
      TokenId: token,
      AdultCount: "1",
      ChildCount: "0",
      InfantCount: "0",
      DirectFlight: "false",
      OneStopFlight: "false",
      JourneyType: journeyType,
      PreferredAirlines: null,
      Segments: segments,
      Sources: null,
    }),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(`\n${label}: HTTP ${res.status} non-JSON →`, text.slice(0, 300));
    return;
  }
  const r = json?.Response;
  const err = r?.Error;
  const results: unknown[][] = r?.Results ?? [];
  console.log(
    `\n${label}: HTTP ${res.status} · ResponseStatus ${r?.ResponseStatus} · Error ${err?.ErrorCode} "${err?.ErrorMessage}"`,
  );
  console.log(
    `  TraceId ${r?.TraceId ?? "—"} · Results groups: ${results.length} · sizes [${results
      .map((g) => g?.length ?? 0)
      .join(", ")}]`,
  );
  // A real multi-city answer carries one result GROUP per requested segment.
  results.slice(0, 4).forEach((g, i) => {
    const first: any = g?.[0];
    if (!first) return;
    const segs = first.Segments?.[0] ?? [];
    const route = segs
      .map((s: any) => `${s.Origin?.Airport?.AirportCode}→${s.Destination?.Airport?.AirportCode}`)
      .join(" ");
    console.log(
      `  group ${i}: ${g.length} results · e.g. ${first.AirlineCode ?? ""} ${route} · ₹${first.Fare?.PublishedFare} · IsLCC ${first.IsLCC}`,
    );
  });
}

const d1 = plus(departISO, 7);
const d2 = plus(departISO, 10);
const d3 = plus(departISO, 14);

// 1. Three-leg domestic multi-city.
await search("MultiStop 3 legs (DEL→BOM→BLR→DEL)", "3", [
  seg("DEL", "BOM", d1),
  seg("BOM", "BLR", d2),
  seg("BLR", "DEL", d3),
]);

// 2. Two-leg open-jaw — the shape a return search CANNOT express.
await search("MultiStop open-jaw (DEL→BOM, BLR→DEL)", "3", [
  seg("DEL", "BOM", d1),
  seg("BLR", "DEL", d2),
]);

// 3. International multi-city, in case the domestic supplier set differs.
await search("MultiStop intl (BOM→DXB→SIN→BOM)", "3", [
  seg("BOM", "DXB", d1),
  seg("DXB", "SIN", d2),
  seg("SIN", "BOM", d3),
]);

// 4. Control: the same 3 legs sent as JourneyType 1, to tell "MultiStop works"
//    apart from "TBO ignores JourneyType and reads Segments".
await search("Control: same 3 legs as JourneyType 1", "1", [
  seg("DEL", "BOM", d1),
  seg("BOM", "BLR", d2),
  seg("BLR", "DEL", d3),
]);

// 5. JourneyType 4 (AdvanceSearch) — documented, never used here.
await search("AdvanceSearch (4), 3 legs", "4", [
  seg("DEL", "BOM", d1),
  seg("BOM", "BLR", d2),
  seg("BLR", "DEL", d3),
]);

// 6. Shape check: does ONE multi-city result carry ALL the requested legs
//    (a single through-fare) or only the first?
{
  const res = await tboFetch(`${SEARCH_SVC}/Search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      EndUserIp: process.env.TBO_END_USER_IP || "127.0.0.1",
      TokenId: token,
      AdultCount: "1",
      ChildCount: "0",
      InfantCount: "0",
      DirectFlight: "false",
      OneStopFlight: "false",
      JourneyType: "3",
      PreferredAirlines: null,
      Segments: [seg("DEL", "BOM", d1), seg("BOM", "BLR", d2), seg("BLR", "DEL", d3)],
      Sources: null,
    }),
  });
  const json: any = JSON.parse(await res.text());
  const results: any[][] = json?.Response?.Results ?? [];
  const sample = results[0]?.slice(0, 3) ?? [];
  sample.forEach((r: any, i: number) => {
    console.log(`\nsample ${i}: ResultIndex ${String(r.ResultIndex).slice(0, 40)}`);
    console.log(
      `  IsLCC ${r.IsLCC} · Source ${r.Source} · PublishedFare ₹${r.Fare?.PublishedFare} · OfferedFare ₹${r.Fare?.OfferedFare}`,
    );
    console.log(`  Segments groups: ${r.Segments?.length}`);
    (r.Segments ?? []).forEach((grp: any[], g: number) => {
      console.log(
        `    leg ${g}: ` +
          grp
            .map(
              (s: any) =>
                `${s.Airline?.AirlineCode}${s.Airline?.FlightNumber} ${s.Origin?.Airport?.AirportCode}→${s.Destination?.Airport?.AirportCode} ${String(s.Origin?.DepTime).slice(0, 16)}`,
            )
            .join(" | "),
      );
    });
    console.log(`  FareBreakdown rows: ${r.FareBreakdown?.length}`);
  });
}
