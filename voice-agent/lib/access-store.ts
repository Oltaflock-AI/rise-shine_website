// Where the team list lives: the `dashboard_access` table in the main site's
// Supabase project (migration 0013), read and written with the service-role
// key. SERVER ONLY — reach this file through /api/access or session.ts.
//
// This replaced the git-ignored .data/access.json file when the dashboard
// moved onto Vercel (admin.riseandshinetravel.in): a serverless filesystem is
// ephemeral, and a team list that silently resets on a cold start is worse
// than none. Every caller is written against the five exported functions, so
// nothing above this file changed.
//
// Nothing here authenticates anybody. It answers "what may this email do",
// not "is this really them" — that is sign-in's job (see session.ts).

import {
  isRole,
  normaliseEmail,
  type AccessMember,
  type Role,
} from "./access";
import { serviceClient } from "./supabase";

// Bootstrap admins, comma-separated. Without at least one, the very first
// person to open the dashboard could never be granted access by anyone.
const SEED_ENV = "DASHBOARD_ADMIN_EMAILS";
const TABLE = "dashboard_access";

// The storage seam. Production uses Supabase; tests inject a memory copy so
// the last-admin and duplicate rules are pinned without a network.
export interface AccessDb {
  all(): Promise<AccessMember[]>;
  insert(m: AccessMember): Promise<void>;
  update(email: string, role: Role): Promise<void>;
  remove(email: string): Promise<void>;
}

function supabaseDb(): AccessDb {
  const sb = serviceClient();
  const fail = (op: string, message: string): never => {
    throw new Error(`${TABLE} ${op} failed: ${message}`);
  };
  return {
    async all() {
      const { data, error } = await sb
        .from(TABLE)
        .select("email, role, added_at, added_by");
      if (error) fail("read", error.message);
      const out: AccessMember[] = [];
      for (const row of data ?? []) {
        const email = normaliseEmail(row.email);
        if (!email || !isRole(row.role)) continue; // never let a bad row take the dashboard down
        out.push({
          email,
          role: row.role,
          addedAt: row.added_at,
          addedBy: row.added_by,
        });
      }
      return out;
    },
    async insert(m) {
      const { error } = await sb.from(TABLE).insert({
        email: m.email,
        role: m.role,
        added_at: m.addedAt,
        added_by: m.addedBy,
      });
      if (error) fail("insert", error.message);
    },
    async update(email, role) {
      const { error } = await sb.from(TABLE).update({ role }).eq("email", email);
      if (error) fail("update", error.message);
    },
    async remove(email) {
      const { error } = await sb.from(TABLE).delete().eq("email", email);
      if (error) fail("delete", error.message);
    },
  };
}

let dbOverride: AccessDb | null = null;

/** Test seam only. Pass null to restore the Supabase-backed store. */
export function __setDbForTests(db: AccessDb | null): void {
  dbOverride = db;
  seeded = false;
}

function db(): AccessDb {
  return dbOverride ?? supabaseDb();
}

// The list is durable now — kept only because /api/access reports it.
export function isPersistent(): boolean {
  return true;
}

function seedMembers(): AccessMember[] {
  const now = new Date().toISOString();
  return (process.env[SEED_ENV] ?? "")
    .split(",")
    .map(normaliseEmail)
    .filter(Boolean)
    .map((email) => ({ email, role: "admin" as Role, addedAt: now, addedBy: null }));
}

// Seed once per process: an empty table gets the bootstrap admins written in,
// so they are visible in the table from day one (mirrors the old file seed).
let seeded = false;

async function load(): Promise<AccessMember[]> {
  const store = db();
  let members = await store.all();
  if (!seeded && members.length === 0) {
    for (const m of seedMembers()) {
      await store.insert(m);
    }
    members = await store.all();
  }
  seeded = true;
  return members;
}

// Mutations are serialised: two overlapping requests would otherwise both read
// the list and the last-admin check would race.
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export type StoreResult =
  | { ok: true; members: AccessMember[] }
  | { ok: false; error: string };

function sorted(members: AccessMember[]): AccessMember[] {
  return [...members].sort((a, b) => a.email.localeCompare(b.email));
}

function countAdmins(members: AccessMember[]): number {
  return members.filter((m) => m.role === "admin").length;
}

export async function listMembers(): Promise<AccessMember[]> {
  return sorted(await load());
}

export async function roleFor(email: string): Promise<Role | null> {
  const target = normaliseEmail(email);
  const found = (await load()).find((m) => m.email === target);
  return found?.role ?? null;
}

export async function addMember(
  email: string,
  role: Role,
  actor: string | null,
): Promise<StoreResult> {
  const target = normaliseEmail(email);
  return serial(async () => {
    const members = await load();
    if (members.some((m) => m.email === target)) {
      return { ok: false, error: `${target} already has access.` };
    }
    const member: AccessMember = {
      email: target,
      role,
      addedAt: new Date().toISOString(),
      addedBy: actor,
    };
    await db().insert(member);
    return { ok: true, members: sorted([...members, member]) };
  });
}

export async function setRole(email: string, role: Role): Promise<StoreResult> {
  const target = normaliseEmail(email);
  return serial(async () => {
    const members = await load();
    const current = members.find((m) => m.email === target);
    if (!current) return { ok: false, error: `${target} does not have access.` };
    if (current.role === role) return { ok: true, members: sorted(members) };
    if (current.role === "admin" && role !== "admin" && countAdmins(members) === 1) {
      return { ok: false, error: "This is the only admin. Promote someone else first." };
    }
    await db().update(target, role);
    const next = members.map((m) => (m.email === target ? { ...m, role } : m));
    return { ok: true, members: sorted(next) };
  });
}

export async function removeMember(email: string): Promise<StoreResult> {
  const target = normaliseEmail(email);
  return serial(async () => {
    const members = await load();
    const current = members.find((m) => m.email === target);
    if (!current) return { ok: false, error: `${target} does not have access.` };
    if (current.role === "admin" && countAdmins(members) === 1) {
      return { ok: false, error: "This is the only admin. Promote someone else first." };
    }
    await db().remove(target);
    return { ok: true, members: sorted(members.filter((m) => m.email !== target)) };
  });
}
