import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";

/**
 * Vercel BotID — the paths whose requests get classification headers. A server
 * action posts to the PAGE it lives on, so the form pages are listed, not the
 * action. `checkBotId()` on any path missing here reads as a bot, so add the
 * page before adding the check. See lib/bot-guard.ts for the incident.
 */
initBotId({
  protect: [
    { path: "/contact", method: "POST" },
    { path: "/plan-my-trip", method: "POST" },
    { path: "/request-a-call", method: "POST" },
    { path: "/api/auth/signup", method: "POST" },
    { path: "/api/auth/forgot-password", method: "POST" },
  ],
});

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
