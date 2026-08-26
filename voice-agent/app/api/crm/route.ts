import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/session";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The CRM half of the picture: voice_calls rows written by the ElevenLabs
// post-call webhook, each joined to its callback_queue row on phone number
// (queue → dial → webhook is the lead's lifecycle). Read-only.
export async function GET() {
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sb = serviceClient();
  const [calls, queue] = await Promise.all([
    sb
      .from("voice_calls")
      .select("conversation_id, lead_name, lead_phone, summary, qualified, destination, started_at, call_successful")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(200),
    sb.from("callback_queue").select("phone, status").limit(500),
  ]);

  if (calls.error) {
    return NextResponse.json({ error: `voice_calls read failed: ${calls.error.message}` }, { status: 502 });
  }
  const queueByPhone = new Map<string, string>(
    (queue.data ?? []).map((r) => [r.phone as string, r.status as string]),
  );
  return NextResponse.json({
    calls: (calls.data ?? []).map((c) => ({
      ...c,
      queue_status: c.lead_phone ? queueByPhone.get(c.lead_phone) ?? null : null,
    })),
  });
}
