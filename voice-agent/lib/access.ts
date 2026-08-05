// The dashboard's access-control vocabulary: who may be on the team and what
// each role is allowed to do.
//
// This file is imported by BOTH the server (API routes, the store) and client
// components, so it must stay free of Node APIs, secrets, and I/O. Anything that
// touches the filesystem belongs in access-store.ts.

export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export interface AccessMember {
  email: string;
  role: Role;
  addedAt: string; // ISO 8601, UTC
  addedBy: string | null; // email of the admin who granted access
}

/**
 * Capabilities, not pages. Roles are checked against what someone is trying to
 * DO, so adding a feature means granting a capability rather than re-auditing
 * every role check.
 *
 * `manage_leads` currently gates nothing: the dashboard has been read-only since
 * the submit form and outbound-call route were removed on 2026-07-31. It exists
 * so lead actions land on an already-enforced permission instead of arriving
 * ungated. Do not treat "editor" as a tested privilege boundary until something
 * actually uses it.
 */
export type Capability = "view" | "manage_leads" | "manage_access";

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  viewer: ["view"],
  editor: ["view", "manage_leads"],
  admin: ["view", "manage_leads", "manage_access"],
};

export function can(role: Role | null, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[role].includes(capability);
}

export const ROLE_INFO: Record<Role, { label: string; blurb: string }> = {
  viewer: {
    label: "Viewer",
    blurb: "Can read calls, transcripts and leads. Cannot change anything.",
  },
  editor: {
    label: "Editor",
    blurb: "Everything a viewer can do, plus lead actions once those ship.",
  },
  admin: {
    label: "Admin",
    blurb: "Everything an editor can do, plus managing who has access.",
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Emails are the identity key, so they are compared case-insensitively and
// stored in one canonical form. Otherwise Priya@… and priya@… become two people.
export function normaliseEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
