import { hotelCodesByCity } from "@/lib/tbo-hotel-static";
import { POPULAR_CITIES } from "@/data/hotel-cities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 16 cities, each up to three ~5 s TBO attempts when TBO is having a bad night.
export const maxDuration = 300;

/**
 * GET /api/cron/hotel-static — refresh the stored hotel list of every popular city.
 *
 * Nightly (vercel.json, `Authorization: Bearer $CRON_SECRET`). TBO's static API
 * intermittently answers "No Hotels Found" for cities that have thousands of
 * hotels, so a search must never be the first thing to ask for a popular city's
 * list — see hotelCodesByCity. A city TBO fails on tonight keeps its previous
 * copy; nothing here ever replaces a good list with an empty one.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const results: Array<{ city: string; ok: boolean; hotels?: number; error?: string }> = [];
  // Sequential on purpose: this is a background refresh, and a burst of 16
  // parallel 1 MB static calls is the kind of load that makes TBO's API flaky.
  for (const c of POPULAR_CITIES) {
    try {
      const list = await hotelCodesByCity(c.cityCode, { refresh: true });
      results.push({ city: c.label, ok: true, hotels: list.length });
    } catch (e) {
      results.push({ city: c.label, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `[hotel-static] refreshed ${results.length - failed.length}/${results.length}` +
      (failed.length ? ` · failed: ${failed.map((f) => `${f.city} (${f.error})`).join(", ")}` : ""),
  );
  return Response.json({ ok: failed.length === 0, results });
}
