import { describe, expect, it } from "vitest";
import {
  parseHotelDescription,
  parseRoomDescription,
  toPlainText,
} from "../src/lib/hotel-description";

/** Verbatim opening of TBO's description for Mövenpick Bur Dubai. */
const REAL =
  "<p><strong>Hotel Overview:</strong> Movenpick Hotel &amp; Apartments Bur Dubai stands out with its commitment to luxury.</p>" +
  "<p><strong>Accommodations:</strong> Guests can enjoy one of the 255 elegantly appointed guestrooms.</p>";

describe("toPlainText", () => {
  it("strips tags and decodes the entities TBO actually sends", () => {
    expect(toPlainText("<p>Bed &amp; breakfast&nbsp;included</p>")).toBe("Bed & breakfast included");
    expect(toPlainText("caf&#233;")).toBe("café");
  });

  it("never returns markup, even for junk input", () => {
    expect(toPlainText("<script>alert(1)</script>hi")).toBe("alert(1)hi");
    expect(toPlainText("")).toBe("");
  });
});

describe("parseHotelDescription", () => {
  it("recovers the supplier's own section headings", () => {
    const s = parseHotelDescription(REAL);
    expect(s.map((x) => x.heading)).toEqual(["Hotel Overview", "Accommodations"]);
    expect(s[0].paragraphs[0]).toContain("commitment to luxury");
    expect(s[1].paragraphs[0]).toContain("255 elegantly appointed");
  });

  it("keeps text that appears before any heading", () => {
    const s = parseHotelDescription("<p>Just a hotel.</p><p><strong>Amenities:</strong> A pool.</p>");
    expect(s[0]).toEqual({ heading: "", paragraphs: ["Just a hotel."] });
    expect(s[1].heading).toBe("Amenities");
  });

  it("handles suppliers who send headings without markup", () => {
    const s = parseHotelDescription("Hotel Overview: A quiet place.\n\nDining: One restaurant.");
    expect(s.map((x) => x.heading)).toEqual(["Hotel Overview", "Dining"]);
  });

  it("splits on <br> for suppliers who never send <p>", () => {
    const s = parseHotelDescription("Line one.<br><br>Line two.");
    expect(s[0].paragraphs).toEqual(["Line one.", "Line two."]);
  });

  it("returns one unheaded section for a single unbroken string", () => {
    const s = parseHotelDescription("A perfectly ordinary hotel with no structure at all.");
    expect(s).toHaveLength(1);
    expect(s[0].heading).toBe("");
  });

  it("drops a heading with no body under it", () => {
    expect(parseHotelDescription("<p><strong>Amenities:</strong></p>")).toEqual([]);
  });

  it("survives empty and missing input", () => {
    expect(parseHotelDescription("")).toEqual([]);
    expect(parseHotelDescription(undefined)).toEqual([]);
  });

  it("does not mistake a mid-sentence colon for a heading", () => {
    const s = parseHotelDescription("<p>The hotel has one rule: no smoking indoors.</p>");
    expect(s[0].heading).toBe("");
    expect(s[0].paragraphs[0]).toContain("no smoking indoors");
  });
});

describe("parseRoomDescription — one welded line, six sections", () => {
  const raw =
    "1 King Bed 355 sq feet Layout - Separate sitting area Internet - Free " +
    "WiFi and wired internet access Food & Drink - Espresso maker, electric " +
    "kettle, and 24-hour room service Bathroom - Deep soaking bathtub";

  it("recovers the supplier's own labels", () => {
    expect(parseRoomDescription(raw).map((p) => p.label)).toEqual([
      "",
      "Layout",
      "Internet",
      "Food & Drink",
      "Bathroom",
    ]);
  });

  it("keeps the text before the first label as an unlabelled lead", () => {
    expect(parseRoomDescription(raw)[0].text).toBe("1 King Bed 355 sq feet");
  });

  it("does not split an unspaced hyphen — '24-hour' is not a label", () => {
    const food = parseRoomDescription(raw).find(
      (p) => p.label === "Food & Drink",
    );
    expect(food?.text).toBe(
      "Espresso maker, electric kettle, and 24-hour room service",
    );
  });

  it("leaves ordinary prose as a single unlabelled part", () => {
    expect(parseRoomDescription("A quiet room with a 24-hour desk.")).toEqual([
      { label: "", text: "A quiet room with a 24-hour desk." },
    ]);
  });

  it("tidies the space suppliers leave before punctuation", () => {
    expect(parseRoomDescription("Minibar , fees may apply")[0].text).toBe(
      "Minibar, fees may apply",
    );
  });

  it("returns nothing for an empty description", () => {
    expect(parseRoomDescription(undefined)).toEqual([]);
    expect(parseRoomDescription("   ")).toEqual([]);
  });
});
