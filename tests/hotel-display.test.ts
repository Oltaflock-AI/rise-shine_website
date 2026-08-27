import { describe, expect, it } from "vitest";
import {
  clockLabel,
  inclusionItems,
  mealLabel,
  sentenceCase,
  supplementCurrencyNote,
  pageCount,
  pageSlice,
  pageWindow,
  perNightFare,
  roomSizeLabel,
  roomTitle,
  starBucket,
  STAR_BUCKET_LABEL,
} from "../src/lib/hotel-display";

describe("perNightFare", () => {
  it("divides the stay total across its nights", () => {
    expect(perNightFare(9000, 3)).toBe(3000);
  });

  it("keeps the fraction — the total is authoritative, not the per-night", () => {
    expect(perNightFare(10000, 3)).toBeCloseTo(3333.33, 2);
  });

  it("treats a zero or missing night count as one night", () => {
    expect(perNightFare(4200, 0)).toBe(4200);
    expect(perNightFare(4200, NaN)).toBe(4200);
  });

  it("never divides by the room count", () => {
    // Two rooms, two nights: the per-night figure is still total/2, because
    // whether TBO's TotalFare covers one room or both varies by supplier.
    expect(perNightFare(8000, 2)).toBe(4000);
  });

  it("returns 0 for an absent or nonsense fare", () => {
    expect(perNightFare(0, 2)).toBe(0);
    expect(perNightFare(-5, 2)).toBe(0);
    expect(perNightFare(Number.NaN, 2)).toBe(0);
  });
});

describe("starBucket", () => {
  it("buckets each rated class on its own", () => {
    expect(starBucket(5)).toBe(5);
    expect(starBucket(4)).toBe(4);
    expect(starBucket(3)).toBe(3);
  });

  it("groups 1 and 2 star together", () => {
    expect(starBucket(1)).toBe(2);
    expect(starBucket(2)).toBe(2);
  });

  it("keeps UNRATED apart from 1-2 star", () => {
    // The two used to share a bucket, so excluding cheap hotels also hid every
    // property TBO had no rating for.
    expect(starBucket(0)).toBe(0);
    expect(starBucket(0)).not.toBe(starBucket(2));
    expect(STAR_BUCKET_LABEL[0]).toBe("Unrated");
  });

  it("clamps a rating above five", () => {
    expect(starBucket(7)).toBe(5);
  });
});

describe("pageCount", () => {
  it("rounds up", () => {
    expect(pageCount(25, 10)).toBe(3);
    expect(pageCount(20, 10)).toBe(2);
  });

  it("is never zero", () => {
    expect(pageCount(0, 10)).toBe(1);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("returns the requested page", () => {
    expect(pageSlice(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pageSlice(items, 3, 10)).toEqual([21, 22, 23, 24, 25]);
  });

  it("clamps a page past the end to the last real page", () => {
    // Filters can shrink the list under the page the guest is standing on.
    expect(pageSlice(items, 9, 10)).toEqual([21, 22, 23, 24, 25]);
  });

  it("clamps a page below one", () => {
    expect(pageSlice(items, 0, 10)).toEqual(pageSlice(items, 1, 10));
  });
});

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("elides around a middle page", () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });

  it("keeps the first and last page reachable", () => {
    const w = pageWindow(1, 40);
    expect(w[0]).toBe(1);
    expect(w[w.length - 1]).toBe(40);
  });
});

describe("mealLabel — TBO's snake case is not a meal plan", () => {
  it("unpicks the underscores and cases it like a human wrote it", () => {
    expect(mealLabel("Bed_And_Breakfast")).toBe("Bed And Breakfast");
    expect(mealLabel("HALF_BOARD")).toBe("Half Board");
  });

  it("says nothing at all for room-only", () => {
    // The card compared the raw string to "room only", never matched, and
    // printed "Room_Only" on every card. Room-only is the absence of a meal.
    expect(mealLabel("Room_Only")).toBe("");
    expect(mealLabel("RoomOnly")).toBe("");
    expect(mealLabel("room only")).toBe("");
    expect(mealLabel(undefined)).toBe("");
  });

  it("keeps room-only where the rate has to be spelt out", () => {
    expect(mealLabel("Room_Only", true)).toBe("Room Only");
  });
});

