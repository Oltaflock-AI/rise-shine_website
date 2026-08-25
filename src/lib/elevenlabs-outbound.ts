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

import { normalisePhone } from "@/lib/phone";

const API_BASE = "https://api.elevenlabs.io/v1/convai";

/**
 * Unlike the dashboard, nothing here is hardcoded: the site must build and boot
 * without ElevenLabs credentials (same rule as TBO/Cashfree/Resend), so callers
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
 * Phone normalisation lives in `lib/phone.ts` — the signup form needs it in the
 * browser and this file is `server-only`. Re-exported here so `callback-queue`
 * and the dialling path keep their existing import.
 */
export { isDiallableIndianNumber, normalisePhone } from "@/lib/phone";

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
