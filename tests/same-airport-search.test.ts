import { describe, expect, it } from "vitest";
import { searchFlights } from "../src/lib/tbo";

/**
 * A hand-typed URL (or a half-finished picker) can ask for Ahmedabad → Ahmedabad.
 * TBO can only answer that with an empty result set, and the Search call still
 * costs a token round-trip and mints a TraceId, so the guard has to fail before
 * the network — which is also what makes this testable without credentials.
 */
describe("searchFlights — same airport at both ends", () => {
  it("refuses the search instead of calling TBO", async () => {
    const res = await searchFlights({
      from: "amd",
      to: "AMD",
      departISO: "2026-09-01",
      adults: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("same-airport");
    expect(res.outbound).toEqual([]);
  });
});
