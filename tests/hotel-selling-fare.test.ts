import { describe, expect, it } from "vitest";
import { sellingFare } from "../src/lib/tbo-hotel";

/**
 * The B2C undertaking we gave TBO in writing (portal checkpoint 17): a room is
 * never offered below its RecommendedSellingRate, and the fare shown is TBO's
 * TotalFare — never NetAmount, which is their charge to the agency (checkpoint
 * 30/31). RSP is absent on the certification feed and only starts arriving on
 * live, so this is the regression test that the floor binds the moment it does.
 */
describe("sellingFare", () => {
  it("is TotalFare when no selling rate is returned (today's certification feed)", () => {
    expect(sellingFare({ TotalFare: 17964.22 })).toBe(17964.22);
  });

  it("lifts the price to RecommendedSellingRate when TBO returns a higher floor", () => {
    expect(sellingFare({ TotalFare: 17964.22, RecommendedSellingRate: 18500 })).toBe(18500);
  });

  it("keeps TotalFare when it already clears the floor", () => {
    expect(sellingFare({ TotalFare: 19000, RecommendedSellingRate: 18500 })).toBe(19000);
  });

  it("accepts the alternate node name TBO's docs use", () => {
    expect(sellingFare({ TotalFare: 100, RecommendedSellingPrice: 250 })).toBe(250);
  });

  it("never rounds — TBO checks the exact fare, and these carry paise", () => {
    expect(sellingFare({ TotalFare: 41893.74 })).toBe(41893.74);
    expect(sellingFare({ TotalFare: 100, RecommendedSellingRate: 123.45 })).toBe(123.45);
  });

  it("ignores NetAmount entirely — it must never reach a customer-facing price", () => {
    // Verified live: this feed returns TotalFare marginally BELOW NetAmount.
    const room = { TotalFare: 17964.22, NetAmount: 17965.588518973 } as Parameters<typeof sellingFare>[0] & {
      NetAmount: number;
    };
    expect(sellingFare(room)).toBe(17964.22);
  });

  it("degrades to 0 rather than NaN when a rate carries no fare at all", () => {
    expect(sellingFare({})).toBe(0);
  });
});
