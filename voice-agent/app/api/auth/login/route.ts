import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/access-store";
import { SESSION_COOKIE, SESSION_TTL_MS, requestMeta, signIn } from "@/lib/dashboard-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dashboard sign-in against dashboard_users — never against Supabase Auth.
// Every attempt is logged server-side; lockout and the refusal messages live
// in dashboard-auth.ts so the rules are unit-tested in one place.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  // On a brand-new table this writes the bootstrap admin(s) so the very first
  // login has someone to match — see ensureSeeded() in access-store.ts.
  await ensureSeeded();
  const result = await signIn(email, password, requestMeta(req.headers));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const res = NextResponse.json({ ok: true, role: result.role });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
