import { describe, expect, it } from "vitest";
import { isVisibleCall } from "../lib/call-visibility";

const T = 1_000_000;
const known = new Set(["conv_keep"]);

describe("isVisibleCall", () => {
  it("shows an old conversation only when the CRM still has it", () => {
    expect(isVisibleCall({ conversation_id: "conv_keep", started_at_unix: T - 100 }, known, T)).toBe(true);
    expect(isVisibleCall({ conversation_id: "conv_gone", started_at_unix: T - 100 }, known, T)).toBe(false);
  });
  it("always shows a conversation placed after the clean-up", () => {
    expect(isVisibleCall({ conversation_id: "conv_new", started_at_unix: T }, known, T)).toBe(true);
    expect(isVisibleCall({ conversation_id: "conv_new", started_at_unix: T + 5 }, known, T)).toBe(true);
  });
  it("never hides a conversation with no start time", () => {
    expect(isVisibleCall({ conversation_id: "conv_x", started_at_unix: null }, known, T)).toBe(true);
  });
});
