// "Forgot password?" for the dashboard's own sign-in. SERVER ONLY.
//
// A reset is a second way into an account, so it is held to the same rules as
// the password itself (dashboard-auth.ts):
//
//   · Only the sha256 of the token is stored. The raw token lives in the
//     emailed link and nowhere else — same rule as dashboard_sessions.
//   · Requesting a reset NEVER reveals whether an email has an account. The
//     route answers identically either way; only a real, active account gets
//     mail. Otherwise this becomes the account-enumeration oracle that the
//     shared "Wrong email or password" message exists to prevent.
//   · A token is single-use, expires in RESET_TTL_MS, and redeeming one
//     revokes every session for the account: a reset is what you reach for when
//     you fear someone else is in, so it must log that someone else out.
//   · Redeeming clears failed_attempts and locked_until (see
//     access-store.updatePassword) — a locked-out person resetting their
//     password is the whole point, and leaving the lock would strand them.
//   · MAX_ACTIVE_REQUESTS caps outstanding links per account so the form
//     cannot be used to flood someone's inbox.

import { createHash, randomBytes } from "node:crypto";
import { normaliseEmail } from "./access";
import { setPassword } from "./access-store";
import { hashPassword, revokeAllSessions, type RequestMeta } from "./dashboard-auth";
import { serviceClient } from "./supabase";

export const RESET_TTL_MS = 45 * 60 * 1000;
export const MAX_ACTIVE_REQUESTS = 3;
const TABLE = "dashboard_password_resets";

export function resetTtlMinutes(): number {
  return Math.round(RESET_TTL_MS / 60000);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── The pure decisions (unit-tested; no network) ────────────────────────────

export interface ResetRow {
  email: string;
  expires_at: string;
  used_at: string | null;
}

export type ResetVerdict = "ok" | "unknown" | "used" | "expired";

/** Whether a stored reset row may still be redeemed. */
export function checkResetRow(row: ResetRow | null, now: Date): ResetVerdict {
  if (!row) return "unknown";
  if (row.used_at) return "used";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "ok";
}

/**
 * Every failure reads the same to the visitor. A token that was never issued,
 * one already spent and one that lapsed are three different facts about
 * somebody's account, and none of them is the visitor's business.
 */
export function resetVerdictMessage(verdict: ResetVerdict): string {
  return verdict === "ok"
    ? ""
    : "This reset link is no longer valid. Ask for a new one on the sign-in page.";
}

/** True when the account already has as many live links as it is allowed. */
export function tooManyOutstanding(activeCount: number): boolean {
  return activeCount >= MAX_ACTIVE_REQUESTS;
}

/**
 * Where the emailed link points. Taken from configuration, never from the
 * request's Host header: an attacker who can set Host would otherwise have the
 * reset token delivered to a domain of their choosing.
 */
export function resetLink(token: string): string {
  const base = (process.env.DASHBOARD_URL || "https://admin.riseandshinetravel.in").replace(/\/+$/, "");
  return `${base}/reset?token=${encodeURIComponent(token)}`;
}

// ── The database side ──────────────────────────────────────────────────────

/** An account that may be sent a reset link, or null. Deactivated accounts are not. */
async function activeAccount(email: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("dashboard_users")
    .select("email, is_active")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`dashboard_users read failed: ${error.message}`);
  return Boolean(data?.is_active);
}

async function outstandingCount(email: string, now: Date): Promise<number> {
  const { count, error } = await serviceClient()
    .from(TABLE)
    .select("token_hash", { count: "exact", head: true })
    .eq("email", email)
    .is("used_at", null)
    .gt("expires_at", now.toISOString());
  if (error) throw new Error(`${TABLE} read failed: ${error.message}`);
  return count ?? 0;
}

export type IssueResult =
  | { issued: true; token: string }
  /** No mail goes out. The route still answers as though it did. */
  | { issued: false; why: "no_account" | "throttled" };

/**
 * Mint a reset token for an account. The caller emails it; nothing here tells
 * the visitor which branch was taken.
 */
export async function issueReset(rawEmail: string, meta: RequestMeta): Promise<IssueResult> {
  const email = normaliseEmail(rawEmail);
  const now = new Date();
  if (!email || !(await activeAccount(email))) return { issued: false, why: "no_account" };
  if (tooManyOutstanding(await outstandingCount(email, now))) {
    return { issued: false, why: "throttled" };
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await serviceClient().from(TABLE).insert({
    token_hash: tokenHash(token),
    email,
    expires_at: new Date(now.getTime() + RESET_TTL_MS).toISOString(),
    ip: meta.ip,
    user_agent: meta.userAgent,
  });
  if (error) throw new Error(`${TABLE} insert failed: ${error.message}`);
  return { issued: true, token };
}

async function readReset(token: string): Promise<ResetRow | null> {
  if (!token) return null;
  const { data, error } = await serviceClient()
    .from(TABLE)
    .select("email, expires_at, used_at")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (error) throw new Error(`${TABLE} read failed: ${error.message}`);
  return (data as ResetRow | null) ?? null;
}

/** Is this link still worth showing a password form for? */
export async function inspectReset(token: string): Promise<ResetVerdict> {
  return checkResetRow(await readReset(token), new Date());
}

export type RedeemResult =
  | { ok: true; email: string }
  | { ok: false; status: 400 | 410; error: string };

/**
 * Spend a token and set the new password. The token is consumed FIRST, with the
 * "still unused" condition in the UPDATE itself, so two clicks on the same link
 * cannot both pass the check and race to set different passwords.
 */
export async function redeemReset(token: string, password: string): Promise<RedeemResult> {
  const now = new Date();
  const row = await readReset(token);
  const verdict = checkResetRow(row, now);
  if (verdict !== "ok" || !row) return { ok: false, status: 410, error: resetVerdictMessage(verdict) };

  const sb = serviceClient();
  const { data: claimed, error: claimErr } = await sb
    .from(TABLE)
    .update({ used_at: now.toISOString() })
    .eq("token_hash", tokenHash(token))
    .is("used_at", null)
    .select("email")
    .maybeSingle();
  if (claimErr) throw new Error(`${TABLE} claim failed: ${claimErr.message}`);
  if (!claimed) return { ok: false, status: 410, error: resetVerdictMessage("used") };

  // updatePassword also clears failed_attempts and locked_until, which is what
  // lets a locked-out account back in.
  const stored = await setPassword(row.email, hashPassword(password));
  if (!stored.ok) return { ok: false, status: 400, error: stored.error };

  // Any other link for this account dies with the one just spent.
  await sb.from(TABLE).update({ used_at: now.toISOString() }).eq("email", row.email).is("used_at", null);
  await revokeAllSessions(row.email);
  return { ok: true, email: row.email };
}

/** Record a reset step next to the sign-in attempts, so the audit is in one place. */
export async function logResetEvent(
  email: string,
  reason: "reset_requested" | "reset_done",
  meta: RequestMeta,
): Promise<void> {
  await serviceClient().from("dashboard_login_events").insert({
    email: normaliseEmail(email),
    ok: true,
    reason,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });
}
