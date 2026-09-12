/**
 * How loudly an ops alert should reach a human. Pure, so Sentry routing can
 * be pinned by a test rather than by reading the dashboard.
 *
 * The tier rides on every Sentry message as `tags.tier`, and Sentry's alert
 * rules key off it: `tier:page` goes to SMS/phone, `tier:alert` to email/Slack,
 * `tier:info` nowhere. Email from `alertOps` carries everything regardless.
 *
 *   page   a customer's money is in an unknown state and NO code will fix it —
 *          every URGENT subject, plus anything the caller marks `money`
 *   alert  something is broken; customers are being refused, not charged
 *   info   a recovery, or an automatic refund that already settled itself
 */
export type AlertTier = "page" | "alert" | "info";

export function alertTier(subject: string, opts?: { money?: boolean }): AlertTier {
  if (opts?.money || /URGENT/.test(subject)) return "page";
  if (/^(STILL )?DOWN\b|FAILED|REJECTED|TIMED OUT/i.test(subject)) return "alert";
  return "info";
}

/** Sentry severity for a tier. Errors are what most routing defaults key on. */
export function sentryLevel(tier: AlertTier): "error" | "warning" | "info" {
  return tier === "page" ? "error" : tier === "alert" ? "warning" : "info";
}
