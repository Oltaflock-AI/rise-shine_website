import {
  EXPECTED_AGENT_ID,
  elevenLabsWebhookConfigured,
  verifyWebhookSignature,
  type CallInitiationFailure,
  type PostCallAudio,
  type PostCallTranscription,
} from "@/lib/elevenlabs-webhook";
import {
  recordCallAudio,
  recordCallInitiationFailure,
  recordCallTranscription,
} from "@/lib/voice-calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // audio payloads can take a moment to land in Storage

/**
 * POST /api/voice/webhook — ElevenLabs Conversational AI events for the outbound
 * voice agent (Priya). This is the URL you paste into the ElevenLabs dashboard —
 * the project's stable Vercel alias, which works today with no custom domain:
 *
 *   https://riseand-shine-final-website.vercel.app/api/voice/webhook
 *
 * (Once riseandshinetravel.com is pointed at the project, the /api/voice/webhook
 * path answers on that host too — update the webhook in ElevenLabs then, or don't:
 * the .vercel.app alias keeps working either way.)
 *
 * Set it under ElevenLabs → Conversational AI → Settings → Webhooks, enable the
 * events you want (post_call_transcription, optionally post_call_audio and
 * call_initiation_failure), and copy the generated secret (`wsec_…`) into
 * ELEVENLABS_WEBHOOK_SECRET.
 *
 * Auth is an HMAC-SHA256 signature over the RAW body (`t=…,v0=…` in the
 * ElevenLabs-Signature header) — so we read req.text() and verify BEFORE parsing.
 * Every event is written to `voice_calls` (migration 0005).
 *
 * Status codes matter to the sender: only 200 counts as delivered, and
 * post_call_transcription is retried on failure — so a DB write error returns 500
 * (retry us) while a bad signature or an unknown event type is terminal.
 */
export async function POST(req: Request) {
  if (!elevenLabsWebhookConfigured) {
    return Response.json({ ok: false, error: "Webhook not configured." }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("elevenlabs-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  let event: { type?: string; data?: { agent_id?: string; conversation_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  // The webhook is workspace-wide: another agent in the same ElevenLabs workspace
  // would post here too. Drop anything that isn't ours (200 — nothing to retry).
  const agentId = event.data?.agent_id;
  if (EXPECTED_AGENT_ID && agentId && agentId !== EXPECTED_AGENT_ID) {
    return Response.json({ ok: true, ignored: "other-agent" });
  }
  if (!event.data?.conversation_id) {
    return Response.json({ ok: true, ignored: "no-conversation-id" });
  }

  try {
    switch (event.type) {
      case "post_call_transcription":
        await recordCallTranscription(event as PostCallTranscription);
        break;
      case "post_call_audio":
        await recordCallAudio(event as unknown as PostCallAudio);
        break;
      case "call_initiation_failure":
        await recordCallInitiationFailure(event as unknown as CallInitiationFailure);
        break;
      default:
        // Unknown/unsubscribed event — acknowledge so it isn't retried forever.
        return Response.json({ ok: true, ignored: event.type ?? "unknown" });
    }
  } catch (e) {
    console.error(`[api/voice/webhook] ${event.type} write failed:`, e);
    return Response.json({ ok: false }, { status: 500 }); // 5xx → ElevenLabs retries
  }

  return Response.json({ ok: true });
}

/** Health check — lets you confirm the URL is live before pasting it into ElevenLabs. */
export function GET() {
  return Response.json({
    ok: true,
    endpoint: "elevenlabs-post-call-webhook",
    configured: elevenLabsWebhookConfigured,
  });
}
