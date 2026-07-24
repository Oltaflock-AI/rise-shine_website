import "server-only";

/**
 * In-memory, per-IP rate limiting for the expensive public API routes (TBO
 * search/quote calls burn supplier quota; Places lookups cost money).
 *
 * Fixed-window counters per (route, ip). State lives in the function instance —
 * with Fluid Compute instances are reused across requests, so this genuinely
 * throttles bursts and scrapers, but it is NOT a distributed limiter: a fleet
 * of cold instances each gets its own window. Good enough as an abuse brake;
 * swap the Map for Redis/KV if hard guarantees are ever needed.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5_000;

function sweep(now: number): void {
  if (buckets.size < MAX_KEYS) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count <= limit) return { ok: true, retryAfterSec: 0 };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

/** Best client identity we have behind Vercel's proxy: first x-forwarded-for hop. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Standard 429 guard for a route handler; returns a Response to send, or null to proceed. */
export function tooMany(
  req: Request,
  route: string,
  limit: number,
  windowMs = 60_000,
): Response | null {
  const r = rateLimit(`${route}:${clientIp(req)}`, limit, windowMs);
  if (r.ok) return null;
  return Response.json(
    { ok: false, error: "Too many requests — please slow down and try again." },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
  );
}
