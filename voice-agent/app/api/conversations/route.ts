import { NextResponse } from "next/server";
import { listCalls } from "@/lib/elevenlabs";
import { requireCapability } from "@/lib/session";
import { serviceClient } from "@/lib/supabase";
import { isVisibleCall } from "@/lib/call-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → recent calls (with summary + collected travel details) for the feed.
export async function GET() {
  // Names and phone numbers of real leads: the page redirect is UX, this is
  // the boundary. Anonymous callers get 401 whatever the UI does.
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const [calls, known] = await Promise.all([listCalls(25), knownConversationIds()]);
    return NextResponse.json({ calls: known ? calls.filter((c) => isVisibleCall(c, known)) : calls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, calls: [] }, { status: 500 });
  }
}

// Conversation ids our CRM holds (voice_calls, written by the post-call
// webhook). If the table cannot be read, nothing is hidden: a broken filter
// must fail towards showing calls, never towards losing them.
async function knownConversationIds(): Promise<Set<string> | null> {
  try {
    const { data, error } = await serviceClient().from("voice_calls").select("conversation_id").limit(2000);
    if (error) return null;
    return new Set((data ?? []).map((r) => r.conversation_id as string));
  } catch {
    return null;
  }
}
