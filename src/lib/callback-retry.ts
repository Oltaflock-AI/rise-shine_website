import "server-only";

/**
 * One more try when the callback rang out.
 *
 * The queue marks a row `done` the moment ElevenLabs ACCEPTS the dial — which is
 * the right meaning for `markCallPlaced`, but it means a customer who missed the
 * call got a single voicemail and nothing else, while /contact had just promised
 * them a travel expert would ring. `MAX_ATTEMPTS` in the queue does not cover
 * this: it retries dials that fail to PLACE, not calls that place fine and are
 * never answered.
 *
 * So the post-call webhook comes back here, and an unanswered call is queued
 * once more.
 *
 * A retry is a NEW queue row rather than an edit to the old one. That keeps the
 * call log honest (each dial stays its own record), needs no schema change, and
 * — because `callback_queue_active_phone_idx` allows only one OUTSTANDING row
 * per number — makes a double-dial structurally impossible even if ElevenLabs
 * redelivers the webhook, which it does on any non-200.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { enqueueCallback } from "@/lib/callback-queue";
import type { TranscriptTurn } from "@/lib/elevenlabs-webhook";

/** How long to wait before trying again. Long enough not to pester. */
export const RETRY_DELAY_SECONDS = (() => {
  const raw = Number(process.env.VOICE_CALLBACK_RETRY_SECONDS);
  if (!Number.isFinite(raw) || raw < 60) return 15 * 60;
  return Math.min(Math.round(raw), 24 * 60 * 60);
})();

/** Marks a queue row as the second attempt, so a retry is never itself retried. */
export const RETRY_SOURCE_PREFIX = "retry:";

/**
 * Did a human actually talk to the agent?
 *
 * NOT "are there zero user turns". Measured against our own call log, a voicemail
 * still produces exactly ONE user turn — the ASR transcribing the outgoing
 * greeting before the beep. Real conversations produced four or more:
 *
 *   voicemail      20s, 24s   → 1 user turn   ("Voicemail Left")
 *   conversation   45s–113s   → 4–10 turns    ("Bali Travel Inquiry")
 *
 * So the threshold sits in that gap. It is deliberately structural rather than
 * reading `analysis.call_summary_title` for the word "voicemail": that title is
 * LLM-written and language-dependent, and this agent speaks Hindi.
 */
const MIN_USER_TURNS_FOR_A_CONVERSATION = 2;

export function callWasAnswered(transcript: TranscriptTurn[] | null | undefined): boolean {
  if (!transcript?.length) return false;
  const spoke = transcript.filter(
    (t) => t.role === "user" && typeof t.message === "string" && t.message.trim() !== "",
  );
  return spoke.length >= MIN_USER_TURNS_FOR_A_CONVERSATION;
}

/**
 * Queue a second attempt for the lead behind `conversationId`, if there is one.
 *
 * Returns what it decided, so the caller can log it. Never throws: a retry is a
 * courtesy, and it must not turn a recorded call into a 500 that makes
 * ElevenLabs redeliver the whole webhook.
 */
export type RetryOutcome =
  | "queued"
  | "not-from-queue"
  | "already-retried"
  | "already-outstanding"
  | "undiallable"
  | "unconfigured"
  | "error";

export async function retryUnansweredCallback(conversationId: string): Promise<RetryOutcome> {
  if (!supabaseAdminConfigured) return "unconfigured";

  try {
    // Only leads WE dialled from the queue are ours to retry. An inbound call or
    // a dial placed by hand has no row here, and gets left alone.
    const { data: origin, error } = await createAdminClient()
      .from("callback_queue")
      .select("name, phone, source")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error) {
      console.error("[callback-retry] origin lookup failed:", error.message);
      return "error";
    }
    if (!origin) return "not-from-queue";

    const source = String(origin.source ?? "");
    if (source.startsWith(RETRY_SOURCE_PREFIX)) return "already-retried";

    const queued = await enqueueCallback({
      name: String(origin.name ?? ""),
      phone: String(origin.phone ?? ""),
      source: `${RETRY_SOURCE_PREFIX}${source || "unknown"}`,
      delaySeconds: RETRY_DELAY_SECONDS,
    });

    if (queued.ok) return "queued";
    // A redelivered webhook lands here rather than dialling twice — the partial
    // unique index refused the second outstanding row for this number.
    if (queued.reason === "duplicate") return "already-outstanding";
    if (queued.reason === "invalid_phone") return "undiallable";
    console.error("[callback-retry] re-enqueue failed:", queued.message);
    return "error";
  } catch (e) {
    console.error("[callback-retry] threw:", e);
    return "error";
  }
}
