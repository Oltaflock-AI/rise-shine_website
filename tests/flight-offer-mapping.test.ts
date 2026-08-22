import { describe, expect, it } from "vitest";
import { mapResult } from "../src/lib/tbo";

/**
 * Baggage is the single fact a flyer compares two similar fares on, and TBO reports it
 * in two different places depending on the supplier: on the segment (`Segments[].Baggage`)
 * for most, and only inside the adult fare breakdown (`FareBreakdown[].SegmentDetails[]`)
 * for others. Reading just one of them left the card blank on live results — which is
 * how a customer reached checkout not knowing whether a bag was included.
 *
 * The MiniFareRules rows are the airline's cancellation grid; they are what the card's
 * refund policy renders, so an empty `Details` row must not become an empty table line.
 */
describe("mapResult — what a search card can show", () => {
  const base = {
    ResultIndex: "OB1",
    IsLCC: true,
    IsRefundable: false,
    AirlineCode: "IX",
    Fare: { PublishedFare: 5000, BaseFare: 3600, Tax: 1400 },
    FareBreakdown: [{ PassengerType: 1, PassengerCount: 1, BaseFare: 3600, Tax: 1400 }],
    Segments: [[{ Airline: { AirlineCode: "IX", FlightNumber: "1364" }, Duration: 120 }]],
  };

  it("reads baggage off the segment when TBO puts it there", () => {
    const o = mapResult(
      { ...base, Segments: [[{ ...base.Segments[0][0], Baggage: "15 KG", CabinBaggage: "7 KG" }]] },
      1,
    );
    expect(o.segments[0].baggage).toBe("15 KG");
    expect(o.segments[0].cabinBaggage).toBe("7 KG");
  });

  it("falls back to the adult fare breakdown when the segment is blank", () => {
    const o = mapResult(
      {
        ...base,
        FareBreakdown: [
          {
            ...base.FareBreakdown[0],
            SegmentDetails: [
              { CheckedInBaggage: { FreeText: "20 KG" }, CabinBaggage: { FreeText: "7 KG" } },
            ],
          },
        ],
      },
      1,
    );
    expect(o.segments[0].baggage).toBe("20 KG");
    expect(o.segments[0].cabinBaggage).toBe("7 KG");
  });

  it("leaves the allowance empty rather than inventing one", () => {
    const o = mapResult(base, 1);
    expect(o.segments[0].baggage).toBe("");
    expect(o.segments[0].cabinBaggage).toBe("");
  });

  it("flattens the per-journey MiniFareRules grid and drops charge-less rows", () => {
    const o = mapResult(
      {
        ...base,
        FareInclusions: ["Cabin Baggage Included", "Cancellation fees apply"],
        MiniFareRules: [
          [
            { Type: "Cancellation", JourneyPoints: "DEL-BOM", From: "0", To: "2", Unit: "HOURS", Details: "100%" },
            { Type: "Reissue", JourneyPoints: "DEL-BOM", From: "2", To: "", Unit: "HOURS", Details: "INR 3000" },
            { Type: "Cancellation", JourneyPoints: "DEL-BOM", From: "0", To: "2", Unit: "HOURS", Details: "100%" },
            { Type: "Seat", JourneyPoints: "DEL-BOM", Details: "" },
          ],
        ],
      },
      1,
    );
    expect(o.miniRules).toHaveLength(2);
    expect(o.miniRules[0]).toMatchObject({ type: "Cancellation", details: "100%", unit: "HOURS" });
    expect(o.fareInclusions).toEqual(["Cabin Baggage Included", "Cancellation fees apply"]);
  });
});
