import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/supabase";
import { getViewer } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signing in proves identity; the access list (dashboard_access) decides
// entry. A valid customer account that was never granted access is signed
// straight back out and told so — otherwise it would carry a session that
// every API call rejects with 401, which reads as a broken dashboard.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }

  const viewer = await getViewer();
  if (!viewer) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "This account does not have dashboard access. Ask an admin to add you." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
