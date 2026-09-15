import { describe, expect, it } from "vitest";
import {
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  RENDERED_AT_FIELD,
  screenFormFields,
} from "../src/lib/bot-guard";

/**
 * The form-spam screen. Too loose and the agency inbox fills and the AI agent
 * cold-calls strangers again; too tight and a real enquiry is silently dropped.
 */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const NOW = 1_800_000_000_000;

describe("screenFormFields", () => {
  it("passes a person who took a while and left the honeypot alone", () => {
    const fd = form({ name: "Patel Hardik", [RENDERED_AT_FIELD]: String(NOW - 20_000) });
    expect(screenFormFields(fd, NOW)).toEqual({ bot: false });
  });

  it("passes exactly at the minimum fill time", () => {
    const fd = form({ [RENDERED_AT_FIELD]: String(NOW - MIN_FILL_MS) });
    expect(screenFormFields(fd, NOW)).toEqual({ bot: false });
  });

  it("trips on a filled honeypot even when timing looks human", () => {
    const fd = form({
      [HONEYPOT_FIELD]: "https://example.com",
      [RENDERED_AT_FIELD]: String(NOW - 30_000),
    });
    expect(screenFormFields(fd, NOW)).toMatchObject({ bot: true, reason: "honeypot" });
  });

  it("ignores whitespace in the honeypot — an autofill artefact, not a bot", () => {
    const fd = form({ [HONEYPOT_FIELD]: "  ", [RENDERED_AT_FIELD]: String(NOW - 30_000) });
    expect(screenFormFields(fd, NOW)).toEqual({ bot: false });
  });

  it("trips when the form was posted without our JS ever setting a timestamp", () => {
    expect(screenFormFields(form({ name: "x" }), NOW)).toMatchObject({
      bot: true,
      reason: "no-timestamp",
    });
  });

  it("trips on a submission faster than a person can type", () => {
    const fd = form({ [RENDERED_AT_FIELD]: String(NOW - 800) });
    expect(screenFormFields(fd, NOW)).toMatchObject({ bot: true, reason: "too-fast:800ms" });
  });

  it("trips on a garbage or forged timestamp", () => {
    expect(screenFormFields(form({ [RENDERED_AT_FIELD]: "yesterday" }), NOW)).toMatchObject({
      bot: true,
      reason: "bad-timestamp",
    });
    // A day-old page is a replayed request, not a tab someone left open.
    expect(
      screenFormFields(form({ [RENDERED_AT_FIELD]: String(NOW - 25 * 3_600_000) }), NOW),
    ).toMatchObject({ bot: true, reason: "stale-timestamp" });
    // A timestamp from the future is forged.
    expect(
      screenFormFields(form({ [RENDERED_AT_FIELD]: String(NOW + 60_000) }), NOW),
    ).toMatchObject({ bot: true });
  });
});
