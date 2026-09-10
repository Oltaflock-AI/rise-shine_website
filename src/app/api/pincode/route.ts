import { lookupPincode, PIN_RE } from "@/lib/pincode";
import { tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pincode?pin=380015 — city + state for an Indian PIN code, from India
 * Post's directory. The checkout calls this to prefill the billing address; a
 * miss returns `{ ok: true, place: null }` and the guest simply types it.
 */
export async function GET(req: Request) {
  const limited = tooMany(req, "pincode", 30);
  if (limited) return limited;

  const pin = new URL(req.url).searchParams.get("pin")?.trim() ?? "";
  if (!PIN_RE.test(pin)) {
    return Response.json(
      { ok: false, error: "An Indian PIN code is exactly 6 digits." },
      { status: 400 },
    );
  }
  const place = await lookupPincode(pin);
  return Response.json(
    { ok: true, place },
    // Postal geography changes slowly; let the CDN absorb repeat lookups.
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
