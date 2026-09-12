import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/session";
import { serviceClient } from "@/lib/supabase";
import type { TrendRow } from "@/lib/trend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The four columns the Overview's period toggle and weekly chart need, for
// every call the webhook ever recorded. Nothing identifying leaves here — no
// names, numbers or summaries — so it is the cheapest read on the dashboard.
// The slicing itself is pure (lib/trend.ts) and runs in the browser.
export async function GET() {
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await serviceClient()
    .from("voice_calls")
    .select("started_at, duration_secs, qualified, callback_time")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: `voice_calls read failed: ${error.message}` }, { status: 502 });
  }
  return NextResponse.json({ rows: (data ?? []) as TrendRow[] });
}
