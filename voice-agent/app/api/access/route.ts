import { NextRequest, NextResponse } from "next/server";
import { isRole, isValidEmail, normaliseEmail } from "@/lib/access";
import {
  addMember,
  isPersistent,
  listMembers,
  removeMember,
  setRole,
  type StoreResult,
} from "@/lib/access-store";
import { AUTH_ENABLED, requireCapability } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Team access: who may open this dashboard and what they may do.
//
//   GET    /api/access              → the list, plus who the caller is
//   POST   /api/access              → grant access to a new email
//   PATCH  /api/access              → change an existing member's role
//   DELETE /api/access?email=…      → revoke access
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

// Shared parsing for POST and PATCH: both carry { email, role }.
function parseMember(body: Record<string, unknown>) {
  const email = normaliseEmail(typeof body.email === "string" ? body.email : "");
  if (!email) return { error: "Enter an email address." as const };
  if (!isValidEmail(email)) return { error: `"${email}" is not a valid email address.` as const };
  if (!isRole(body.role)) return { error: "Choose a role." as const };
  return { email, role: body.role };
}

export async function GET() {
  const guard = await requireCapability("view");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  return NextResponse.json({
    members: await listMembers(),
    viewer: guard.viewer,
    authEnabled: AUTH_ENABLED,
    persistent: isPersistent(),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireCapability("manage_access");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const parsed = parseMember(await readBody(req));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // With sign-in stubbed out we do not know who is actually sitting at the
  // dashboard, so record nothing rather than attributing the grant to the
  // placeholder admin — that would read as a real audit trail and isn't one.
  const actor = guard.viewer.simulated ? null : guard.viewer.email;
  return fromStore(await addMember(parsed.email, parsed.role, actor));
}

export async function PATCH(req: NextRequest) {
  const guard = await requireCapability("manage_access");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const parsed = parseMember(await readBody(req));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return fromStore(await setRole(parsed.email, parsed.role));
}

export async function DELETE(req: NextRequest) {
  const guard = await requireCapability("manage_access");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Email travels as a query parameter, not a path segment: an address in a URL
  // path needs encoding for its @ and dots, and every caller gets that wrong once.
  const email = normaliseEmail(req.nextUrl.searchParams.get("email") ?? "");
  if (!email) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });

  return fromStore(await removeMember(email));
}
