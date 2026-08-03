/**
 * Voice-callback guards — the checks standing between a website form and a real
 * phone ringing. A number that slips through malformed either fails at the SIP
 * trunk or, worse, dials a stranger.
 */
import { describe, expect, it } from "vitest";
import { isDiallableIndianNumber, normalisePhone } from "@/lib/elevenlabs-outbound";
import { callbackDelayPhrase } from "@/lib/callback-delay";

describe("normalisePhone", () => {
  it.each([
    ["9725597232", "+919725597232"], // bare 10-digit mobile → +91
    ["097255 97232", "+919725597232"], // STD 0 prefix stripped
    ["919725597232", "+919725597232"], // country code, no plus
    ["+91 97255 97232", "+919725597232"], // already E.164, spaced
    ["+91-97255-97232", "+919725597232"], // punctuation stripped
    ["+1 415 555 0132", "+14155550132"], // non-Indian country code preserved
  ])("normalises %s → %s", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it("never returns a bare number without a country code", () => {
    expect(normalisePhone("9725597232").startsWith("+")).toBe(true);
  });
});

describe("isDiallableIndianNumber", () => {
  it.each(["+919725597232", "+918000000000", "+916123456789"])(
    "accepts the Indian mobile %s",
    (n) => expect(isDiallableIndianNumber(n)).toBe(true),
  );

  it.each([
    "+912345678901", // Indian mobiles never start 2
    "+9197255972", // too short
    "+9197255972321", // too long
    "+91", // nothing but the code
    "", // empty
  ])("rejects %s", (n) => expect(isDiallableIndianNumber(n)).toBe(false));

  it("accepts a plausible foreign number", () => {
    expect(isDiallableIndianNumber("+14155550132")).toBe(true);
  });

  it("cannot distinguish a landline typed with its STD code", () => {
    // Documents a real limitation, not a wish: 079-2329-7232 (Ahmedabad
    // landline) normalises to +917923297232, which is byte-identical to a
    // mobile beginning 79. STD codes and mobile prefixes overlap, so no format
    // check can separate them — such a number is accepted here and simply fails
    // (or rings a landline) at the SIP trunk, where the queue records the error.
    expect(isDiallableIndianNumber(normalisePhone("07923297232"))).toBe(true);
  });
});

describe("callbackDelayPhrase", () => {
  it.each([
    [0, "under a minute"],
    [30, "under a minute"],
    [60, "about a minute"],
    [120, "about 2 minutes"],
    [300, "about 5 minutes"],
  ])("phrases %ds as %s", (secs, expected) => {
    expect(callbackDelayPhrase(secs)).toBe(expected);
  });
});
