import { beforeEach, describe, expect, it } from "vitest";
import type { AccessMember, Role } from "@/lib/access";
import {
  __setDbForTests,
  addMember,
  listMembers,
  removeMember,
  roleFor,
  setPassword,
  setRole,
  type AccessDb,
} from "@/lib/access-store";

interface Row extends AccessMember {
  hash: string;
}

function memoryDb(rows: AccessMember[] = []) {
  const data: Row[] = rows.map((r) => ({ ...r, hash: "seeded" }));
  const db: AccessDb = {
    async all() {
      return data.map(({ hash: _hash, ...m }) => m);
    },
    async insert(m, passwordHash) {
      data.push({ ...m, hash: passwordHash });
    },
    async update(email, role: Role) {
      const row = data.find((r) => r.email === email);
      if (row) row.role = role;
    },
    async updatePassword(email, passwordHash) {
      const row = data.find((r) => r.email === email);
      if (row) row.hash = passwordHash;
    },
    async remove(email) {
      const i = data.findIndex((r) => r.email === email);
      if (i >= 0) data.splice(i, 1);
    },
  };
  return { db, data };
}

const admin: AccessMember = {
  email: "boss@rise.in",
  role: "admin",
  addedAt: "2026-08-26T00:00:00.000Z",
  addedBy: null,
};

describe("access-store on a database", () => {
  beforeEach(() => {
    delete process.env.DASHBOARD_ADMIN_EMAILS;
    delete process.env.DASHBOARD_ADMIN_PASSWORD;
    __setDbForTests(null);
  });

  it("seeds bootstrap admins with a hashed bootstrap password", async () => {
    process.env.DASHBOARD_ADMIN_EMAILS = "Boss@Rise.IN";
    process.env.DASHBOARD_ADMIN_PASSWORD = "bootstrap-password";
    const { db, data } = memoryDb();
    __setDbForTests(db);
    const members = await listMembers();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ email: "boss@rise.in", role: "admin" });
    expect(data[0].hash.startsWith("scrypt$")).toBe(true); // hashed, never the plain text
  });

  it("does not seed an account that could never sign in", async () => {
    process.env.DASHBOARD_ADMIN_EMAILS = "boss@rise.in"; // no password env
    const { db } = memoryDb();
    __setDbForTests(db);
    expect(await listMembers()).toHaveLength(0);
  });

  it("matches roleFor case-insensitively", async () => {
    __setDbForTests(memoryDb([admin]).db);
    expect(await roleFor("BOSS@rise.in")).toBe("admin");
    expect(await roleFor("stranger@rise.in")).toBeNull();
  });

  it("rejects a duplicate grant", async () => {
    __setDbForTests(memoryDb([admin]).db);
    const r = await addMember("Boss@Rise.in", "viewer", "boss@rise.in", "scrypt$x$y");
    expect(r.ok).toBe(false);
  });

  it("refuses to demote the last admin", async () => {
    __setDbForTests(memoryDb([admin]).db);
    expect((await setRole("boss@rise.in", "viewer")).ok).toBe(false);
  });

  it("refuses to remove the last admin", async () => {
    __setDbForTests(memoryDb([admin]).db);
    expect((await removeMember("boss@rise.in")).ok).toBe(false);
  });

  it("adds, re-roles, resets a password and removes a member", async () => {
    const { db, data } = memoryDb([admin, { ...admin, email: "second@rise.in" }]);
    __setDbForTests(db);
    expect((await addMember("New@Rise.in", "viewer", "boss@rise.in", "scrypt$a$b")).ok).toBe(true);
    expect(await roleFor("new@rise.in")).toBe("viewer");
    expect((await setRole("new@rise.in", "editor")).ok).toBe(true);
    expect((await setPassword("new@rise.in", "scrypt$c$d")).ok).toBe(true);
    expect(data.find((r) => r.email === "new@rise.in")?.hash).toBe("scrypt$c$d");
    expect((await setPassword("ghost@rise.in", "scrypt$c$d")).ok).toBe(false);
    expect((await removeMember("second@rise.in")).ok).toBe(true); // boss remains admin
    expect(await roleFor("second@rise.in")).toBeNull();
  });
});
