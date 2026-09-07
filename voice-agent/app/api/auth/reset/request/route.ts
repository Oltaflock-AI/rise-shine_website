import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, normaliseEmail } from "@/lib/access";
import { requestMeta } from "@/lib/dashboard-auth";
import { emailConfigured, resetEmailHtml, sendEmail } from "@/lib/email";
import { issueReset, logResetEvent, resetLink, resetTtlMinutes } from "@/lib/dashboard-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ask for a reset link.
//
// The answer is the SAME whether or not the address has an account: anything
// else turns this form into an account-enumeration oracle, which is exactly what
// the shared "Wrong email or password" message on sign-in exists to prevent. A
// send that fails is logged server-side and still answers ok — an inbox that
// bounces is not the visitor's problem to debug, and reporting it would leak
// that the account exists.
const SENT = "If that address has an account, a reset link is on its way.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normaliseEmail(typeof body?.email === "string" ? body.email : "");
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  }
  // Without a mailer there is no link to send, and pretending otherwise leaves
  // someone waiting on mail that will never arrive.
  if (!emailConfigured) {
    return NextResponse.json(
      { error: "Password reset email is not configured on this dashboard. Ask an admin to reset it for you." },
      { status: 503 },
    );
  }

  const meta = requestMeta(req.headers);
  const issued = await issueReset(email, meta);
  if (!issued.issued) return NextResponse.json({ ok: true, message: SENT });

  try {
    const minutes = resetTtlMinutes();
    await sendEmail({
      to: email,
      subject: "Reset your Rise & Shine dashboard password",
      html: resetEmailHtml(resetLink(issued.token), minutes),
    });
    await logResetEvent(email, "reset_requested", meta);
  } catch (err) {
    console.error("password reset email failed", err);
  }
  return NextResponse.json({ ok: true, message: SENT });
}
