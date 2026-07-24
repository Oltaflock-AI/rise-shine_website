import { searchCities } from "@/lib/hotel-city-search";
import { POPULAR_CITIES } from "@/data/hotel-cities";
import { tooMany } from "@/lib/rate-limit";

// Static dataset lookup — CDN-cacheable per query.
export const runtime = "nodejs";

/**
 * GET /api/hotels/cities?q=goa — hotel destination autocomplete.
 * Empty/short q returns the popular list (used as the default suggestions).
 */
export async function GET(req: Request) {
  const limited = tooMany(req, "cities", 60);
  if (limited) return limited;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const cities = q.trim().length >= 2 ? searchCities(q, 12) : POPULAR_CITIES;
  return Response.json(
    { ok: true, cities },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