describe("roomTitle — TBO omits the space after the comma", () => {
  it("spaces a comma-run room name", () => {
    expect(roomTitle("Deluxe Room,1 King Bed")).toBe("Deluxe Room, 1 King Bed");
  });

  it("collapses whitespace and trims dangling separators", () => {
    expect(roomTitle("  Premier   Room ,  1 King Bed , ")).toBe(
      "Premier Room, 1 King Bed",
    );
  });

  it("never renders an empty heading", () => {
    expect(roomTitle("")).toBe("Room");
    expect(roomTitle(undefined)).toBe("Room");
  });
});

describe("roomSizeLabel — a bare 'ft' is an area, not a length", () => {
  it("reads TBO's bare feet as square feet", () => {
    expect(roomSizeLabel("355 ft")).toBe("355 sq ft");
    expect(roomSizeLabel("350")).toBe("350 sq ft");
    expect(roomSizeLabel("420 sqft")).toBe("420 sq ft");
  });

  it("keeps metric as metric", () => {
    expect(roomSizeLabel("32 sqm")).toBe("32 sq m");
    expect(roomSizeLabel("32 m2")).toBe("32 sq m");
  });

  it("drops sizes that are not a positive measurement", () => {
    expect(roomSizeLabel("0 ft")).toBe("");
    expect(roomSizeLabel("king bed")).toBe("");
    expect(roomSizeLabel(undefined)).toBe("");
    // A unit we do not recognise is a guess, and a guessed room size is worse
    // than none: it is the number a guest pictures themselves standing in.
    expect(roomSizeLabel("355 acres")).toBe("");
  });
});

describe("inclusionItems — the supplier's casing is not our casing", () => {
  it("sentence-cases and de-duplicates", () => {
    expect(inclusionItems("breakfast buffet, FREE VALET PARKING, Breakfast Buffet")).toEqual([
      "Breakfast buffet",
      "Free valet parking",
    ]);
  });

  it("caps the line rather than letting it become a paragraph", () => {
    expect(inclusionItems("a1, b2, c3, d4, e5", 3)).toEqual(["A1", "B2", "C3"]);
  });

  it("returns nothing for an empty field", () => {
    expect(inclusionItems(undefined)).toEqual([]);
    expect(inclusionItems(" , , ")).toEqual([]);
  });
});

describe("sentenceCase — supplier keys are not labels", () => {
  it("unpicks TBO's snake_case supplement types", () => {
    expect(sentenceCase("mandatory_tax")).toBe("Mandatory tax");
  });

  it("leaves an already-cased description alone", () => {
    expect(sentenceCase("Tourism Dirham Fee")).toBe("Tourism Dirham Fee");
  });

  it("returns nothing for nothing", () => {
    expect(sentenceCase(undefined)).toBe("");
    expect(sentenceCase("   ")).toBe("");
  });
});

describe("supplementCurrencyNote — name the currency, or say nothing", () => {
  it("names a currency that is not the one we quoted", () => {
    expect(supplementCurrencyNote("AED", "INR")).toBe(" (charged in AED)");
    // TBO quotes a Dubai hotel's fee in USD often enough that the old
    // "hotel's local currency" wording was simply untrue.
    expect(supplementCurrencyNote("USD", "INR")).toBe(" (charged in USD)");
  });

  it("stays silent when the supplement is in our own currency", () => {
    expect(supplementCurrencyNote("INR", "INR")).toBe("");
    expect(supplementCurrencyNote(undefined, "INR")).toBe("");
    expect(supplementCurrencyNote("inr", undefined)).toBe("");
  });
});

describe("clockLabel — one clock for every supplier", () => {
  it("normalises the shapes TBO actually sends", () => {
    expect(clockLabel("14:00:00")).toBe("2:00 PM");
    expect(clockLabel("14:00")).toBe("2:00 PM");
    expect(clockLabel("2:00 PM")).toBe("2:00 PM");
    expect(clockLabel("12:00:00")).toBe("12:00 PM");
    expect(clockLabel("00:00")).toBe("12:00 AM");
    expect(clockLabel("12:00 AM")).toBe("12:00 AM");
  });

  it("keeps prose a supplier wrote instead of a time", () => {
    expect(clockLabel("Flexible")).toBe("Flexible");
    expect(clockLabel("After 2pm, call ahead")).toBe("After 2pm, call ahead");
  });

  it("returns nothing for an empty field", () => {
    expect(clockLabel(undefined)).toBe("");
  });
});
