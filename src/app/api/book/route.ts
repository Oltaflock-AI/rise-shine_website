import { bookFlight, type BookingRequest } from "@/lib/tbo-book";
import { normalizeTitle, type PaxType } from "@/lib/tbo-validate";

// Live TBO booking calls — never cached, and Book/Ticket can run to 300s.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Incoming = {
  traceId?: string;
  searchedAt?: number;
  resultIndex?: string;
  isLCC?: boolean;
  airlineCode?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departDate?: string;
  isInternational?: boolean;
  passengers?: Array<Record<string, unknown>>;
  gst?: BookingRequest["gst"];
};

/**
 * POST /api/book — run TBO's booking flow for a searched fare.
 *
 * The heavy lifting (and every checklist validation) is in lib/tbo-book +
 * lib/tbo-validate; this handler only shapes the request and normalizes titles,
 * since TBO rejects "Master"/"Miss" outright.
 */
export async function POST(req: Request) {
  let body: Incoming;
  try {
    body = (await req.json()) as Incoming;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const required = ["traceId", "resultIndex", "origin", "destination", "departDate"] as const;
  for (const k of required) {
    if (!body[k]) return Response.json({ ok: false, error: `Missing "${k}".` }, { status: 400 });
  }
  if (!body.passengers?.length) {
    return Response.json({ ok: false, error: "At least one passenger is required." }, { status: 400 });
  }

  const passengers = body.passengers.map((p) => {
    const paxType = (Number(p.PaxType) || 1) as PaxType;
    const gender = (Number(p.Gender) === 2 ? 2 : 1) as 1 | 2;
    return {
      ...p,
      PaxType: paxType,
      Gender: gender,
      Title: normalizeTitle(String(p.Title ?? ""), paxType, gender),
    };
  }) as BookingRequest["passengers"];

  const result = await bookFlight({
    traceId: body.traceId!,
    searchedAt: body.searchedAt ?? Date.now(),
    resultIndex: body.resultIndex!,
    isLCC: Boolean(body.isLCC),
    airlineCode: (body.airlineCode ?? "").toUpperCase(),
    flightNumber: body.flightNumber ?? "",
    origin: body.origin!.toUpperCase(),
    destination: body.destination!.toUpperCase(),
    departDate: body.departDate!,
    isInternational: Boolean(body.isInternational),
    passengers,
    gst: body.gst,
  });

  // A failed validation is the caller's fault (422); a held/failed booking is not (200/502).
  const status = result.ok ? 200 : result.rule ? 422 : 502;
  return Response.json(result, { status });
}
