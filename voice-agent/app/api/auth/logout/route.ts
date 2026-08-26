import { NextResponse } from "next/server";
import { authClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
