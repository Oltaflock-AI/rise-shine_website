import { quoteFare } from "@/lib/tbo-book";
import { tooMany } from "@/lib/rate-limit";
import { logViewerActivity } from "@/lib/activity";

// Live TBO pricing — never cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/quote — re-price a searched fare and report what TBO requires for it.
 *
 * The checkout form calls this first so it can ask for exactly the fields TBO's
 * FareQuote response demands (PAN / passport / GST / mandatory seat + meal), instead
 * of guessing — this is TBO's PAN & Passport validation checkpoint.
 */
export async function POST(req: Request) {
  const limited = tooMany(req, "quote", 15);
  if (limited) return limited;

  let body: { traceId?: string; searchedAt?: number; resultIndex?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.traceId || !body.resultIndex) {
    return Response.json({ ok: false, error: 'Missing "traceId" or "resultIndex".' }, { status: 400 });
  }

  const result = await quoteFare({
    traceId: body.traceId,
    searchedAt: body.searchedAt ?? Date.now(),
    resultIndex: body.resultIndex,
  });
  // The checkout form's first call — the closest thing to "started checkout".
  if (result.ok) {
    await logViewerActivity("checkout_started", { kind: "flight", amountInr: result.publishedFare });
  }
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
