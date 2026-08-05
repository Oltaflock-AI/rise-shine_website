import "server-only";

/**
 * ElevenLabs Conversational AI — outbound calling, **server only**.
 *
 * The main site only ever needs to *place* a call; reading transcripts, summaries
 * and collected fields is the voice-agent dashboard's job (see
 * `voice-agent/lib/elevenlabs.ts`), which talks to the same agent. Keep this file
 * to the dialling half so the marketing site never carries the dashboard's
 * surface area.
 *
 * NEVER import this from a client component — it reads the secret API key.
 */

const API_BASE = "https://api.elevenlabs.io/v1/convai";

/**
 * Unlike the dashboard, nothing here is hardcoded: the site must build and boot
 * without ElevenLabs credentials (same rule as TBO/Razorpay/Resend), so callers
 * check `elevenLabsConfigured` and degrade instead of throwing at import time.
 */
export const elevenLabsConfigured = Boolean(
  (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API) &&
    process.env.ELEVENLABS_AGENT_ID &&
    process.env.ELEVENLABS_PHONE_NUMBER_ID,
);

function apiKey(): string {
  // ELEVENLABS_API_KEY is preferred; ELEVEN_API (the dashboard's original name)
  // is accepted so one workspace key can serve both apps.
  const k = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API;
  if (!k) throw new Error("ELEVENLABS_API_KEY / ELEVEN_API is not set");
  return k;
}

/**
 * Normalise an Indian mobile number to E.164 — the only format the SIP trunk
 * accepts. 10 digits → +91; an existing country code is preserved.
 *
 * Deliberately identical in behaviour to the dashboard's copy: both apps write
 * `mobile_number` into the same agent, and a mismatch would split one customer
 * across two identities in the call log.
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

export interface OutboundResult {
  conversationId: string | null;
  sipCallId: string | null;
}

/**
 * Place one outbound call. Throws on any non-2xx so the caller can record the
 * failure against the queue row — never swallow this into a silent success.
 */
export async function placeOutboundCall(opts: {
  toNumber: string;
  calleeName: string;
}): Promise<OutboundResult> {
  const to = normalisePhone(opts.toNumber);

  // The agent's first message interpolates {{callee_name}} and its prompt uses
  // {{mobile_number}} — ElevenLabs fails the call outright if either is missing.
  const body = {
    agent_id: process.env.ELEVENLABS_AGENT_ID,
    agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
    to_number: to,
    conversation_initiation_client_data: {
      dynamic_variables: {
        callee_name: opts.calleeName?.trim() || "Guest",
        mobile_number: to,
      },
    },
  };

  const res = await fetch(`${API_BASE}/sip-trunk/outbound-call`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail?.message || json?.message || `outbound-call ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return {
    conversationId: json?.conversation_id ?? null,
    sipCallId: json?.sip_call_id ?? null,
  };
}
