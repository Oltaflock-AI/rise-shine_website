import { NextRequest, NextResponse } from "next/server";
import { setPassword } from "@/lib/access-store";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  hashPassword,
  passwordProblem,
  requestMeta,
  revokeAllSessions,
  verifyCurrentPassword,
} from "@/lib/dashboard-auth";
import { requireCapability } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Change your own password. Requires the current one, then drops every other
// session for the account and hands this browser a fresh one.
export async function POST(req: NextRequest) {
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (guard.viewer.simulated) {
    return NextResponse.json({ error: "Sign-in is off locally; there is no password to change." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (!(await verifyCurrentPassword(guard.viewer.email, current))) {
    return NextResponse.json({ error: "Your current password is wrong." }, { status: 401 });
  }

  const stored = await setPassword(guard.viewer.email, hashPassword(next));
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: 400 });

  await revokeAllSessions(guard.viewer.email);
  const token = await createSession(guard.viewer.email, requestMeta(req.headers));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
