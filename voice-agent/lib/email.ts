// Transactional email for the dashboard — Resend's REST API over raw fetch,
// the same pattern (and the same Resend account) as the main site's
// src/lib/email.ts. SERVER ONLY.
//
// Unlike the main site, a missing key here is NOT a silent no-op: the only mail
// this app sends is a password-reset link, and swallowing that failure would
// leave someone staring at "check your inbox" forever. sendEmail() throws, and
// /api/auth/reset/request refuses up front when the key is absent.

const API_KEY = process.env.RESEND_API_KEY ?? "";
/** Resend requires a verified domain; onboarding@resend.dev works for testing. */
const FROM = process.env.EMAIL_FROM || "Rise & Shine Travels <onboarding@resend.dev>";

export const emailConfigured = Boolean(API_KEY);

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!emailConfigured) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [args.to], subject: args.subject, html: args.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend refused the send (${res.status}): ${body.slice(0, 300)}`);
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The reset email. Deliberately plain: no images, no tracking, one link, and
 * the URL repeated as text so a client that strips anchors is still usable.
 */
export function resetEmailHtml(link: string, minutes: number): string {
  const safe = esc(link);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#12223a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7a8699">Rise &amp; Shine Travels</p>
    <h1 style="margin:0 0 16px;font-size:20px">Reset your dashboard password</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
      Someone asked to reset the password for this admin dashboard account.
      The link below works once and expires in ${minutes} minutes.
    </p>
    <p style="margin:0 0 20px">
      <a href="${safe}" style="display:inline-block;background:#12223a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">Choose a new password</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#5b6779;word-break:break-all">
      Or paste this into your browser:<br>${safe}
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#5b6779">
      If you did not ask for this, ignore this email — your password stays as it is.
    </p>
  </div>
</body></html>`;
}
