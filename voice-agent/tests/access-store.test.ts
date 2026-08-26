import { beforeEach, describe, expect, it } from "vitest";
import type { AccessMember, Role } from "@/lib/access";
import {
  __setDbForTests,
  addMember,
  listMembers,
  removeMember,
  roleFor,
  setRole,
  type AccessDb,
} from "@/lib/access-store";

function memoryDb(rows: AccessMember[] = []): AccessDb {
  const data = [...rows];
  return {
    async all() {
      return [...data];
    },
    async insert(m) {
      data.push(m);
    },
    async update(email, role: Role) {
      const row = data.find((r) => r.email === email);
      if (row) row.role = role;
    },
    async remove(email) {
      const i = data.findIndex((r) => r.email === email);
      if (i >= 0) data.splice(i, 1);
    },
  };
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
    __setDbForTests(null);
  });

  it("seeds bootstrap admins into an empty table", async () => {
    process.env.DASHBOARD_ADMIN_EMAILS = "Boss@Rise.IN";
    const db = memoryDb();
    __setDbForTests(db);
    const members = await listMembers();
    expect(members).toHaveLength(1);
    expect(members[0].email).toBe("boss@rise.in");
    expect(members[0].role).toBe("admin");
    expect(await db.all()).toHaveLength(1); // seed was written, not just returned
  });

  it("matches roleFor case-insensitively", async () => {
    __setDbForTests(memoryDb([admin]));
    expect(await roleFor("BOSS@rise.in")).toBe("admin");
    expect(await roleFor("stranger@rise.in")).toBeNull();
  });

  it("rejects a duplicate grant", async () => {
    __setDbForTests(memoryDb([admin]));
    const r = await addMember("Boss@Rise.in", "viewer", "boss@rise.in");
    expect(r.ok).toBe(false);
  });

  it("refuses to demote the last admin", async () => {
    __setDbForTests(memoryDb([admin]));
    const r = await setRole("boss@rise.in", "viewer");
    expect(r.ok).toBe(false);
  });

  it("refuses to remove the last admin", async () => {
    __setDbForTests(memoryDb([admin]));
    const r = await removeMember("boss@rise.in");
    expect(r.ok).toBe(false);
  });

  it("adds, re-roles and removes a member", async () => {
    __setDbForTests(
      memoryDb([admin, { ...admin, email: "second@rise.in", role: "admin" }]),
    );
    const added = await addMember("New@Rise.in", "viewer", "boss@rise.in");
    expect(added.ok).toBe(true);
    expect(await roleFor("new@rise.in")).toBe("viewer");
    const rerole = await setRole("new@rise.in", "editor");
    expect(rerole.ok).toBe(true);
    const removed = await removeMember("second@rise.in"); // fine: boss remains admin
    expect(removed.ok).toBe(true);
    expect(await roleFor("second@rise.in")).toBeNull();
  });
});
