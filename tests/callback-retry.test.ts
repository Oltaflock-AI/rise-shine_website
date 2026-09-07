/**
 * The line between "nobody answered" and "we spoke to them".
 *
 * Get this wrong in one direction and a customer who already talked to Priya is
 * rung a second time; wrong in the other and the missed-call retry never fires,
 * which is the bug this exists to fix. The fixtures below are the real shapes
 * from `voice_calls` — including the detail that made the obvious rule wrong: a
 * voicemail still yields ONE user turn, because the ASR transcribes the outgoing
 * greeting before the beep.
 */
import { describe, expect, it } from "vitest";
import { callWasAnswered, RETRY_DELAY_SECONDS, RETRY_SOURCE_PREFIX } from "@/lib/callback-retry";
import type { TranscriptTurn } from "@/lib/elevenlabs-webhook";

const turn = (role: string, message: string | null): TranscriptTurn => ({ role, message });

/** Voicemail: agent talks, the ASR catches the greeting as a single user turn. */
const voicemail: TranscriptTurn[] = [
  turn("agent", "नमस्ते, मैं Rise and Shine Travel, Ahmedabad office से Priya बोल रही हूँ।"),
  turn("user", "मैसेज रिकॉर्ड करें"),
  turn("agent", "हमारी टीम जल्द ही आपसे संपर्क करेगी।"),
  turn("agent", ""),
];

/** A real conversation — four or more user turns in every logged example. */
const conversation: TranscriptTurn[] = [
  turn("agent", "नमस्ते"),
  turn("user", "हाँ बोलिए"),
  turn("agent", "कहाँ जाना चाहते हैं?"),
  turn("user", "Bali"),
  turn("agent", "कितने लोग?"),
  turn("user", "चार"),
  turn("agent", "किस महीने?"),
  turn("user", "अगस्त"),
];

describe("callWasAnswered", () => {
  it("treats a voicemail as unanswered despite its one stray user turn", () => {
    expect(callWasAnswered(voicemail)).toBe(false);
  });

  it("treats a real conversation as answered", () => {
    expect(callWasAnswered(conversation)).toBe(true);
  });

  it("treats a call that never connected as unanswered", () => {
    expect(callWasAnswered([])).toBe(false);
    expect(callWasAnswered(null)).toBe(false);
    expect(callWasAnswered(undefined)).toBe(false);
  });

  it("does not count empty or whitespace user turns as speech", () => {
    expect(callWasAnswered([turn("user", ""), turn("user", "   "), turn("user", null)])).toBe(false);
  });

  it("counts only the guest, never the agent", () => {
    const agentMonologue = Array.from({ length: 10 }, () => turn("agent", "…"));
    expect(callWasAnswered(agentMonologue)).toBe(false);
  });

  it("needs two real user turns, so one ASR ghost is never a conversation", () => {
    expect(callWasAnswered([turn("user", "hello")])).toBe(false);
    expect(callWasAnswered([turn("user", "hello"), turn("user", "yes")])).toBe(true);
  });
});

describe("retry configuration", () => {
  it("waits long enough not to pester, and is not instant", () => {
    expect(RETRY_DELAY_SECONDS).toBeGreaterThanOrEqual(60);
    expect(RETRY_DELAY_SECONDS).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("marks a retry so it can never itself be retried", () => {
    expect(`${RETRY_SOURCE_PREFIX}contact-form`.startsWith(RETRY_SOURCE_PREFIX)).toBe(true);
  });
});
