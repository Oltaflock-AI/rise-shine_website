import { describe, expect, it } from "vitest";
import {
  parseRateConditions,
  rateConditionCount,
} from "@/lib/hotel-rate-conditions";

/**
 * Rows captured live from PreBook on hotel 1012683 (Novotel Abu Dhabi Al Bustan,
 * TBO's own certification sample code) on 2026-09-01.
 */
const LIVE_ROWS = [
  "Early check out will attract full cancellation charge unless otherwise specified",
  "CheckIn Time-Begin: 2:00 PM ",
  " CheckIn Time-End: midnight",
  "CheckOut Time: 12:00 PM",
  "CheckIn Instructions: &lt;ul&gt;  &lt;li&gt;Extra-person charges may apply and vary depending on property policy&lt;/li&gt;&lt;li&gt;Government-issued photo identification and a credit card, debit card, or cash deposit may be required at check-in for incidental charges&lt;/li&gt;  &lt;/ul&gt; ",
  "Minimum CheckIn Age : 18",
  "Cards Accepted: Visa,Debit cards,Cash,American Express,Mastercard",
];

describe("parseRateConditions", () => {
  it("keeps a plain sentence as a single unlabelled bullet", () => {
    expect(parseRateConditions([LIVE_ROWS[0]])).toEqual([
      {
        items: [
          "Early check out will attract full cancellation charge unless otherwise specified",
        ],
      },
    ]);
  });

  it("splits a 'Label: value' row into a heading and its value", () => {
    expect(parseRateConditions([LIVE_ROWS[1], LIVE_ROWS[5]])).toEqual([
      { label: "CheckIn Time-Begin", items: ["2:00 PM"] },
      { label: "Minimum CheckIn Age", items: ["18"] },
    ]);
  });

  it("unescapes the HTML and turns each <li> into its own bullet", () => {
    const [group] = parseRateConditions([LIVE_ROWS[4]]);
    expect(group.label).toBe("CheckIn Instructions");
    expect(group.items).toEqual([
      "Extra-person charges may apply and vary depending on property policy",
      "Government-issued photo identification and a credit card, debit card, or cash deposit may be required at check-in for incidental charges",
    ]);
    // The escapes are what the guest saw before this existed.
    expect(JSON.stringify(group)).not.toContain("&lt;");
    expect(JSON.stringify(group)).not.toContain("<li>");
  });

  it("spaces a comma-joined run without cutting it up", () => {
    expect(parseRateConditions([LIVE_ROWS[6]])).toEqual([
      {
        label: "Cards Accepted",
        items: ["Visa, Debit cards, Cash, American Express, Mastercard"],
      },
    ]);
  });

  it("never re-cuts prose on its commas — a rate term is a contract term", () => {
    // Splitting this row on commas turned one condition into three promises.
    const prose =
      "Government-issued photo identification and a credit card, debit card, or cash deposit may be required at check-in for incidental charges";
    expect(parseRateConditions([prose])).toEqual([{ items: [prose] }]);
  });

  it("handles a row that is only markup, keeping the tail after the list", () => {
    const row =
      "&lt;ul&gt;&lt;li&gt;Pool access available from 6:00 AM to 10:00 PM&lt;/li&gt;&lt;/ul&gt;,Service animals are allowed,Pets not allowed";
    expect(parseRateConditions([row])).toEqual([
      {
        items: [
          "Pool access available from 6:00 AM to 10:00 PM",
          "Service animals are allowed, Pets not allowed",
        ],
      },
    ]);
  });

  it("decodes rows TBO double-escaped", () => {
    const [group] = parseRateConditions([
      "Notes: &amp;lt;ul&amp;gt;&amp;lt;li&amp;gt;Deposit required&amp;lt;/li&amp;gt;&amp;lt;/ul&amp;gt;",
    ]);
    expect(group).toEqual({ label: "Notes", items: ["Deposit required"] });
  });

  it("drops blanks, non-strings and exact duplicates", () => {
    expect(
      parseRateConditions([
        "  ",
        null,
        undefined,
        "CheckOut Time: 12:00 PM",
        "CheckOut Time: 12:00 PM",
      ]),
    ).toEqual([{ label: "CheckOut Time", items: ["12:00 PM"] }]);
    expect(parseRateConditions(undefined)).toEqual([]);
  });

  it("counts every bullet, not every row", () => {
    const groups = parseRateConditions(LIVE_ROWS);
    expect(groups).toHaveLength(LIVE_ROWS.length);
    // 6 single-bullet rows + 2 bullets from the check-in instructions list
    expect(rateConditionCount(groups)).toBe(8);
  });
});
