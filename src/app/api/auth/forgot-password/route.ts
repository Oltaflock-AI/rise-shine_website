import { mintAuthLink, siteOrigin } from "@/lib/auth-links";
import { emailConfigured, passwordResetEmail, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Simple in-memory throttle.
 *
 * This route is unauthenticated by necessity — someone who cannot log in is the
 * only person who needs it — which makes it the one place on the site where an
 * anonymous caller can cause mail to be sent to a third party. Unthrottled, it
 * is a free mailbomb aimed at anyone with an account, sent from the domain that
 * also carries the company's inbox.
 *
 * Per-instance and lost on redeploy, which is a real limitation: Vercel runs
 * several instances, so the effective ceiling is this times the instance count.
 * It stops the trivial loop from one client, which is the actual threat here;
 * anything more determined needs a shared store, and that is worth adding the
 * day this route sees real traffic.
 */
const ATTEMPTS = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 4;

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
 * POST /api/auth/forgot-password — body { email }.
 *
 * ALWAYS returns the same success shape, whether or not the address has an
 * account, whether or not the mail sent, and whether or not the caller was
 * throttled. Any difference — a different message, a different status, even a
 * noticeably different response time — turns this into an oracle for testing
 * which of a list of addresses are registered customers.
 *
 * Supabase's own `resetPasswordForEmail()` is deliberately NOT used: it would
 * send through Supabase's shared, rate-limited mailer with its own template.
 * We mint the token and send it ourselves through Resend.
 */
export async function POST(req: Request) {
  const ok = () => Response.json({ ok: true });

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return ok();
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) return ok();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (throttled(`${ip}:${email}`) || throttled(ip)) return ok();
  if (!emailConfigured) return ok();

  try {
    const link = await mintAuthLink({
      type: "recovery",
      email,
      next: "/reset-password",
      origin: siteOrigin(req),
    });
    // No account for this address. Say nothing, send nothing.
    if (!link?.userExists || !link.url) return ok();

    const { subject, html } = passwordResetEmail({ resetUrl: link.url });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    // Logged for us, invisible to the caller — an error here must not reveal
    // that the address exists.
    console.error("[forgot-password]", err);
  }

  return ok();
}
