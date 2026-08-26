import { unsubscribeByToken } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/marketing/unsubscribe?t=… — the one-click endpoint named by the
 * `List-Unsubscribe` header (RFC 8058).
 *
 * Gmail and Yahoo call this THEMSELVES when a recipient hits their unsubscribe
 * button, with no browser and no confirmation step, so it must:
 *  • act on POST alone, with no login, no CSRF token and no interstitial;
 *  • answer 200 even for an unknown token, because a non-2xx makes the client
 *    show the recipient a failure for something we have no way to fix, and
 *    repeated failures count against the sending domain.
 *
 * The token is the only credential, which is why it is a random uuid rather
 * than anything derived from the address.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  await unsubscribeByToken(token).catch(() => false);
  return new Response(null, { status: 200 });
}
