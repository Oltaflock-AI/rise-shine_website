/**
 * Form-spam screen — the pure half. `bot-guard-server.ts` adds Vercel BotID.
 *
 * On 15-Sep-2026 a crawler worked the whole site in runs (02:31, 04:07, 08:28,
 * 09:50 UTC): two /contact submits, a signup and a forgot-password each time.
 * Gibberish names, random 10-digit phones, dotted-Gmail addresses, travel date
 * 31-05-70. Nothing screened it, so every run mailed the agency inbox twice AND
 * — because /contact auto-dials — rang two random Indian mobiles with the AI
 * agent. Four strangers were cold-called that day. Per-IP throttles never
 * fired: the runs were hours apart.
 *
 * Two cheap tells, both invisible to a person:
 *
 * - A honeypot field that a browser hides and a form-filler fills.
 * - A render timestamp the page sets on mount. A person needs seconds to type
 *   a name and a phone; a script posts within the same second. Missing means
 *   the form was posted without our JS ever running (curl, a replayed action).
 *
 * A trip is answered with a SILENT success — the bot sees exactly what a
 * customer sees, so it learns nothing and does not adapt. Nothing is queued,
 * mailed or dialled.
 */

export const HONEYPOT_FIELD = "company_website";
export const RENDERED_AT_FIELD = "rendered_at";

/** Under this, no human has read the form and typed two fields. */
export const MIN_FILL_MS = 3_000;

/** A timestamp this far in the future or past is forged or clock-broken, not a person. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type BotVerdict = { bot: false } | { bot: true; reason: string };

/** Screen a form submission on its hidden fields alone. Pure; `now` is injectable for tests. */
export function screenFormFields(formData: FormData, now = Date.now()): BotVerdict {
  const honey = String(formData.get(HONEYPOT_FIELD) ?? "").trim();
  if (honey) return { bot: true, reason: "honeypot" };

  const raw = String(formData.get(RENDERED_AT_FIELD) ?? "").trim();
  if (!raw) return { bot: true, reason: "no-timestamp" };
  const renderedAt = Number(raw);
  if (!Number.isFinite(renderedAt)) return { bot: true, reason: "bad-timestamp" };

  const elapsed = now - renderedAt;
  if (elapsed < MIN_FILL_MS) return { bot: true, reason: `too-fast:${elapsed}ms` };
  if (elapsed > MAX_AGE_MS) return { bot: true, reason: "stale-timestamp" };

  return { bot: false };
}
