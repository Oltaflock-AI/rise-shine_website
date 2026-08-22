import { describe, expect, it } from "vitest";
import { POPULAR_AIRPORTS, searchAirports } from "../src/data/airports";

/**
 * The From/To picker used to be a <datalist> of all ~230 airports — an
 * undifferentiated scroll in which a customer looking for Dubai met Adampur Air Force
 * Base first. It now opens on the routes the agency sells and only searches the full
 * list once two characters are typed, so ranking is the whole feature: the airport a
 * traveller means has to be the first row, not merely present somewhere below.
 */
describe("searchAirports", () => {
  it("offers the popular list before anything is typed", () => {
    expect(searchAirports("")).toEqual(POPULAR_AIRPORTS.slice(0, 8));
  });

  it("puts the metro first, not the alphabetically-earlier airstrip", () => {
    expect(searchAirports("del")[0].code).toBe("DEL");
    expect(searchAirports("bom")[0].code).toBe("BOM");
    expect(searchAirports("ban")[0].city).toBe("Bangalore");
  });

  it("matches an exact IATA code above any city prefix", () => {
    expect(searchAirports("goi")[0].code).toBe("GOI");
    // "AMD" is Ahmedabad; nothing else may outrank an exact code.
    expect(searchAirports("amd")[0].code).toBe("AMD");
  });

  it("still finds a small airport nobody would call popular", () => {
    expect(searchAirports("adampur").map((a) => a.code)).toContain("AIP");
    expect(searchAirports("khajuraho")[0].code).toBe("HJR");
  });

  it("finds international hubs by city name", () => {
    expect(searchAirports("dubai")[0].code).toBe("DXB");
    expect(searchAirports("singapore")[0].code).toBe("SIN");
  });

  it("returns nothing rather than a wrong guess", () => {
    expect(searchAirports("zzzzz")).toEqual([]);
  });

  it("respects the row limit", () => {
    expect(searchAirports("a", 5)).toHaveLength(5);
  });
});
