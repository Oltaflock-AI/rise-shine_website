import { describe, expect, it } from "vitest";
import { displayAirportName, displayPlaceName } from "../src/lib/place-names";

/**
 * Every input below is verbatim TBO output. The point is narrow: a traveller
 * should not be shown a name the place stopped using decades ago, while TBO's
 * own identifiers keep flowing back to TBO untouched.
 */
describe("displayPlaceName", () => {
  it("drops the superseded half of TBO's alias form", () => {
    expect(displayPlaceName("Mumbai/Bombay, Maharashtra")).toBe("Mumbai, Maharashtra");
  });

  it("keeps the region suffix, which is what disambiguates towns", () => {
    expect(displayPlaceName("Mumbai/Bombay, Maharashtra")).toContain("Maharashtra");
  });

  it("handles the alias written the other way round", () => {
    expect(displayPlaceName("Bombay/Mumbai")).toBe("Mumbai");
  });

  it("renames a bare superseded name", () => {
    expect(displayPlaceName("Calcutta")).toBe("Kolkata");
    expect(displayPlaceName("Madras, Tamil Nadu")).toBe("Chennai, Tamil Nadu");
  });

  it("leaves a genuine compound alone", () => {
    // Neither side is a former name of the other, so it is not an alias.
    expect(displayPlaceName("Baden/Wien")).toBe("Baden/Wien");
  });

  it("trims TBO's padding", () => {
    expect(displayPlaceName("Navi Mumbai ")).toBe("Navi Mumbai");
    expect(displayPlaceName("  Delhi  ")).toBe("Delhi");
  });

  it("does not rewrite a region that happens to share a name", () => {
    // Only the leading component is treated as the place being named.
    expect(displayPlaceName("Andheri, Bombay")).toBe("Andheri, Bombay");
  });

  it("leaves current names untouched", () => {
    expect(displayPlaceName("Mumbai")).toBe("Mumbai");
    expect(displayPlaceName("Dubai")).toBe("Dubai");
  });

  it("survives empty input", () => {
    expect(displayPlaceName("")).toBe("");
    expect(displayPlaceName(undefined)).toBe("");
  });
});

describe("displayAirportName", () => {
  it("fixes the airport TBO still calls Calcutta", () => {
    expect(displayAirportName("Calcutta")).toBe("Kolkata");
  });

  it("leaves a full airport name alone", () => {
    expect(displayAirportName("Chhatrapati Shivaji Maharaj International Airport")).toBe(
      "Chhatrapati Shivaji Maharaj International Airport",
    );
    expect(displayAirportName("Indira Gandhi Airport")).toBe("Indira Gandhi Airport");
  });
});
