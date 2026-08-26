import { describe, expect, it } from "vitest";
import {
  offerEmail,
  passwordResetEmail,
  welcomeEmail,
  refundNoticeEmail,
} from "@/lib/email";

/**
 * The rules that make the difference between mail that lands and mail that gets
 * a domain blocked. All three have bitten real senders, and none of them is
 * visible by looking at a rendered template.
 */

const OFFER = {
  headline: "Three monsoon escapes",
  intro: "Cheaper and emptier than they will be all year.",
  unsubscribeUrl: "https://www.riseandshinetravel.in/unsubscribe?t=abc-123",
  items: [
    {
      title: "Kerala · 6 nights",
      blurb: "Backwaters and tea country.",
      fromInr: 38900,
      url: "https://www.riseandshinetravel.in/packages/domestic/kerala",
    },
  ],
};

describe("marketing email", () => {
  it("carries the unsubscribe link it was given", () => {
    const { html } = offerEmail(OFFER);
    expect(html).toContain(OFFER.unsubscribeUrl);
  });

  it("renders the offer's own price rather than dropping it", () => {
    const { html } = offerEmail(OFFER);
    // ₹ as a numeric entity — the glyph itself drops to a box in older Outlook.
    expect(html).toContain("&#8377;38,900");
    expect(html).not.toContain("undefined");
  });
});

describe("transactional email", () => {
  /**
   * An unsubscribe link on a booking confirmation is an invitation to opt out of
   * your own ticket. Worse, a recipient who clicks it and still receives their
   * PNR reports the next message as spam.
   */
  it("never offers to unsubscribe", () => {
    for (const { html } of [
      welcomeEmail({ name: "Hardik Patel", email: "h@example.com" }),
      passwordResetEmail({ resetUrl: "https://example.com/auth/confirm?token_hash=x" }),
      refundNoticeEmail({ kind: "flight", amountInr: 24680 }),
    ]) {
      expect(html.toLowerCase()).not.toContain("unsubscribe");
    }
  });

  it("puts the reset link in the button, and says the link is single-use", () => {
    const url = "https://example.com/auth/confirm?token_hash=abc&type=recovery";
    const { html } = passwordResetEmail({ resetUrl: url });
    // The `&` separator is entity-escaped, which is what an href requires — a raw
    // `&` in an attribute is invalid HTML and some clients truncate the URL at it.
    expect(html).toContain("https://example.com/auth/confirm?token_hash=abc&amp;type=recovery");
    expect(html.toLowerCase()).toContain("once");
  });
});

describe("every template", () => {
  /**
   * Gmail clips a message over ~102KB and hides the rest behind "View entire
   * message", which on a booking confirmation means hiding the PNR.
   */
  it("stays well under Gmail's 102KB clipping threshold", () => {
    const all = [
      offerEmail(OFFER),
      welcomeEmail({ name: "Hardik Patel", email: "h@example.com" }),
      passwordResetEmail({ resetUrl: "https://example.com/x" }),
      refundNoticeEmail({ kind: "hotel", amountInr: 61200 }),
    ];
    for (const { html } of all) expect(Buffer.byteLength(html, "utf8")).toBeLessThan(60_000);
  });

  it("has a preheader, so the inbox preview is not 'Hi Hardik,'", () => {
    const { html } = welcomeEmail({ name: "Hardik Patel", email: "h@example.com" });
    expect(html).toMatch(/max-height:0;overflow:hidden/);
  });
});
