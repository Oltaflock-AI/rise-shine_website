import { describe, expect, it } from "vitest";
import { missingRequiredEnv, probeConfig, REQUIRED_ENV } from "../src/lib/health-probe";

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
