import "server-only";
import { normalisePhone } from "@/lib/phone";
import { elevenLabsConfigured, placeOutboundCall as elevenLabsCall } from "@/lib/elevenlabs-outbound";

export function voiceConfigured(): boolean {
  if (process.env.VOICE_PROVIDER !== "sarvam") return elevenLabsConfigured;
  return Boolean(process.env.SARVAM_VOICE_API_KEY && process.env.SARVAM_ORG_ID &&
    process.env.SARVAM_WORKSPACE_ID && process.env.SARVAM_APP_ID &&
    Number(process.env.SARVAM_APP_VERSION) > 0 && process.env.SARVAM_CONNECTION_ID &&
    process.env.SARVAM_PHONE_NUMBER && process.env.SARVAM_CALLBACK_WEBHOOK_URL);
}

export async function placeOutboundCall(opts: {toNumber: string; calleeName: string}) {
  if (process.env.VOICE_PROVIDER !== "sarvam") return elevenLabsCall(opts);
  if (!voiceConfigured()) throw new Error("Sarvam voice calling is not configured");
  const base = "https://apps.sarvam.ai/api/outbounds/v1/orgs";
  const res = await fetch(`${base}/${process.env.SARVAM_ORG_ID}/workspaces/${process.env.SARVAM_WORKSPACE_ID}/outbounds`, {
    method: "POST",
    headers: {"x-api-key": process.env.SARVAM_VOICE_API_KEY!, "Content-Type": "application/json"},
    body: JSON.stringify({
      app_config: {
        app_id: process.env.SARVAM_APP_ID,
        app_version: Number(process.env.SARVAM_APP_VERSION),
        connection_config: {connection_id: process.env.SARVAM_CONNECTION_ID, agent_phone_number: process.env.SARVAM_PHONE_NUMBER},
        agent_variables: {callee_name: opts.calleeName.trim()},
      },
      user_config: {user_phone_number: normalisePhone(opts.toNumber)},
      webhook_config: {url: process.env.SARVAM_CALLBACK_WEBHOOK_URL},
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  // Never fall back to a second provider after an ambiguous dial response.
  if (!res.ok) throw new Error(`Sarvam outbound-call failed (${res.status})`);
  if (typeof json.attempt_id !== "string" || !json.attempt_id) throw new Error("Sarvam returned no attempt ID");
  return {conversationId: json.attempt_id, sipCallId: null};
}
