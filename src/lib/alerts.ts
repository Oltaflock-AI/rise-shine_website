import "server-only";

/**
 * Ops alerting for money-critical events — a failed refund must never be a
 * console line nobody reads. Alerts go to ALERT_EMAIL (default: the agency
 * inbox in site.ts) through the same Resend transport as customer email, and
 * ALWAYS console.error too so Vercel logs keep the full record even when
 * email is unconfigured. Best-effort by contract: callers already decided the
 * customer-facing outcome; an alert failure only logs.
 */

import { site } from "@/data/site";
import { emailConfigured, sendEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";
import { alertTier, sentryLevel } from "@/lib/alert-tier";

const ALERT_TO = process.env.ALERT_EMAIL || site.email;

export async function alertOps(
  subject: string,
  details: Record<string, unknown>,
  opts?: { money?: boolean },
): Promise<void> {
  const tier = alertTier(subject, opts);
  console.error(`[ALERT:${tier}] ${subject}`, details);
  // Second channel. Email is one transport with one recipient; if Resend is the
  // thing that broke — or the inbox is full, muted or on holiday — the alert
  // vanishes. Sentry is a separate path with its own routing (Slack, SMS,
  // on-call), and a no-op when no DSN is set. Subject only: the details carry
  // customer email, PAN and order ids, and Sentry's retention is not ours.
  try {
    // `tier` is what the Sentry alert rules route on — see lib/alert-tier.ts.
    Sentry.captureMessage(`[OPS] ${subject}`, {
      level: sentryLevel(tier),
      tags: { source: "alertOps", tier },
      fingerprint: ["alertOps", subject],
    });
  } catch (e) {
    console.error("[ALERT] Sentry capture failed:", e);
  }
  if (!emailConfigured) return;
  const rows = Object.entries(details)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#68777f;font-size:13px;vertical-align:top;white-space:nowrap;">${k}</td>` +
        `<td style="padding:4px 0;font-size:13px;font-family:monospace;word-break:break-all;">${String(v ?? "—")}</td></tr>`,
    )
    .join("");
  try {
    await sendEmail({
      to: ALERT_TO,
      subject: `[Rise & Shine OPS] ${subject}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:14px;"><b>${subject}</b></p>
<table style="font-family:Arial,sans-serif;">${rows}</table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#68777f;">Automated alert from the booking API.</p>`,
    });
  } catch (e) {
    console.error("[ALERT] alert email failed:", e);
  }
}
