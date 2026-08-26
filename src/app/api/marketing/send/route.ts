import { emailConfigured, offerEmail, sendEmail, type OfferItem } from "@/lib/email";
import { subscribedContacts, unsubscribeUrl, marketingConfigured } from "@/lib/marketing";
import { siteOrigin } from "@/lib/auth-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/marketing/send — send one offer campaign to everyone subscribed.
 *
 * Authorised with `Authorization: Bearer $CRON_SECRET`, the same secret the
 * reconcile and callback-queue jobs use. There is no admin UI: this is a route
 * you call deliberately, and the thing it does — mail every customer at once —
 * is not something that should ever be one mis-click away in a dashboard.
 *
 * Body: { headline, intro, items[], validUntil?, testTo? }
 *
 * `testTo` sends the campaign to that one address INSTEAD of the list. Always
 * do that first. There is no recall on an email campaign; a typo in a fare
 * reaches every customer permanently.
 *
 * Two things this route will not do:
 *  • send to an address that is not in `marketing_contacts` with subscribed =
 *    true (except `testTo`, which is you);
 *  • send without a per-contact unsubscribe token in both the footer and the
 *    List-Unsubscribe header.
 *
 * Failures are counted, not thrown. One bad address must not halt a campaign
 * half-sent, which would leave no safe way to retry — the remainder would get
 * a second copy.
 */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured || !marketingConfigured) {
    return Response.json({ ok: false, error: "Email or Supabase is not configured." }, { status: 503 });
  }

  let body: {
    headline?: string;
    intro?: string;
    items?: OfferItem[];
    validUntil?: string;
    testTo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { headline, intro, items, validUntil, testTo } = body;
  if (!headline || !intro || !Array.isArray(items) || items.length === 0) {
    return Response.json(
      { ok: false, error: "headline, intro and at least one item are required." },
      { status: 400 },
    );
  }

  const origin = siteOrigin(req);
  const recipients = testTo
    ? [{ email: testTo, name: null, token: "preview-token" }]
    : await subscribedContacts();

  let sent = 0;
  const failed: string[] = [];

  for (const contact of recipients) {
    const unsub = unsubscribeUrl(contact.token, origin);
    const { subject, html } = offerEmail({
      headline,
      intro,
      items,
      validUntil,
      name: contact.name ?? undefined,
      unsubscribeUrl: unsub,
    });

    try {
      await sendEmail({
        to: contact.email,
        subject,
        html,
        headers: {
          // Both forms: the URL for clients that open a page, and the RFC 8058
          // one-click POST that Gmail and Yahoo call without a browser.
          "List-Unsubscribe": `<${origin}/api/marketing/unsubscribe?t=${contact.token}>, <${unsub}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      sent += 1;
    } catch (err) {
      failed.push(contact.email);
      console.error("[campaign]", contact.email, err);
    }

    // Resend's default rate limit is a couple of requests a second. Pacing here
    // is cheaper than handling 429s, and a campaign has no deadline.
    if (!testTo) await new Promise((r) => setTimeout(r, 550));
  }

  return Response.json({
    ok: true,
    test: Boolean(testTo),
    recipients: recipients.length,
    sent,
    failed: failed.length,
    failedAddresses: failed.slice(0, 20),
  });
}
