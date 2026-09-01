import { tooMany } from "@/lib/rate-limit";
import { tboHotelIsLive } from "@/lib/tbo-env";
import {
  TBO_VERIFICATION_COOKIE,
  TBO_VERIFICATION_MAX_AGE,
  tboVerificationConfigured,
  tokenMatches,
} from "@/lib/tbo-verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/hotels/verification?token=… — open a no-payment booking session for
 * TBO's portal verifier. `?clear=1` closes it.
 *
 * See `lib/tbo-verification.ts` for why this exists and why it cannot leak live
 * inventory: the session only ever applies while the hotel services are on TBO's
 * certification hosts.
 */
export async function GET(req: Request) {
  const limited = tooMany(req, "hotel-verification", 10);
  if (limited) return limited;

  const url = new URL(req.url);

  if (url.searchParams.get("clear")) {
    return page("Verification session closed.", "This browser will be asked to pay again.", {
      "Set-Cookie": cookie("", 0),
    });
  }

  const token = url.searchParams.get("token") ?? "";
  // Same answer for "no token configured", "wrong token" and "no token given" —
  // a probe learns nothing about whether the feature exists.
  if (!tboVerificationConfigured || !token || !tokenMatches(token)) {
    return new Response("Not found", { status: 404 });
  }

  if (tboHotelIsLive()) {
    return page(
      "Not available.",
      "The hotel services are on live TBO credentials, where every booking holds a real room. Bookings must be paid for.",
    );
  }

  console.info("[api/hotels/verification] TBO verification session opened (certification hosts).");
  return page(
    "Verification session open.",
    "Search a hotel and book as normal — this browser will not be asked to pay. Valid 30 days on this browser.",
    { "Set-Cookie": cookie(token, TBO_VERIFICATION_MAX_AGE) },
  );
}

function cookie(value: string, maxAge: number): string {
  return [
    `${TBO_VERIFICATION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/** A plain confirmation the verifier can read — no app chrome, no client JS. */
function page(title: string, body: string, headers: Record<string, string> = {}): Response {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Rise &amp; Shine Travels</title>` +
      `<body style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#1a1a1a">` +
      `<h1 style="font-size:1.25rem;margin:0 0 .5rem">${esc(title)}</h1>` +
      `<p style="margin:0 0 1.5rem;color:#555">${esc(body)}</p>` +
      `<p><a href="/hotels" style="color:#c8102e;font-weight:600">Go to hotel search →</a></p>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...headers } },
  );
}
