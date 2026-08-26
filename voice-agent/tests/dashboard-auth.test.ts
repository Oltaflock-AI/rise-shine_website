import { describe, expect, it } from "vitest";
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  decideSignIn,
  hashPassword,
  messageFor,
  passwordProblem,
  verifyPassword,
  type CredentialRow,
} from "@/lib/dashboard-auth";

const now = new Date("2026-08-26T12:00:00.000Z");

function row(over: Partial<CredentialRow> = {}): CredentialRow {
  return {
    password_hash: hashPassword("correct horse battery"),
    role: "viewer",
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    ...over,
  };
}

describe("passwords", () => {
  it("round-trips through scrypt and rejects the wrong one", () => {
    const stored = hashPassword("s3cret-enough!");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("s3cret-enough!", stored)).toBe(true);
    expect(verifyPassword("s3cret-enough?", stored)).toBe(false);
    expect(verifyPassword("anything", "garbage")).toBe(false);
  });

  it("enforces a minimum length", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("long enough now")).toBeNull();
  });
});

describe("decideSignIn", () => {
  it("unknown user and wrong password read the same to the caller", () => {
    const unknown = messageFor(decideSignIn(null, "x", now));
    const wrong = messageFor(decideSignIn(row(), "nope", now));
    expect(unknown).toEqual(wrong);
    expect(unknown.status).toBe(401);
  });

  it("a correct password resets the failure counter", () => {
    const d = decideSignIn(row({ failed_attempts: 3 }), "correct horse battery", now);
    expect(d.reason).toBe("ok");
    expect(d.failedAttempts).toBe(0);
    expect(d.lockedUntil).toBeNull();
  });

  it("locks after MAX_FAILED_ATTEMPTS wrong passwords", () => {
    const d = decideSignIn(row({ failed_attempts: MAX_FAILED_ATTEMPTS - 1 }), "nope", now);
    expect(d.reason).toBe("wrong_password");
    expect(d.failedAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(d.lockedUntil?.getTime()).toBe(now.getTime() + LOCKOUT_MS);
    expect(messageFor(d).status).toBe(423);
  });

  it("refuses even the right password while locked", () => {
    const until = new Date(now.getTime() + 60_000).toISOString();
    const d = decideSignIn(row({ locked_until: until, failed_attempts: 5 }), "correct horse battery", now);
    expect(d.reason).toBe("locked");
    expect(d.failedAttempts).toBe(5);
  });

  it("lets a lapsed lock through", () => {
    const until = new Date(now.getTime() - 1).toISOString();
    const d = decideSignIn(row({ locked_until: until, failed_attempts: 5 }), "correct horse battery", now);
    expect(d.reason).toBe("ok");
  });

  it("refuses a deactivated account regardless of password", () => {
    const d = decideSignIn(row({ is_active: false }), "correct horse battery", now);
    expect(d.reason).toBe("inactive");
    expect(messageFor(d).status).toBe(401);
  });
});
