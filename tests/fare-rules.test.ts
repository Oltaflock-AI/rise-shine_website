import { describe, expect, it } from "vitest";
import { isEmptyFareRule, sanitizeFareRuleHtml } from "../src/lib/fare-rules";

/**
 * `FareRuleDetail` is airline-authored HTML that TBO relays untouched over plain HTTP.
 * It is the only place the full refund / date-change conditions exist, so it is
 * rendered — which makes this sanitiser the boundary between a supplier's markup and
 * our DOM. These cases pin the two things that must never regress: script-bearing
 * markup is destroyed, and the penalty tables survive intact.
 */
describe("sanitizeFareRuleHtml", () => {
  it("keeps the penalty table an airline actually sends", () => {
    const out = sanitizeFareRuleHtml(
      "<b>These Are Non Refundable Fares.</b><table border='1'><tr><th rowspan='4'>DEL-BOM</th>" +
        "<td>UPTO 2 HOURS</td><td>Refund</td><td>Adult: 5000</td></tr></table>",
    );
    expect(out).toContain("<b>These Are Non Refundable Fares.</b>");
    expect(out).toContain("<table>");
    expect(out).toContain('<th rowspan="4">');
    expect(out).toContain("Adult: 5000");
    // border= is presentational and not on the allowlist
    expect(out).not.toContain("border");
  });

  it("drops script tags and their contents", () => {
    const out = sanitizeFareRuleHtml("<p>Rules</p><script>alert(document.cookie)</script>");
    expect(out).toBe("<p>Rules</p>");
  });

  it("drops event handlers and any tag not on the allowlist", () => {
    const out = sanitizeFareRuleHtml(
      `<div onclick="steal()"><a href="javascript:alert(1)">Refund</a><img src=x onerror=alert(1)></div>`,
    );
    expect(out).not.toMatch(/onclick|onerror|javascript:|<a |<img/i);
    // The anchor is unwrapped, not deleted — the customer still reads the word.
    expect(out).toContain("Refund");
  });

  it("escapes a truncated tag instead of letting it reopen the parser", () => {
    const out = sanitizeFareRuleHtml("Penalty <td 5000 INR");
    expect(out).toContain("&lt;td 5000 INR");
    expect(out).not.toMatch(/<td/);
  });

  it("survives an unclosed style block without leaking CSS as copy", () => {
    const out = sanitizeFareRuleHtml("<style>b{display:none}<p>Refund allowed</p>");
    expect(out).not.toContain("display:none");
    expect(out).toContain("Refund allowed");
  });
});

describe("isEmptyFareRule", () => {
  it("treats markup-only text as nothing to show", () => {
    expect(isEmptyFareRule("<br/><p> </p>&nbsp;")).toBe(true);
    expect(isEmptyFareRule("")).toBe(true);
  });

  it("keeps a rule that has real words in it", () => {
    expect(isEmptyFareRule("<p>Non refundable</p>")).toBe(false);
  });
});

/**
 * The fare split a customer is shown has exactly two lines, and they add up to the
 * amount charged. TBO's `PublishedFare` carries the agency service fee (₹1,000 on the
 * live account) on top of BaseFare + Tax; that fee is part of the fare being quoted,
 * not a third "fees" line — so `base` is the remainder, never TBO's raw BaseFare.
 */
describe("quoteDetails — the fare split shown at checkout", () => {
  it("folds everything that is not tax into the base fare", async () => {
    const { quoteDetails } = await import("../src/lib/tbo-book");
    const d = quoteDetails(
      // Real SpiceJet DEL-BOM quote, 20 Sep 2026: 4587 base + 1531 tax + 1000 fee.
      { Fare: { PublishedFare: 7118, BaseFare: 4587, Tax: 1531 }, Segments: [[]] },
      null,
    );
    expect(d.fare).toEqual({ base: 5587, tax: 1531, total: 7118 });
    expect(d.fare!.base + d.fare!.tax).toBe(d.fare!.total);
    expect(Object.keys(d.fare!)).toEqual(["base", "tax", "total"]);
  });

  it("reports no split at all rather than a zero one", async () => {
    const { quoteDetails } = await import("../src/lib/tbo-book");
    expect(quoteDetails({ Segments: [[]] }, null).fare).toBeUndefined();
  });
});

/**
 * LCCs publish no rule text through TBO — FareRule answers with the fare basis code
 * and nothing else (verified live on 6E IDR-NMI, 22 Aug 2026). Showing that behind a
 * "Read the airline's full fare rules" toggle promises a document that does not
 * exist; the binding terms for those fares are the MiniFareRules grid.
 */
describe("isEmptyFareRule — the LCC stub", () => {
  it("treats a fare-basis-only response as no rules at all", () => {
    expect(isEmptyFareRule("The FareBasisCode is: R0IP<br/><br/> <br/>")).toBe(true);
    expect(isEmptyFareRule("the fare basis code is IJEU15")).toBe(true);
  });

  it("keeps a real rule document that happens to mention the fare basis", () => {
    expect(
      isEmptyFareRule(
        "<b>These Are Non Refundable Fares.</b> The FareBasisCode is: TU1YXR2I",
      ),
    ).toBe(false);
  });
});
