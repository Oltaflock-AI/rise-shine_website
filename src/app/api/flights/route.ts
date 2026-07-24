import { searchFlights, defaultDates } from "@/lib/tbo";
import { resolveAirport } from "@/data/airports";
import { tooMany } from "@/lib/rate-limit";

// Live TBO calls — never statically cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/flights?from=AMD&to=GOI&depart=YYYY-MM-DD&return=YYYY-MM-DD&adults=1&trip=round&max=40
 * `from`/`to` accept an IATA code or a city/airport name (resolved server-side).
 * With no `depart`, defaults to ~30 days out (used by package "from" fares).
 */
export async function GET(req: Request) {
  const limited = tooMany(req, "flights", 20);
  if (limited) return limited;

  const q = new URL(req.url).searchParams;

  const from = resolveAirport(q.get("from") || "AMD")?.code || "AMD";
  const toRaw = q.get("to") || "";
  const to = resolveAirport(toRaw)?.code || toRaw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(to)) {
    return Response.json(
      { ok: false, source: "unavailable", error: "invalid destination" },
      { status: 400 },
    );
  }

  const adults = Math.min(9, Math.max(1, parseInt(q.get("adults") || "1", 10) || 1));
  const nights = Math.max(1, parseInt(q.get("nights") || "7", 10) || 7);
  const wantRound = q.get("trip") === "round" || !!q.get("return");
  const max = Math.min(60, Math.max(1, parseInt(q.get("max") || "40", 10) || 40));

  let departISO = q.get("depart") || "";
  let returnISO = q.get("return") || undefined;
  if (!departISO) {
    const d = defaultDates(nights);
    departISO = d.departISO;
    if (wantRound && !returnISO) returnISO = d.returnISO;
  } else if (wantRound && !returnISO) {
    const dd = new Date(departISO);
    dd.setDate(dd.getDate() + nights);
    returnISO = dd.toISOString().slice(0, 10);
  }

  const res = await searchFlights({ from, to, departISO, returnISO, adults });

  // Trim large fare lists before returning to the client.
  const trimmed = {
    ...res,
    outbound: res.outbound.slice(0, max),
    inbound: res.inbound?.slice(0, max),
  };

  return Response.json(trimmed, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=600",
    },
  });
}
