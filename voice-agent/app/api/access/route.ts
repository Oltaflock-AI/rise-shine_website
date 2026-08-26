import { NextRequest, NextResponse } from "next/server";
import { isRole, isValidEmail, normaliseEmail } from "@/lib/access";
import {
  addMember,
  isPersistent,
  listMembers,
  removeMember,
  setPassword,
  setRole,
  type StoreResult,
} from "@/lib/access-store";
import {
  hashPassword,
  listLoginEvents,
  passwordProblem,
  revokeAllSessions,
} from "@/lib/dashboard-auth";
import { AUTH_ENABLED, requireCapability } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Team access: who may open this dashboard and what they may do.
//
//   GET    /api/access                   → the list, who the caller is, and
//                                          (admins only) recent sign-in attempts
//   POST   /api/access {email,role,password}  → create an account
//   PATCH  /api/access {email,role}      → change a member's role
//   PATCH  /api/access {email,password}  → reset a member's password
//   DELETE /api/access?email=…           → revoke access (and their sessions)
//
// Every mutation returns the full updated list so the client renders from the
// server's answer rather than guessing what its own edit did.

function fromStore(result: StoreResult) {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ members: result.members, persistent: isPersistent() });
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function parseEmail(body: Record<string, unknown>) {
  const email = normaliseEmail(typeof body.email === "string" ? body.email : "");
  if (!email) return { error: "Enter an email address." as const };
  if (!isValidEmail(email)) return { error: `"${email}" is not a valid email address.` as const };
  return { email };
}

export async function GET() {
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = guard.viewer.role === "admin";
  return NextResponse.json({
    members: await listMembers(),
    viewer: guard.viewer,
    authEnabled: AUTH_ENABLED,
    persistent: isPersistent(),
    events: admin && AUTH_ENABLED ? await listLoginEvents(50) : null,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireCapability("manage_access");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await readBody(req);
  const parsed = parseEmail(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isRole(body.role)) return NextResponse.json({ error: "Choose a role." }, { status: 400 });
  const password = typeof body.password === "string" ? body.password : "";
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // With sign-in off locally we do not know who is actually sitting at the
  // dashboard, so record nothing rather than attributing the grant to the
  // placeholder admin — that would read as a real audit trail and isn't one.
  const actor = guard.viewer.simulated ? null : guard.viewer.email;
  return fromStore(await addMember(parsed.email, body.role, actor, hashPassword(password)));
}

export async function PATCH(req: NextRequest) {
  const guard = await requireCapability("manage_access");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await readBody(req);
  const parsed = parseEmail(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (typeof body.password === "string") {
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const result = await setPassword(parsed.email, hashPassword(body.password));
    // A reset password means the old sessions are no longer trusted.
    if (result.ok) await revokeAllSessions(parsed.email);
    return fromStore(result);
  }

  if (!isRole(body.role)) return NextResponse.json({ error: "Choose a role." }, { status: 400 });
  return fromStore(await setRole(parsed.email, body.role));
}

export async function DELETE(req: NextRequest) {
  const guard = await requireCapability("manage_access");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Email travels as a query parameter, not a path segment: an address in a URL
  // path needs encoding for its @ and dots, and every caller gets that wrong once.
  const email = normaliseEmail(req.nextUrl.searchParams.get("email") ?? "");
  if (!email) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });

  const result = await removeMember(email);
  if (result.ok) await revokeAllSessions(email); // cascade covers it too; belt and braces
  return fromStore(result);
}
