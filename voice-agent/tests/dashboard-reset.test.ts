import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_ACTIVE_REQUESTS,
  RESET_TTL_MS,
  checkResetRow,
  resetLink,
  resetTtlMinutes,
  resetVerdictMessage,
  tooManyOutstanding,
  type ResetRow,
} from "@/lib/dashboard-reset";

const NOW = new Date("2026-09-07T10:00:00.000Z");

function row(over: Partial<ResetRow> = {}): ResetRow {
  return {
    email: "someone@example.com",
    expires_at: new Date(NOW.getTime() + RESET_TTL_MS).toISOString(),
    used_at: null,
    ...over,
  };
}

describe("checkResetRow", () => {
  it("accepts an unused token inside its window", () => {
    expect(checkResetRow(row(), NOW)).toBe("ok");
  });

  it("refuses a token that was never issued", () => {
    expect(checkResetRow(null, NOW)).toBe("unknown");
  });

  it("refuses a token that has already been spent", () => {
    expect(checkResetRow(row({ used_at: NOW.toISOString() }), NOW)).toBe("used");
  });

  it("refuses a token at the exact moment it expires", () => {
    // The boundary belongs to the past: expires_at is when the link stops
    // working, not the last instant it does.
    expect(checkResetRow(row({ expires_at: NOW.toISOString() }), NOW)).toBe("expired");
  });

  it("refuses a lapsed token even though it was never used", () => {
    const stale = new Date(NOW.getTime() - 1000).toISOString();
    expect(checkResetRow(row({ expires_at: stale }), NOW)).toBe("expired");
  });
});

describe("resetVerdictMessage", () => {
  it("says the same thing for every failure", () => {
    // Unknown / used / expired are three different facts about somebody's
    // account. Telling them apart would turn the reset page into an oracle.
    const messages = new Set(
      (["unknown", "used", "expired"] as const).map(resetVerdictMessage),
    );
    expect(messages.size).toBe(1);
    expect([...messages][0]).not.toBe("");
  });

  it("has nothing to say when the link is good", () => {
    expect(resetVerdictMessage("ok")).toBe("");
  });
});

describe("tooManyOutstanding", () => {
  it("allows requests below the cap and refuses at it", () => {
    expect(tooManyOutstanding(MAX_ACTIVE_REQUESTS - 1)).toBe(false);
    expect(tooManyOutstanding(MAX_ACTIVE_REQUESTS)).toBe(true);
    expect(tooManyOutstanding(MAX_ACTIVE_REQUESTS + 1)).toBe(true);
  });
});

describe("resetLink", () => {
  const original = process.env.DASHBOARD_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.DASHBOARD_URL;
    else process.env.DASHBOARD_URL = original;
  });

  it("falls back to the production dashboard when unset", () => {
    delete process.env.DASHBOARD_URL;
    expect(resetLink("abc")).toBe("https://admin.riseandshinetravel.com/reset?token=abc");
  });

  it("does not double the slash when the configured URL has a trailing one", () => {
    process.env.DASHBOARD_URL = "https://admin.example.com/";
    expect(resetLink("abc")).toBe("https://admin.example.com/reset?token=abc");
  });

  it("escapes a token so base64url padding cannot break the query", () => {
    process.env.DASHBOARD_URL = "https://admin.example.com";
    expect(resetLink("a+b/c=")).toBe("https://admin.example.com/reset?token=a%2Bb%2Fc%3D");
  });
});

describe("resetTtlMinutes", () => {
  it("matches the TTL the email promises", () => {
    expect(resetTtlMinutes()).toBe(RESET_TTL_MS / 60000);
  });
});
