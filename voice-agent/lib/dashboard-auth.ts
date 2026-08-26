// The dashboard's OWN sign-in: credentials, sessions and the attempt log, all
// in the dashboard_* tables (migration 0014). SERVER ONLY.
//
// Deliberately not Supabase Auth. That pool is the main site's customer base,
// and a customer account must never be one grant away from the CRM. Nothing
// here can be reached with a customer's password.
//
// Blocking, in order: unknown email and wrong password produce the SAME
// message (no enumeration); MAX_FAILED_ATTEMPTS wrong passwords lock the
// account for LOCKOUT_MS; a deactivated account is refused outright; every
// attempt, either way, is written to dashboard_login_events with its reason.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { normaliseEmail, type Role } from "./access";
import { serviceClient } from "./supabase";

export const SESSION_COOKIE = "rs_dash_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

// ── Passwords (scrypt, Node built-in — no dependency to keep patched) ────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// ── The sign-in decision (pure, so the lockout rules are unit-tested) ───────

export type SignInReason = "ok" | "unknown_user" | "wrong_password" | "locked" | "inactive";

export interface CredentialRow {
  password_hash: string;
  role: Role;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
}

export interface SignInDecision {
  reason: SignInReason;
  /** What failed_attempts / locked_until should become for this account. */
  failedAttempts: number;
  lockedUntil: Date | null;
}

export function decideSignIn(
  row: CredentialRow | null,
  password: string,
  now: Date,
): SignInDecision {
  if (!row) return { reason: "unknown_user", failedAttempts: 0, lockedUntil: null };
  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    return { reason: "locked", failedAttempts: row.failed_attempts, lockedUntil };
  }
  if (!row.is_active) {
    return { reason: "inactive", failedAttempts: row.failed_attempts, lockedUntil: null };
  }
  if (verifyPassword(password, row.password_hash)) {
    return { reason: "ok", failedAttempts: 0, lockedUntil: null };
  }
  const failed = row.failed_attempts + 1;
  return {
    reason: "wrong_password",
    failedAttempts: failed,
    lockedUntil: failed >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null,
  };
}

export function messageFor(decision: SignInDecision): { status: 401 | 423; error: string } {
  if (decision.reason === "locked" || decision.lockedUntil) {
    return { status: 423, error: "Too many failed attempts. This account is locked for 15 minutes." };
  }
  if (decision.reason === "inactive") {
    return { status: 401, error: "This account has been deactivated. Ask an admin." };
  }
  // unknown_user and wrong_password read identically on purpose.
  return { status: 401, error: "Wrong email or password." };
}

// ── Sign in / sessions (database-backed) ────────────────────────────────────

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export type SignInResult =
  | { ok: true; token: string; role: Role }
  | { ok: false; status: 401 | 423; error: string };

export async function signIn(
  rawEmail: string,
  password: string,
  meta: RequestMeta,
): Promise<SignInResult> {
  const email = normaliseEmail(rawEmail);
  const sb = serviceClient();
  const now = new Date();

  const { data, error } = await sb
    .from("dashboard_users")
    .select("password_hash, role, is_active, failed_attempts, locked_until")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`dashboard_users read failed: ${error.message}`);

  const row = (data as CredentialRow | null) ?? null;
  const decision = decideSignIn(row, password, now);

  if (row) {
    const { error: upErr } = await sb
      .from("dashboard_users")
      .update({
        failed_attempts: decision.failedAttempts,
        locked_until: decision.lockedUntil ? decision.lockedUntil.toISOString() : null,
      })
      .eq("email", email);
    if (upErr) throw new Error(`dashboard_users update failed: ${upErr.message}`);
  }

  // The log is written before the answer goes back, so a refused attempt can
  // never be invisible. Failure to log fails the sign-in — deliberately.
  const { error: logErr } = await sb.from("dashboard_login_events").insert({
    email,
    ok: decision.reason === "ok",
    reason: decision.reason,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });
  if (logErr) throw new Error(`dashboard_login_events insert failed: ${logErr.message}`);

  if (decision.reason !== "ok" || !row) return { ok: false, ...messageFor(decision) };

  const token = await createSession(email, meta);
  return { ok: true, token, role: row.role };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(email: string, meta: RequestMeta): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await serviceClient().from("dashboard_sessions").insert({
    token_hash: tokenHash(token),
    email,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    ip: meta.ip,
    user_agent: meta.userAgent,
  });
  if (error) throw new Error(`dashboard_sessions insert failed: ${error.message}`);
  return token;
}

/** The email behind a session cookie, or null if unknown or expired. */
export async function sessionEmail(token: string): Promise<string | null> {
  if (!token) return null;
  const sb = serviceClient();
  const hash = tokenHash(token);
  const { data, error } = await sb
    .from("dashboard_sessions")
    .select("email, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await sb.from("dashboard_sessions").delete().eq("token_hash", hash);
    return null;
  }
  return data.email;
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  await serviceClient().from("dashboard_sessions").delete().eq("token_hash", tokenHash(token));
}

/** Kill every session for an account — after a password change or removal. */
export async function revokeAllSessions(email: string): Promise<void> {
  await serviceClient().from("dashboard_sessions").delete().eq("email", normaliseEmail(email));
}

export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("dashboard_users")
    .select("password_hash")
    .eq("email", normaliseEmail(email))
    .maybeSingle();
  return !!data && verifyPassword(password, data.password_hash);
}

// ── Attempt log ─────────────────────────────────────────────────────────────

export interface LoginEvent {
  id: number;
  email: string;
  ok: boolean;
  reason: SignInReason;
  ip: string | null;
  at: string;
}

export async function listLoginEvents(limit = 50): Promise<LoginEvent[]> {
  const { data, error } = await serviceClient()
    .from("dashboard_login_events")
    .select("id, email, ok, reason, ip, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`dashboard_login_events read failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    ok: r.ok,
    reason: r.reason,
    ip: r.ip,
    at: r.created_at,
  }));
}

export function requestMeta(headers: Headers): RequestMeta {
  const forwarded = headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : headers.get("x-real-ip"),
    userAgent: headers.get("user-agent"),
  };
}
