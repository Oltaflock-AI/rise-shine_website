import { mintSignupLink, siteOrigin } from "@/lib/auth-links";
import { confirmSignupEmail, emailConfigured, sendEmail } from "@/lib/email";
import { isDiallableIndianNumber, normalisePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Same shape of throttle as /api/auth/forgot-password, and for the same reason:
 * this route sends mail to an address supplied by an anonymous caller. Here it
 * also CREATES a row in auth.users on each call, so an unthrottled loop fills
 * the project with junk accounts as well as mailing strangers.
 *
 * Per-instance and lost on redeploy — see the fuller note in forgot-password.
 */
const ATTEMPTS = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function throttled(key: string): boolean {
  const now = Date.now();
  const seen = ATTEMPTS.get(key);
  if (!seen || now - seen.first > WINDOW_MS) {
    ATTEMPTS.set(key, { count: 1, first: now });
    return false;
  }
  seen.count += 1;
  return seen.count > MAX_PER_WINDOW;
}

/**
 * POST /api/auth/signup — create an account and email its confirmation link.
 *
 * Replaces the browser's `supabase.auth.signUp()`. That call triggers Supabase's
 * own mailer, which is a shared rate-limited sender using an unbranded template,
 * and it returns no session while confirmation is pending — so the welcome email
 * and the marketing opt-in never fired. Here the link is minted with
 * `generateLink()`, which sends nothing, and we mail it through Resend.
 *
 * The opt-in is stored in `user_metadata` rather than written to
 * `marketing_contacts` now. Nothing may be added to the offers list before the
 * address is confirmed — otherwise anyone could subscribe anyone else by typing
 * their address into this form. `/auth/confirm` writes it once the address is
 * proven. Same reasoning for the welcome email.
 *
 * Unlike forgot-password, "already registered" IS reported. A reset form that
 * admits an address exists is an enumeration oracle; a signup form that hides it
 * cannot tell someone why their password was rejected, and every signup form
 * reveals this anyway by refusing the address.
 */
export async function POST(req: Request) {
  let body: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    password?: unknown;
    offers?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phone = normalisePhone(typeof body.phone === "string" ? body.phone : "");

  if (!name) return Response.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!email.includes("@"))
    return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  if (!isDiallableIndianNumber(phone))
    return Response.json(
      { ok: false, error: "Please enter a valid mobile number, e.g. 98765 43210." },
      { status: 400 },
    );
  if (password.length < 6)
    return Response.json(
      { ok: false, error: "Password must be at least 6 characters." },
      { status: 400 },
    );

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (throttled(ip)) {
    return Response.json(
      { ok: false, error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  try {
    const minted = await mintSignupLink({
      email,
      password,
      data: { full_name: name, phone, marketing_opt_in: body.offers === true },
      next: "/account",
      origin: siteOrigin(req),
    });

    if (minted && "alreadyRegistered" in minted) {
      return Response.json(
        { ok: false, error: "An account with this email already exists. Try logging in." },
        { status: 409 },
      );
    }
    if (!minted) {
      return Response.json(
        { ok: false, error: "Accounts aren't available just yet. Please call or WhatsApp us." },
        { status: 503 },
      );
    }

    if (emailConfigured) {
      const { subject, html } = confirmSignupEmail({ confirmUrl: minted.url, name });
      await sendEmail({ to: email, subject, html });
    }

    return Response.json({ ok: true, confirmationSent: emailConfigured });
  } catch (err) {
    console.error("[signup]", err);
    return Response.json(
      { ok: false, error: "We couldn't create that account. Please try again." },
      { status: 500 },
    );
  }
}
