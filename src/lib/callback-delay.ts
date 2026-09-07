/**
 * How long after the form is submitted the voice agent rings back.
 *
 * A plain module (no `server-only`, no `"use server"`) because two very
 * different callers need it: the queue writer computes `due_at` from the number,
 * and the page renders the phrase into its copy. The delay is expected to change
 * — deriving the copy from the same constant keeps the promise on the page and
 * the behaviour in the queue from drifting apart.
 *
 * Only server code ever reads the env var; the page passes the finished phrase
 * down to the client form as a prop, so this never needs a NEXT_PUBLIC_ twin.
 */

/**
 * Seconds to wait before dialling. Default 0 — dial during the submit.
 *
 * It was 120, and that single number is why this system had a queue drain, a
 * cron endpoint and an external pinger: a 2-minute wait cannot happen inside a
 * request capped at 60 seconds, so something else had to come along later and
 * place the call. When that something silently stopped, callbacks stopped with
 * it and nothing said so.
 *
 * Dialling is one POST that returns in under a second, so with no wait the
 * submitting request can ring the customer itself. Set
 * VOICE_CALLBACK_DELAY_SECONDS to bring the pause back — but note that a
 * non-zero value returns the dial to the recovery drain, and therefore depends
 * on whatever schedule is calling /api/cron/callback-queue.
 */
export const CALLBACK_DELAY_SECONDS = (() => {
  const raw = Number(process.env.VOICE_CALLBACK_DELAY_SECONDS);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.round(raw), 3600);
})();

/** The same delay, phrased for a customer: "about 2 minutes". */
export function callbackDelayPhrase(seconds = CALLBACK_DELAY_SECONDS): string {
  // No wait at all: the phone is already ringing by the time they read this.
  if (seconds <= 10) return "a few seconds";
  if (seconds < 45) return "under a minute";
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "about a minute" : `about ${minutes} minutes`;
}
