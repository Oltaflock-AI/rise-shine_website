import { NextRequest, NextResponse } from "next/server";
import { fetchConversationAudio } from "@/lib/elevenlabs";
import { requireCapability } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams the call recording from ElevenLabs to the signed-in viewer. The API
// key stays server-side; the browser only ever sees this gated proxy.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await params;
  const upstream = await fetchConversationAudio(id);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "No recording available for this call." }, { status: 404 });
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
