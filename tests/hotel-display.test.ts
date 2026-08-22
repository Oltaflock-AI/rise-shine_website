import { describe, expect, it } from "vitest";
import {
  pageCount,
  pageSlice,
  pageWindow,
  perNightFare,
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
