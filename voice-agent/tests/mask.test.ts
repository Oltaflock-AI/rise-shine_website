import { describe, expect, it } from "vitest";
import { maskPan, maskPassport } from "../lib/mask";

// The whole point of the customer pages' PII rule: a masked value must never
// carry enough to reconstruct the document, and must still tell two apart.
describe("maskPan", () => {
  it("keeps the first 3 and last 2 of a 10-char PAN", () => {
    expect(maskPan("ABCDE1234F")).toBe("ABC•••••4F");
  });
  it("upper-cases and trims", () => {
    expect(maskPan("  abcde1234f ")).toBe("ABC•••••4F");
  });
  it("masks an odd-length value to its last 2", () => {
    expect(maskPan("ABC1234")).toBe("•••••34");
  });
  it("returns null for empty", () => {
    expect(maskPan("")).toBeNull();
    expect(maskPan(null)).toBeNull();
    expect(maskPan(undefined)).toBeNull();
  });
  it("never reveals a very short value", () => {
    expect(maskPan("AB")).toBe("••");
  });
});

describe("maskPassport", () => {
  it("keeps only the last 3", () => {
    expect(maskPassport("Z1234567")).toBe("•••••567");
  });
  it("returns null for empty and hides short values", () => {
    expect(maskPassport(null)).toBeNull();
    expect(maskPassport("AB1")).toBe("•••");
  });
});
