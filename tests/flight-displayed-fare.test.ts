import { describe, expect, it } from "vitest";
import { perAdultFare } from "../src/lib/tbo";

/**
 * The fare on a search card must be the ALL-INCLUSIVE price — what the customer is
 * actually charged, divided by heads — so the number never moves between the results
 * page and checkout.
 *
 * The trap this pins: TBO's `FareBreakdown` carries base and tax per passenger type
 * but has NO service-fee field. `Fare.ServiceFee` — the agency's per-passenger fee,
 * ₹1,000 on the live account — exists only on the top-level `Fare`, folded into
 * `PublishedFare`. Pricing the card off FareBreakdown therefore understated every
 * listing by the entire fee, and a family of three met a ₹3,000 jump at checkout.
 *
 * The figures below are a real Mumbai → Delhi search (IX1364, 20 Sep 2026) captured
 * on 18 Aug 2026, at one, two and three adults.
 */
describe("perAdultFare — what the search card shows", () => {
  const oneAdult = {
    ResultIndex: "x",
    Fare: { BaseFare: 3625, Tax: 1976, ServiceFee: 1000, PublishedFare: 6601, OfferedFare: 5586.14 },
    FareBreakdown: [{ PassengerType: 1, PassengerCount: 1, BaseFare: 3625, Tax: 1976 }],
  };

  it("includes the service fee — the card and checkout must agree", () => {
    expect(perAdultFare(oneAdult, 1).fareINR).toBe(6601);
  });

  it("does not show base + tax alone, which is the fare that understated by ₹1,000", () => {
    expect(perAdultFare(oneAdult, 1).fareINR).not.toBe(5601);
  });

  it("divides the booking total by heads rather than repeating it", () => {
    const twoAdults = {
      ResultIndex: "x",
      Fare: { BaseFare: 7250, Tax: 3952, ServiceFee: 2000, PublishedFare: 13202, OfferedFare: 11172.28 },
      FareBreakdown: [{ PassengerType: 1, PassengerCount: 2, BaseFare: 7250, Tax: 3952 }],
    };
    expect(perAdultFare(twoAdults, 2).fareINR).toBe(6601);
  });

  it("tracks TBO's own per-head price when the fare bucket shifts at higher counts", () => {
    // Three adults price into a costlier bucket: 20109 / 3 = 6703, not 6601.
    const threeAdults = {
      ResultIndex: "x",
      Fare: { BaseFare: 11169, Tax: 5940, ServiceFee: 3000, PublishedFare: 20109, OfferedFare: 17063.21 },
      FareBreakdown: [{ PassengerType: 1, PassengerCount: 3, BaseFare: 11169, Tax: 5940 }],
    };
    expect(perAdultFare(threeAdults, 3).fareINR).toBe(6703);
  });

  it("never shows OfferedFare — that is TBO's charge to the agency, not the customer's price", () => {
    expect(perAdultFare(oneAdult, 1).fareINR).not.toBe(5586);
  });

  it("keeps base and tax as the genuine airline split", () => {
    const f = perAdultFare(oneAdult, 1);
    expect(f.baseINR).toBe(3625);
    expect(f.taxINR).toBe(1976);
    // The fee is the difference between the split and the displayed fare.
    expect(f.fareINR - (f.baseINR + f.taxINR)).toBe(1000);
  });

  it("falls back to base + tax + fee when PublishedFare is missing", () => {
    const noPublished = {
      ResultIndex: "x",
      Fare: { BaseFare: 3625, Tax: 1976, ServiceFee: 1000 },
      FareBreakdown: [{ PassengerType: 1, PassengerCount: 1, BaseFare: 3625, Tax: 1976 }],
    };
    expect(perAdultFare(noPublished, 1).fareINR).toBe(6601);
  });

  it("survives a result with no FareBreakdown at all", () => {
    const bare = { ResultIndex: "x", Fare: { PublishedFare: 6601 } };
    expect(perAdultFare(bare, 1).fareINR).toBe(6601);
  });

  it("does not divide by zero when the adult count is absent", () => {
    expect(perAdultFare(oneAdult, 0).fareINR).toBe(6601);
  });
});
