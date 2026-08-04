// The seam between "who is this person" (sign-in) and "what may they do"
// (access.ts + access-store.ts). SERVER ONLY.
//
// Sign-in is not built yet — management deferred the production authentication
// and database design on 2026-07-31. Rather than leave the permission model
// unwritten until then, the checks are real and enforced today; only the
// identity lookup is stubbed. Turning auth on is a two-line change:
//
//   1. Implement `emailFromSession()` below (read the session cookie / Supabase
//      user / SSO claim and return the verified email).
//   2. Set DASHBOARD_AUTH_ENABLED=true.
//
// Nothing else in the dashboard needs to change.

import { can, type Capability, type Role } from "./access";
import { roleFor } from "./access-store";

export const AUTH_ENABLED = process.env.DASHBOARD_AUTH_ENABLED === "true";

export interface Viewer {
  email: string;
  role: Role;
  /** True when there is no real sign-in and we are standing in as an admin. */
  simulated: boolean;
}

const SIMULATED_ADMIN: Viewer = {
  email: "local-admin@rise-shine.local",
  role: "admin",
  simulated: true,
};

/**
 * The verified email of the signed-in user, or null.
 *
 * THE STUB. It returns null because nothing signs anyone in yet. It deliberately
 * does not read a header or a query parameter — a client-supplied email would be
 * an impersonation hole that looks like a working login.
 */
async function emailFromSession(): Promise<string | null> {
  return null;
}

export async function getViewer(): Promise<Viewer | null> {
  if (!AUTH_ENABLED) {
    // No login screen exists, so the dashboard cannot lock anyone out without
    // locking out everyone. Treat the local operator as an admin and let the UI
    // say so loudly, instead of pretending access is being enforced.
    return SIMULATED_ADMIN;
  }
  const email = await emailFromSession();
  if (!email) return null;

  // Being on the list IS the authorisation. An authenticated stranger who was
  // never added gets nothing.
  const role = await roleFor(email);
  if (!role) return null;
  return { email, role, simulated: false };
}

export type Guard =
  | { ok: true; viewer: Viewer }
  | { ok: false; status: 401 | 403; error: string };

export async function requireCapability(capability: Capability): Promise<Guard> {
  const viewer = await getViewer();
  if (!viewer) {
    return { ok: false, status: 401, error: "You do not have access to this dashboard." };
  }
  if (!can(viewer.role, capability)) {
    return { ok: false, status: 403, error: "Your role does not allow this action." };
  }
  return { ok: true, viewer };
}
