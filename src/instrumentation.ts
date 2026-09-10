import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting.
 *
 * Everything degrades without credentials, the same as every other integration
 * here: with no SENTRY_DSN, `init` is a no-op and the site runs unchanged, so a
 * local checkout and a preview deploy need no account.
 *
 * This exists because the 10-Sep-2026 payment failure could not be diagnosed
 * after the fact — Vercel's log retention had already rolled past it and the
 * browser's error was never recorded anywhere. Traces are sampled low: this is
 * for errors, not for performance billing.
 */
export function register() {
  // Vercel's Sentry integration provisions NEXT_PUBLIC_SENTRY_DSN and no
  // server-side SENTRY_DSN, so reading only the latter left every route-handler
  // and RSC crash unreported while the dashboard looked correctly configured.
  // A DSN is not a secret — it ships inside the browser bundle by design — so
  // falling back to the public one is safe and removes a manual step that is
  // easy to forget and silent when forgotten.
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || "development",
    tracesSampleRate: 0.05,
    // Never ship a customer's passport, PAN, card or address to a third party.
    sendDefaultPii: false,
  });
}

/**
 * Next 16 calls this for every uncaught error in a route handler or RSC render,
 * which is the only way a crashed /api/book or /api/payment/order reaches us
 * with a stack rather than as an HTTP status in a log line.
 */
export const onRequestError = Sentry.captureRequestError;
