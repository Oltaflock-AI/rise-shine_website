import "server-only";

/**
 * ElevenLabs Conversational AI webhooks — signature verification + payload types
 * (SERVER ONLY).
 *
 * The outbound voice agent ("Priya", agent_6901kth2…) posts every finished call to
 * /api/voice/webhook. Three event types arrive on the same endpoint:
 *
 *   post_call_transcription  full transcript + post-call analysis (summary, the
 *                            fields Priya collected, call_successful) + metadata
 *   post_call_audio          the recording only: { agent_id, conversation_id,
 *                            full_audio } where full_audio is base64 MP3
 *   call_initiation_failure  the call never connected (busy / no-answer / unknown)
 *
 * Auth is an HMAC-SHA256 signature in the `ElevenLabs-Signature` header, formatted
 * `t=<unix-seconds>,v0=<hex-digest>`. The signed string is `${timestamp}.${rawBody}`
 * keyed by the webhook secret (`wsec_…`, shown once when the webhook is created in
 * the ElevenLabs dashboard). Signatures older than 30 minutes are rejected — that
 * window is what stops a captured request being replayed at us.
 *
 * Raw REST + node:crypto, no SDK — same house style as lib/razorpay.ts.
 * Docs: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 */
import crypto from "node:crypto";

/** 30 minutes, per the ElevenLabs verification spec. */
const TOLERANCE_SECS = 30 * 60;

export const elevenLabsWebhookConfigured = Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET);

/**
 * Only accept calls from OUR agent. The webhook is workspace-wide, so a second
 * agent in the same ElevenLabs workspace would otherwise write into this CRM.
 * Unset = accept every agent (fine for a single-agent workspace).
 */
export const EXPECTED_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "";

/**
 * Verify an ElevenLabs webhook signature over the RAW request body.
 *
 * `raw` must be the exact bytes received (`req.text()`) — re-serializing the parsed
 * JSON changes key order/spacing and the digest will never match.
 */
export function verifyWebhookSignature(
  raw: string,
  header: string | null,
  nowSecs: number = Math.floor(Date.now() / 1000),
): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v0=")).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSecs - ts) > TOLERANCE_SECS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");

  return signatures.some((sig) => {
    // timingSafeEqual throws on a length mismatch — a wrong-length digest is simply invalid.
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

// ── Payload shapes ──────────────────────────────────────────────────────────
// Only the fields we read are typed; everything else is preserved verbatim as
// jsonb in `voice_calls`, so nothing ElevenLabs sends is lost.

export interface TranscriptTurn {
  role: string; // "agent" | "user"
  message: string | null;
  time_in_call_secs?: number | null;
  [k: string]: unknown;
}

export interface PostCallTranscription {
  type: "post_call_transcription";
  event_timestamp: number;
  data: {
    agent_id?: string;
    agent_name?: string;
    conversation_id: string;
    status?: string;
    transcript?: TranscriptTurn[];
    metadata?: Record<string, unknown>;
    analysis?: {
      transcript_summary?: string | null;
      call_summary_title?: string | null;
      call_successful?: string | null;
      data_collection_results?: Record<string, unknown>;
      evaluation_criteria_results?: Record<string, unknown>;
      [k: string]: unknown;
    };
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
      [k: string]: unknown;
    };
    has_audio?: boolean;
    [k: string]: unknown;
  };
}

export interface PostCallAudio {
  type: "post_call_audio";
  event_timestamp: number;
  data: { agent_id?: string; conversation_id: string; full_audio: string };
}

export interface CallInitiationFailure {
  type: "call_initiation_failure";
  event_timestamp: number;
  data: {
    agent_id?: string;
    conversation_id: string;
    failure_reason?: string; // busy | no-answer | unknown
    metadata?: { type?: string; body?: Record<string, unknown> };
  };
}

export type WebhookEvent =
  | PostCallTranscription
  | PostCallAudio
  | CallInitiationFailure
  | { type: string; event_timestamp?: number; data?: Record<string, unknown> };

/**
 * Read one `data_collection_results` entry. ElevenLabs wraps each collected field
 * as `{ value, rationale, … }`, but has also shipped bare values — handle both.
 */
export function collected(
  results: Record<string, unknown> | undefined,
  key: string,
): unknown {
  const entry = results?.[key];
  if (entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)) {
    return (entry as Record<string, unknown>).value;
  }
  return entry;
}

/** Same, coerced to a trimmed string (null when absent/empty). */
export function collectedText(
  results: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const v = collected(results, key);
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}
