// Transactional email for the dashboard — Resend's REST API over raw fetch,
// the same account and the same pattern as the main site's src/lib/email.ts.
// SERVER ONLY.
//
// Unlike the main site, a missing key here is NOT a silent no-op: the only mail
// this app sends is a password-reset link, and swallowing that failure would
// leave someone staring at "check your inbox" forever. sendEmail() throws, and
// /api/auth/reset/request refuses up front when the key is absent.
//
// EMAIL_FROM must be on a Resend-VERIFIED domain. That is riseandshinetravel
// .com — the .in host serves the site and the logo but is not the mail domain,
// and sending from an unverified one is refused by Resend outright.

import { C, FONT, button, callout, esc, heading, paragraph, shell } from "./email-brand";

const API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.EMAIL_FROM || "Rise & Shine Travels <info@riseandshinetravel.com>";

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

export const RESET_SUBJECT = "Reset your Rise & Shine dashboard password";

/**
 * The reset email.
 *
 * The link appears twice on purpose — as the brand button, and as plain text
 * underneath. A reset is the one email that is worthless if its single link
 * fails to render, and some corporate clients strip anchors or rewrite them
 * through a scanner that mangles the query string. The URL is escaped both
 * times: the token is base64url, so it cannot contain a quote, but the escaping
 * is what makes that true by construction rather than by luck.
 *
 * The address is shown so the recipient can tell whose account the link opens —
 * several staff share this inbox pattern — and it is escaped like everything
 * else even though it came out of our own database.
 */
export function resetEmailHtml(args: { link: string; minutes: number; email: string }): string {
  const href = esc(args.link);
  const body = [
    heading("Reset your dashboard password"),
    paragraph(
      `Someone asked to reset the password for the Rise &amp; Shine admin dashboard account <strong style="color:${C.ink};">${esc(args.email)}</strong>.`,
    ),
    paragraph("Choose a new password with the button below."),
    button("Choose a new password", args.link),
    `<p style="margin:0 0 14px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.muted};word-break:break-all;">
      Or paste this link into your browser:<br>
      <a href="${href}" style="color:${C.navyLight};text-decoration:underline;">${href}</a>
    </p>`,
    callout(
      `This link works <strong>once</strong> and expires in <strong>${args.minutes} minutes</strong>. Setting a new password signs the account out on every other device.`,
    ),
    paragraph(
      `<span style="color:${C.muted};font-size:13.5px;">If you did not ask for this, you can ignore this email — your password stays as it is, and nobody can use this link without opening it from your inbox.</span>`,
    ),
  ].join("\n");

  return shell(body, {
    kicker: "Admin Dashboard",
    preheader: `Your password reset link — valid for ${args.minutes} minutes.`,
  });
}
