import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { emailConfigured, sendEmail, welcomeEmail } from "@/lib/email";
import { subscribeContact } from "@/lib/marketing";

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
 *
 * For a `signup` redemption this is also the moment the address becomes PROVEN,
 * so it is where the welcome email is sent and where the marketing opt-in is
 * finally written. Neither may happen at signup: until this point all anyone has
 * done is type an address into a form, and acting on it would let a stranger
 * subscribe someone else to the offers list, or make us mail a person who never
 * asked for anything.
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

  if (type === "signup") await onSignupConfirmed(supabase);

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Everything that waits on a confirmed address. Best-effort throughout: the
 * account is confirmed either way, and a failed courtesy email must never turn
 * a successful confirmation into an error page the customer cannot get past.
 */
async function onSignupConfirmed(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; marketing_opt_in?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : "";

  if (meta.marketing_opt_in === true) {
    await subscribeContact({ email: user.email, name, source: "signup" }).catch((err) =>
      console.error("[confirm] opt-in", err),
    );
  }

  if (emailConfigured) {
    try {
      const { subject, html } = welcomeEmail({ name, email: user.email });
      await sendEmail({ to: user.email, subject, html });
    } catch (err) {
      console.error("[confirm] welcome email", err);
    }
  }
}
