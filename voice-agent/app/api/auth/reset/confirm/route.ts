import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  passwordProblem,
  requestMeta,
} from "@/lib/dashboard-auth";
import { inspectReset, logResetEvent, redeemReset, resetVerdictMessage } from "@/lib/dashboard-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/auth/reset/confirm?token=… → is this link still usable?
// POST /api/auth/reset/confirm {token,password} → set the password and sign in.
//
// The GET exists so the page can say "this link has expired" before someone
// types a new password twice. It answers with one bit and never with the email
// behind the token — a link that leaked must not also disclose whose it is.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const verdict = await inspectReset(token);
  if (verdict === "ok") return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, error: resetVerdictMessage(verdict) }, { status: 410 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const result = await redeemReset(token, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // redeemReset revoked every session for the account, including whatever the
  // person had before. Hand this browser a fresh one so a reset lands them
  // inside the dashboard rather than back on the sign-in form.
  const meta = requestMeta(req.headers);
  await logResetEvent(result.email, "reset_done", meta);
  const sessionToken = await createSession(result.email, meta);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
