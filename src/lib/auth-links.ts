import "server-only";

/**
 * Auth email links that WE mint and WE send.
 *
 * Supabase can email a confirmation or a reset itself, and we deliberately do
 * not let it. Two reasons, both practical:
 *
 * - Its built-in mailer is a shared, heavily rate-limited sender on a
 *   `supabase.io` address. A customer resetting a password at the wrong moment
 *   silently gets nothing, and the branded templates never appear.
 * - Its links are built from the project's configured Site URL, which is one
 *   value for every environment. On localhost you end up bounced to production,
 *   which makes the reset flow untestable exactly where you need to test it.
 *
 * `admin.generateLink()` mints the token WITHOUT sending anything — that is the
 * hook. We take `hashed_token`, build a URL on our own origin, and put it in a
 * Resend email. `/auth/confirm` then redeems it with `verifyOtp()`. Supabase's
 * mailer is never invoked, and the link always points at the host the request
 * came from.
 *
 * Requires the SERVICE ROLE key, so this is server-only and must never be
 * reachable from a route that takes an arbitrary email without a rate limit —
 * minting links is cheap, but sending mail to strangers is how a domain gets
 * blocked. See `/api/auth/forgot-password`.
 */

import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

export type AuthLinkType = "recovery" | "signup" | "magiclink" | "email_change_current";

/**
 * The origin to build links on.
 *
 * Taken from the incoming request, NOT from a fixed env var, so a link mailed
 * from localhost points at localhost and one mailed from production points at
 * production. `SITE_URL` overrides it for contexts with no request (a cron job,
 * a script) where the request origin would be wrong or absent.
 */
export function siteOrigin(req?: Request): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  if (req) return new URL(req.url).origin;
  return "https://www.riseandshinetravel.in";
}

export interface MintedLink {
  url: string;
  /** Present only when the address has an account; absent is not an error. */
  userExists: boolean;
}

/**
 * Mint a one-time auth link for `email`, or report that no account exists.
 *
 * Callers must treat "no account" as indistinguishable from success in anything
 * they return to the browser. Telling an anonymous caller whether an address is
 * registered turns the reset form into an account-enumeration oracle.
 */
export async function mintAuthLink(args: {
  type: AuthLinkType;
  email: string;
  /** Internal path to land on after the token is redeemed. */
  next: string;
  origin: string;
}): Promise<MintedLink | null> {
  if (!supabaseAdminConfigured) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: args.type,
    email: args.email,
    // Supabase still wants a redirectTo for its own link format. We never use
    // the link it returns — only `hashed_token` — but a value must be valid.
    options: { redirectTo: `${args.origin}${args.next}` },
  } as Parameters<typeof admin.auth.admin.generateLink>[0]);

  if (error || !data?.properties?.hashed_token) return { url: "", userExists: false };

  const url = new URL(`${args.origin}/auth/confirm`);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", args.type === "email_change_current" ? "email_change" : args.type);
  url.searchParams.set("next", args.next);
  return { url: url.toString(), userExists: true };
}
