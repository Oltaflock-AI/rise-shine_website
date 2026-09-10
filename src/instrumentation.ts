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
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
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
