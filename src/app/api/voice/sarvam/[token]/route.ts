import { timingSafeEqual } from "node:crypto";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { retryUnansweredCallback } from "@/lib/callback-retry";
import { normaliseSarvamCall, voxlineSarvamPayload } from "@/lib/sarvam-call";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, ctx: {params: Promise<{token: string}>}) {
  const expected = process.env.SARVAM_WEBHOOK_TOKEN;
  if (!expected || !supabaseAdminConfigured || !process.env.SARVAM_VOXLINE_WEBHOOK_URL)
    return Response.json({ok: false}, {status: 503});
  const {token} = await ctx.params;
  const a = Buffer.from(token), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ok: false}, {status: 401});
  let p;
  try { p = await req.json(); } catch { return Response.json({ok: false}, {status: 400}); }
  if (!p || typeof p !== "object" || Array.isArray(p)) return Response.json({ok: false}, {status: 400});
  if (p.app_id !== process.env.SARVAM_APP_ID) return Response.json({ok: false}, {status: 401});
  const row = normaliseSarvamCall(p);
  if (!row) return Response.json({ok: true, ignored: "no-call-id"});
  try {
    const {error} = await createAdminClient().from("voice_calls")
      .upsert({...row, updated_at: new Date().toISOString()}, {onConflict: "conversation_id"});
    if (error) throw new Error("Call storage failed");
    // Both stores upsert by provider call ID, so provider redelivery is safe.
    const forwarded = await fetch(process.env.SARVAM_VOXLINE_WEBHOOK_URL, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(voxlineSarvamPayload(p)), signal: AbortSignal.timeout(20000), cache: "no-store",
    });
    if (!forwarded.ok) throw new Error("Voxline delivery failed");
    if (p.connectivity_status === "no_answer" || p.connectivity_status === "busy" || row.analysis.outcome === "voicemail") {
      await retryUnansweredCallback(row.conversation_id);
    }
    return Response.json({ok: true});
  } catch {
    console.error("[sarvam-webhook] Call storage or reporting delivery failed");
    return Response.json({ok: false}, {status: 500});
  }
}
