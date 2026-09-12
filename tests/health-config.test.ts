import { describe, expect, it } from "vitest";
import { missingRequiredEnv, probeConfig, probeSupabaseRest, REQUIRED_ENV } from "../src/lib/health-probe";

/**
 * The config check turns "variable quietly unset in Vercel" into a red check.
 * Pinned so the list cannot silently lose the entry that once cost a month of
 * dropped call records (ELEVENLABS_AGENT_ID).
 */
const full = Object.fromEntries(REQUIRED_ENV.map((r) => [r.key, "x"]));

describe("probeConfig", () => {
  it("passes when everything is set in production", () => {
    const r = probeConfig({ ...full, VERCEL_ENV: "production" });
    expect(r.ok).toBe(true);
  });

  it("names each missing variable and what it costs", () => {
    const env = { ...full, VERCEL_ENV: "production", ELEVENLABS_AGENT_ID: "", RESEND_API_KEY: "  " };
    expect(missingRequiredEnv(env).map((m) => m.key)).toEqual(["RESEND_API_KEY", "ELEVENLABS_AGENT_ID"]);
    const r = probeConfig(env);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("ELEVENLABS_AGENT_ID");
    expect(r.detail).toContain("webhook drops every event");
  });

  it("does not judge a preview or local run", () => {
    expect(probeConfig({ VERCEL_ENV: "preview" }).ok).toBe(true);
    expect(probeConfig({}).ok).toBe(true);
  });

  it("still lists the agent id — the one that failed silently before", () => {
    expect(REQUIRED_ENV.some((r) => r.key === "ELEVENLABS_AGENT_ID")).toBe(true);
  });
});

/**
 * A database read that fails is a database fault, never an orphaned payment.
 * Five overnight PostgREST timeouts on 12-Sep-2026 each paged as "Captured
 * payments with no booking" — this pins the split so that label can only
 * ever mean what it says.
 */
describe("probeSupabaseRest", () => {
  const queue = { key: "callback_queue", label: "Callback queue dispatcher", ok: true, detail: "no overdue callbacks" };
  const orphansUnchecked = {
    key: "ledger_orphans",
    label: "Captured payments with no booking",
    ok: true,
    detail: "not checked — ledger read failed: Gateway Timeout (see supabase_rest)",
    dbError: "ledger read failed: Gateway Timeout",
  };

  it("is green when every read worked", () => {
    const r = probeSupabaseRest([queue, { ...orphansUnchecked, dbError: undefined }]);
    expect(r.key).toBe("supabase_rest");
    expect(r.ok).toBe(true);
  });

  it("owns the failure, and the money probe stays green", () => {
    const r = probeSupabaseRest([queue, orphansUnchecked]);
    expect(r.ok).toBe(false);
    expect(r.label).toBe("Supabase database reads");
    expect(r.detail).toContain("ledger_orphans: ledger read failed: Gateway Timeout");
    expect(orphansUnchecked.ok).toBe(true);
  });
});
