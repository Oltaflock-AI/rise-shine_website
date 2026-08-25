/**
 * Phone normalisation — shared by the callback queue (server) and the signup
 * form (browser), so one customer can never end up as two identities.
 *
 * This lives apart from `elevenlabs-outbound.ts` for one reason: that file is
 * `import "server-only"` because it reads the ElevenLabs API key, and signup
 * runs in the browser. The logic is unchanged and elevenlabs-outbound
 * re-exports it, so the SIP trunk and the account record agree by construction.
 */

/**
 * Normalise an Indian mobile number to E.164 — the only format the SIP trunk
 * accepts. 10 digits → +91; an existing country code is preserved.
 *
 * Deliberately identical in behaviour to the voice-agent dashboard's copy: both
 * apps write `mobile_number` into the same agent, and a mismatch would split one
 * customer across two identities in the call log.
 */
export function normalisePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  return "+" + digits;
}

/**
 * Is this a number we can plausibly dial? A shape check, not a reachability
 * check — it catches typos and truncation before they reach the SIP trunk.
 *
 * It cannot reject landlines: an Indian STD code plus subscriber number is the
 * same length and prefix range as a mobile (079-2329-7232 → +917923297232 is
 * indistinguishable from a mobile starting 79). Those get queued, fail at the
 * trunk, and land in `callback_queue.last_error` for a human to chase.
 */
export function isDiallableIndianNumber(e164: string): boolean {
  // +91 followed by a 10-digit mobile (Indian mobiles start 6–9).
  if (/^\+91[6-9]\d{9}$/.test(e164)) return true;
  // Allow other country codes through, but insist on a plausible length.
  return /^\+\d{8,15}$/.test(e164) && !e164.startsWith("+91");
}
