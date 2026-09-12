import { describe, expect, it } from "vitest";
import { alertTier, sentryLevel } from "../src/lib/alert-tier";

/**
 * Sentry routes on `tags.tier`. Every subject the code can emit is listed
 * here so a reworded alert cannot quietly drop from SMS to email.
 */
describe("alertTier", () => {
  it("pages on every URGENT subject", () => {
    for (const s of [
      "URGENT: flight refund FAILED — settle manually",
      "URGENT: hotel refund FAILED — settle manually",
      "URGENT: flight timeout NOT recovered — settle by hand",
      "URGENT: flight timed out with no BookingId/PNR to recover from",
      "URGENT: flight checkout needs a human — rsf_x",
      "URGENT: hotel refund FAILED for abandoned checkout — settle manually",
    ]) expect(alertTier(s), s).toBe("page");
  });

  it("pages a money check even without URGENT in the subject", () => {
    expect(alertTier("DOWN: Captured payments with no booking", { money: true })).toBe("page");
    expect(alertTier("STILL DOWN (6h): Captured payments with no booking", { money: true })).toBe("page");
  });

  it("alerts (no page) when the site is refusing customers", () => {
    for (const s of [
      "DOWN: TBO flight search",
      "STILL DOWN (12h): Supabase database reads",
      "Cashfree webhook signature REJECTED",
      "Flight Book/Ticket TIMED OUT — recovering, do NOT re-book",
      "Flight ticketing failed after capture — auto-refunded",
    ]) expect(alertTier(s), s).toBe("alert");
  });

  it("is info for recoveries and self-settled refunds", () => {
    expect(alertTier("Recovered: TBO flight search")).toBe("info");
    expect(alertTier("Refunded an abandoned flight checkout")).toBe("info");
    expect(alertTier("Flight recovered after timeout — booking found at TBO")).toBe("info");
  });

  it("maps to Sentry levels", () => {
    expect(sentryLevel("page")).toBe("error");
    expect(sentryLevel("alert")).toBe("warning");
    expect(sentryLevel("info")).toBe("info");
  });
});
