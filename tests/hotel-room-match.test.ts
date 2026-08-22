import { describe, expect, it } from "vitest";
import {
  matchRoomContent,
  normaliseRoomName,
  roomNameCoverage,
  type RoomContent,
} from "../src/lib/hotel-room-match";

/**
 * A live rate and the catalogue entry describing it come from different TBO
 * APIs with no shared id, so they are joined on the name. Every pair below is
 * real, taken from live Dubai inventory, and the failure being guarded against
 * is showing a guest the WRONG room's description while they choose a bed.
 */
describe("normaliseRoomName", () => {
  it("strips punctuation, board and cancellation noise", () => {
    expect(normaliseRoomName("Deluxe King Room - Room Only")).toBe("deluxe king");
    expect(normaliseRoomName("Superior Twin (Non-Refundable)")).toBe("superior twin");
    expect(normaliseRoomName("Deluxe, Double or Twin Room with King Bed")).toBe(
      "deluxe double twin king",
    );
  });

  it("keeps digits — bed counts are what separate two room types", () => {
    expect(normaliseRoomName("Deluxe Room, 1 King Bed")).toBe("deluxe 1 king");
    expect(normaliseRoomName("Deluxe Room, 2 Twin Beds")).toBe("deluxe 2 twin");
  });

  it("survives empty and junk input", () => {
    expect(normaliseRoomName("")).toBe("");
    expect(normaliseRoomName("   ---   ")).toBe("");
    expect(normaliseRoomName("Room")).toBe("");
  });
});

describe("roomNameCoverage", () => {
  /**
   * The case that forced coverage over Dice: the rate carries six promotional
   * tokens the catalogue never mentions. Dice scores this correct pair 0.33.
   */
  it("ignores promo padding on the rate side", () => {
    const { coverage, matched } = roomNameCoverage(
      "AVANI Room, Early Check-In and Late Check-Out, Rooftop Pool Access,1 King Bed",
      "Avani Room with King Bed",
    );
    expect(coverage).toBe(1);
    expect(matched).toBe(2);
  });

  it("does not cover when the catalogue names a different bed", () => {
    expect(
      roomNameCoverage(
        "AVANI Room, Early Check-In and Late Check-Out,1 King Bed",
        "Avani with Twin Bed",
      ).coverage,
    ).toBeLessThan(1);
  });

  it("is 0 when either side normalises away to nothing", () => {
    expect(roomNameCoverage("Room", "Deluxe King").coverage).toBe(0);
    expect(roomNameCoverage("", "Deluxe King").coverage).toBe(0);
  });
});

describe("matchRoomContent", () => {
  const rooms: RoomContent[] = [
    { name: "Room (AVANI)", size: "398 ft", description: "Generic AVANI room" },
    { name: "Avani Room with King Bed", size: "410 ft", description: "One king bed" },
    { name: "Avani with Twin Bed", size: "405 ft", description: "Two twin beds" },
    { name: "Royal Suite", size: "900 ft", description: "Separate living room" },
  ];

  it("prefers the most specific covered entry over a generic one", () => {
    // "Room (AVANI)" also covers fully, but describes no particular bed.
    expect(
      matchRoomContent(
        "AVANI Room, Early Check-In and Late Check-Out, Rooftop Pool Access,1 King Bed",
        rooms,
      )?.size,
    ).toBe("410 ft");
  });

  it("keeps the bed types apart", () => {
    expect(matchRoomContent("AVANI Room, Rooftop Pool Access,2 Twin Beds", rooms)?.size).toBe(
      "405 ft",
    );
  });

  it("returns nothing rather than a wrong room", () => {
    expect(matchRoomContent("Presidential Villa, 3 Bedrooms", rooms)).toBeUndefined();
  });

  it("refuses a one-word match unless the names are identical", () => {
    // "Suite" alone must not drag "Royal Suite" onto a Junior Suite rate.
    expect(matchRoomContent("Junior Suite", [{ name: "Royal Suite", size: "900 ft" }])).toBeUndefined();
    expect(matchRoomContent("Penthouse", [{ name: "Penthouse", size: "1200 ft" }])?.size).toBe(
      "1200 ft",
    );
  });

  it("ignores catalogue entries that carry no detail to show", () => {
    // TBO returns thousands of RoomDetails rows; a bare name adds nothing the
    // rate did not already say, so it must not count as a match.
    expect(matchRoomContent("Royal Suite", [{ name: "Royal Suite" }])).toBeUndefined();
  });

  it("handles missing or empty inputs", () => {
    expect(matchRoomContent("", rooms)).toBeUndefined();
    expect(matchRoomContent("Deluxe Room,1 Queen Bed", undefined)).toBeUndefined();
    expect(matchRoomContent("Deluxe Room,1 Queen Bed", [])).toBeUndefined();
  });
});
