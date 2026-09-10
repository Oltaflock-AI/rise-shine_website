/**
 * The kill switch. `BOOKING_PAUSED` in the environment stops online booking
 * for one product or both, with a plain "call us" instead of a raw supplier
 * error. For when TBO, the proxy or Cashfree is down and the healthcheck has
 * said so: customers see one honest sentence and the phone number, not a
 * spinner that ends in "Could not start payment".
 *
 *   BOOKING_PAUSED=flights          flights only
 *   BOOKING_PAUSED=hotels           hotels only
 *   BOOKING_PAUSED=flights,hotels   both  (or `all`)
 *   BOOKING_PAUSED_MESSAGE=...      optional one-liner shown with the notice
 *
 * It is an environment variable, not a database flag, on purpose: an outage
 * that took Supabase with it must not also take the switch. Flipping it is a
 * Vercel env edit + redeploy (~2 min). Search still works while paused —
 * only the order and book routes refuse, and the pages say why.
 *
 * Pure over an env-shaped record so the parsing is testable.
 */

export type PausableProduct = "flight" | "hotel";

export function pausedProducts(env: Record<string, string | undefined> = process.env): Set<PausableProduct> {
  const raw = (env.BOOKING_PAUSED ?? "").toLowerCase();
  const out = new Set<PausableProduct>();
  if (!raw.trim()) return out;
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  if (parts.includes("all") || parts.includes("true") || parts.includes("1")) {
    out.add("flight").add("hotel");
    return out;
  }
  for (const p of parts) {
    if (p === "flight" || p === "flights") out.add("flight");
    if (p === "hotel" || p === "hotels") out.add("hotel");
  }
  return out;
}

export function bookingPaused(kind: PausableProduct, env: Record<string, string | undefined> = process.env): boolean {
  return pausedProducts(env).has(kind);
}

/** The sentence the customer reads. Owner-supplied when set, otherwise a safe default. */
export function pausedMessage(kind: PausableProduct, env: Record<string, string | undefined> = process.env): string {
  const custom = env.BOOKING_PAUSED_MESSAGE?.trim();
  if (custom) return custom;
  return kind === "flight"
    ? "Online flight booking is paused for a short while. Call us and we will ticket it for you at the same fare."
    : "Online hotel booking is paused for a short while. Call us and we will confirm the room for you.";
}

/** The 503 body every paused route answers with. `paused` lets the client word it right. */
export function pausedResponse(kind: PausableProduct): Response {
  return Response.json({ ok: false, paused: true, error: pausedMessage(kind) }, { status: 503 });
}
