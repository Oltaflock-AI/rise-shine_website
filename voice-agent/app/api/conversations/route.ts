import { NextResponse } from "next/server";
import { listCalls } from "@/lib/elevenlabs";
import { requireCapability } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → recent calls (with summary + collected travel details) for the feed.
export async function GET() {
  // Names and phone numbers of real leads: the page redirect is UX, this is
  // the boundary. Anonymous callers get 401 whatever the UI does.
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const calls = await listCalls(25);
    return NextResponse.json({ calls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, calls: [] }, { status: 500 });
  }
}
