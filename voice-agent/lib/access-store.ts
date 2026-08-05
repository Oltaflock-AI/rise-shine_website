// Where the team list lives.
//
// SERVER ONLY — never import this from a client component. (There is no
// `server-only` package installed here to enforce that at build time, so the
// rule is a convention: reach this file through /api/access.)
//
// There is deliberately no database. The dashboard is excluded from the
// website's Vercel deploy (`.vercelignore`) and is run locally by the sales
// team, so a JSON file is an honest match for how it is used today. When real
// sign-in and a persistent database arrive, replace the four exported functions
// below with queries — every caller is written against them, not against the file.
//
// LIMITS, stated plainly:
//   - The list survives a restart, but only on the machine that holds the file.
//   - If this is ever deployed to a serverless host, the filesystem is ephemeral
//     and read-only; writes fall back to memory and are lost on the next cold
//     start. `isPersistent()` reports which mode is live and the UI surfaces it.
//   - Nothing here authenticates anybody. It answers "what may this email do",
//     not "is this really them" — that is sign-in's job (see session.ts).

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isRole,
  normaliseEmail,
  type AccessMember,
  type Role,
} from "./access";

const FILE = path.join(process.cwd(), ".data", "access.json");

// Bootstrap admins, comma-separated. Without at least one, the very first person
// to open the dashboard could never be granted access by anyone.
const SEED_ENV = "DASHBOARD_ADMIN_EMAILS";

let cache: AccessMember[] | null = null;
let persistent = true;

export function isPersistent(): boolean {
  return persistent;
}

function seedMembers(): AccessMember[] {
  const now = new Date().toISOString();
  return (process.env[SEED_ENV] ?? "")
    .split(",")
    .map(normaliseEmail)
    .filter(Boolean)
    .map((email) => ({ email, role: "admin" as Role, addedAt: now, addedBy: null }));
}

// Never trust the file: it is hand-editable, and a bad row must not take the
// dashboard down. Drop anything that doesn't parse rather than throwing.
function sanitise(raw: unknown): AccessMember[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AccessMember[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const email = normaliseEmail(typeof row.email === "string" ? row.email : "");
    if (!email || seen.has(email) || !isRole(row.role)) continue;
    seen.add(email);
    out.push({
      email,
      role: row.role,
      addedAt: typeof row.addedAt === "string" ? row.addedAt : new Date(0).toISOString(),
      addedBy: typeof row.addedBy === "string" ? row.addedBy : null,
    });
  }
  return out;
}

async function load(): Promise<AccessMember[]> {
  if (cache) return cache;
  try {
    cache = sanitise(JSON.parse(await fs.readFile(FILE, "utf8")));
  } catch {
    // No file yet (or unreadable): start from the env seed and try to write it
    // out, so the bootstrap admins are visible in the file from day one.
    cache = seedMembers();
    await persist(cache);
  }
  return cache;
}

async function persist(members: AccessMember[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(members, null, 2) + "\n", "utf8");
    persistent = true;
  } catch {
    // Read-only filesystem. Keep serving from memory rather than failing the
    // request, but stop claiming the change is durable.
    persistent = false;
  }
}

// Mutations are serialised. Two overlapping requests would otherwise both read
// the list, both edit their own copy, and the second write would silently erase
// the first.
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
    const next = [
      ...members,
      { email: target, role, addedAt: new Date().toISOString(), addedBy: actor },
    ];
    cache = next;
    await persist(next);
    return { ok: true, members: sorted(next) };
  });
}

export async function setRole(email: string, role: Role): Promise<StoreResult> {
  const target = normaliseEmail(email);
  return serial(async () => {
    const members = await load();
    const current = members.find((m) => m.email === target);
    if (!current) return { ok: false, error: `${target} does not have access.` };
    if (current.role === role) return { ok: true, members: sorted(members) };
    // Demoting the last admin would leave nobody able to manage access — the
    // list could then never be changed again from inside the dashboard.
    if (current.role === "admin" && role !== "admin" && countAdmins(members) === 1) {
      return { ok: false, error: "This is the only admin. Promote someone else first." };
    }
    const next = members.map((m) => (m.email === target ? { ...m, role } : m));
    cache = next;
    await persist(next);
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
    const next = members.filter((m) => m.email !== target);
    cache = next;
    await persist(next);
    return { ok: true, members: sorted(next) };
  });
}

function countAdmins(members: AccessMember[]): number {
  return members.filter((m) => m.role === "admin").length;
}
