import { getUser } from "@/lib/supabase/server";
import { emailConfigured, sendEmail, welcomeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/welcome — send the one-time welcome email after signup.
 *
 * Takes NO body. The address comes from the caller's own verified session, not
 * from the request: a route that emails whatever address it is handed is an
 * open relay, and it would be sending from a domain that also carries the
 * company's inbox. The blast radius of getting that wrong is the agency's own
 * email reputation, so the address is never client-supplied.
 *
 * Best-effort by contract, like every other send in lib/email.ts — a failed
 * welcome must never surface as a failed signup. The client fires it and
 * ignores the outcome.
 *
 * Not idempotent on its own: it sends whenever it is called. The single call
 * site is the signup success path, and the cost of a rare duplicate is one
 * extra email, which is cheaper than tracking sent-state for a courtesy note.
 */
export async function POST() {
  const user = await getUser().catch(() => null);
  // No session means "Confirm email" is ON in Supabase and the account is not
  // usable yet. Supabase's own confirmation mail is the right email at that
  // moment; welcoming someone to an account they cannot open would be noise.
  if (!user) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!emailConfigured || !user.email) return Response.json({ ok: true, sent: false });

  const meta = (user.user_metadata ?? {}) as { full_name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : "";

  try {
    const { subject, html } = welcomeEmail({ name, email: user.email });
    await sendEmail({ to: user.email, subject, html });
    return Response.json({ ok: true, sent: true });
  } catch (err) {
    console.error("[welcome-email]", err);
    return Response.json({ ok: false, sent: false }, { status: 200 });
  }
}
