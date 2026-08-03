import "server-only";

/**
 * Outbound voice-agent call log (SERVER ONLY).
 *
 * The ElevenLabs post-call webhook (/api/voice/webhook) upserts every call into
 * `voice_calls` (migration 0005) keyed by conversation_id, so the agency has a
 * durable CRM record — transcript, summary, the trip details Priya collected, and
 * the recording — independent of ElevenLabs' own retention window.
 *
 * The three webhook types fill in different parts of the SAME row and can arrive in
 * any order, so every writer upserts only its own columns.
 * Written with the service-role key (bypasses RLS); customers never read it.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  collected,
  collectedText,
  type CallInitiationFailure,
  type PostCallAudio,
  type PostCallTranscription,
} from "@/lib/elevenlabs-webhook";

const TABLE = "voice_calls";
const AUDIO_BUCKET = "voice-call-audio";

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function upsert(row: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from(TABLE)
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "conversation_id" });
  if (error) throw error;
}

/** post_call_transcription — the full record of a completed call. */
export async function recordCallTranscription(ev: PostCallTranscription): Promise<void> {
  if (!supabaseAdminConfigured) return;
  const d = ev.data;
  const meta = (d.metadata ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const analysis = d.analysis ?? {};
  const dc = analysis.data_collection_results ?? {};
  const dyn = d.conversation_initiation_client_data?.dynamic_variables ?? {};
  const phone = (meta.phone_call ?? {}) as Record<string, unknown>;

  // lead_qualified is a boolean criterion on the agent; keep null when unanswered.
  const qualifiedRaw = collected(dc, "lead_qualified");
  const qualified =
    typeof qualifiedRaw === "boolean"
      ? qualifiedRaw
      : typeof qualifiedRaw === "string"
        ? ["true", "yes"].includes(qualifiedRaw.toLowerCase())
        : null;

  const startedUnix = num(meta.start_time_unix_secs);

  await upsert({
    conversation_id: d.conversation_id,
    agent_id: str(d.agent_id),
    agent_name: str(d.agent_name),
    status: str(d.status) ?? "done",
    call_successful: str(analysis.call_successful),

    lead_name: str(dyn.callee_name) ?? collectedText(dc, "lead_name"),
    lead_phone:
      str(dyn.mobile_number) ??
      str(phone.external_number) ??
      str(phone.to_number) ??
      collectedText(dc, "whatsapp_number"),
    from_number: str(phone.agent_number) ?? str(phone.from_number),
    to_number: str(phone.external_number) ?? str(phone.to_number),

    started_at: startedUnix != null ? new Date(startedUnix * 1000).toISOString() : null,
    duration_secs: num(meta.call_duration_secs),
    language: str(meta.main_language),
    cost: num(meta.cost),
    termination_reason: str(meta.termination_reason),

    summary: str(analysis.transcript_summary),
    qualified,

    destination: collectedText(dc, "destination"),
    num_travelers: collectedText(dc, "num_travelers"),
    travel_month: collectedText(dc, "travel_month"),
    special_requests: collectedText(dc, "special_requests"),
    whatsapp_number: collectedText(dc, "whatsapp_number"),
    callback_time: collectedText(dc, "callback_time"),

    transcript: d.transcript ?? [],
    analysis,
    data_collection: dc,
    metadata: meta,
    dynamic_variables: dyn,

    has_audio: Boolean(d.has_audio),
  });
}

/**
 * post_call_audio — base64 MP3 of the whole call. Recordings are far too big for a
 * table column, so the bytes go to the private `voice-call-audio` Storage bucket and
 * only the object path is stored. Serve one to staff with a signed URL.
 */
export async function recordCallAudio(ev: PostCallAudio): Promise<void> {
  if (!supabaseAdminConfigured) return;
  const { conversation_id, full_audio } = ev.data;
  if (!conversation_id || !full_audio) return;

  const bytes = Buffer.from(full_audio, "base64");
  const path = `${conversation_id}.mp3`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) throw upErr;

  await upsert({ conversation_id, has_audio: true, audio_path: path });
}

/** call_initiation_failure — the call never connected (busy / no-answer / …). */
export async function recordCallInitiationFailure(ev: CallInitiationFailure): Promise<void> {
  if (!supabaseAdminConfigured) return;
  const d = ev.data;
  const body = (d.metadata?.body ?? {}) as Record<string, unknown>;

  await upsert({
    conversation_id: d.conversation_id,
    agent_id: str(d.agent_id),
    status: "initiation_failed",
    call_successful: "failure",
    from_number: str(body.from_number),
    to_number: str(body.to_number),
    lead_phone: str(body.to_number),
    failure_reason: str(d.failure_reason) ?? "unknown",
    failure_metadata: d.metadata ?? {},
  });
}

/** Signed, time-limited URL for a stored recording (ops/dashboard use). */
export async function signedAudioUrl(
  conversationId: string,
  expiresInSecs = 3600,
): Promise<string | null> {
  if (!supabaseAdminConfigured) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(`${conversationId}.mp3`, expiresInSecs);
  if (error) return null;
  return data?.signedUrl ?? null;
}
