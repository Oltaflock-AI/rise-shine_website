import { describe, expect, it } from "vitest";
import { NATIONALITIES, nationalityAllowed, nationalityLabel, normalizeNationality } from "../src/data/nationalities";

describe("normalizeNationality", () => {
  it("accepts a supported ISO-2 code in any case", () => {
    expect(normalizeNationality("gb")).toBe("GB");
    expect(normalizeNationality(" ae ")).toBe("AE");
  });

  it("falls back to IN for anything unsupported", () => {
    expect(normalizeNationality("")).toBe("IN");
    expect(normalizeNationality(undefined)).toBe("IN");
    expect(normalizeNationality("ZZ")).toBe("IN");
    expect(normalizeNationality("Indian")).toBe("IN");
  });

  it("labels the code it normalized to", () => {
    expect(nationalityLabel("us")).toBe("United States");
    expect(nationalityLabel("nonsense")).toBe("India");
  });

  it("offers India first — it is the default and the only one valid worldwide", () => {
    expect(NATIONALITIES[0].code).toBe("IN");
  });
});

describe("nationalityAllowed — TBO's rule", () => {
  it("allows every nationality for stays in India", () => {
    expect(nationalityAllowed("US", "IN")).toBe(true);
    expect(nationalityAllowed("GB", "in")).toBe(true);
    expect(nationalityAllowed("IN", "IN")).toBe(true);
  });

  it("allows only Indian nationality for international stays", () => {
    expect(nationalityAllowed("IN", "AE")).toBe(true);
    expect(nationalityAllowed("US", "AE")).toBe(false);
    expect(nationalityAllowed("GB", "TH")).toBe(false);
  });

  it("treats an unknown destination as domestic rather than blocking the search", () => {
    expect(nationalityAllowed("US", "")).toBe(true);
    expect(nationalityAllowed("US", undefined)).toBe(true);
  });

  it("normalizes before deciding, so an unsupported value cannot smuggle past the rule", () => {
    // "ZZ" normalizes to IN, which IS allowed internationally — the guard must
    // never fail open on a value the selector could not have produced.
    expect(nationalityAllowed("ZZ", "AE")).toBe(true);
  });
});
