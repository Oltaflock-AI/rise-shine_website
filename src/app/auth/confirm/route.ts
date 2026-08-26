import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Only the types we actually mint — an arbitrary `type` is not passed through. */
const ALLOWED: ReadonlySet<string> = new Set(["recovery", "signup", "magiclink", "email_change"]);

/**
 * GET /auth/confirm — redeem a link minted by `lib/auth-links.ts`.
 *
 * Sibling to `/auth/callback`, and not a replacement for it: callback exchanges
 * a PKCE `code` (OAuth, and Supabase's own emails if they are ever re-enabled),
 * while this redeems a `token_hash` from an email WE sent. Splitting them keeps
 * either flow from silently swallowing the other's parameters.
 *
 * Redeeming sets the session cookie, which is what lets `/reset-password` know
 * the visitor proved control of the mailbox. The token is single-use: a second
 * click on the same link lands on /login with an error rather than a session.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") ?? "";
  const nextParam = searchParams.get("next") ?? "/account";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/account";

  if (!tokenHash || !ALLOWED.has(type) || !supabaseConfigured) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  // An expired or already-used link is the common case here, not an edge case —
  // people click yesterday's email. Say so rather than showing a blank login.
  if (error) return NextResponse.redirect(`${origin}/login?error=expired`);

  return NextResponse.redirect(`${origin}${next}`);
}
