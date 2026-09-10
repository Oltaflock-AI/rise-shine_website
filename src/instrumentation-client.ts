import * as Sentry from "@sentry/nextjs";

/**
 * Browser error reporting.
 *
 * The failure that started all this happened in the browser — a fetch on the
 * checkout page — and left no trace anywhere. Client errors now surface with a
 * stack instead of a screenshot.
 *
 * No DSN (local, preview without secrets) → no-op.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    tracesSampleRate: 0.05,
    // Checkout forms carry passport, PAN and address fields. Never record them.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
