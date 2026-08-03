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

/** Seconds to wait before dialling. Default 120; clamped to 0…3600. */
export const CALLBACK_DELAY_SECONDS = (() => {
  const raw = Number(process.env.VOICE_CALLBACK_DELAY_SECONDS);
  // 0 would dial mid-submit; an hour is well past "we'll call you shortly".
  if (!Number.isFinite(raw) || raw < 0) return 120;
  return Math.min(Math.round(raw), 3600);
})();

/** The same delay, phrased for a customer: "about 2 minutes". */
export function callbackDelayPhrase(seconds = CALLBACK_DELAY_SECONDS): string {
  if (seconds < 45) return "under a minute";
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "about a minute" : `about ${minutes} minutes`;
}
