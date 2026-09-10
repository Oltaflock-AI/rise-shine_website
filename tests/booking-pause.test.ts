import { describe, expect, it } from "vitest";
import { bookingPaused, pausedMessage, pausedProducts } from "../src/lib/booking-pause";

/** The kill switch. A misparse here either blocks a healthy product or leaves a broken one selling. */
describe("pausedProducts", () => {
  it("is empty when unset or blank", () => {
    expect(pausedProducts({}).size).toBe(0);
    expect(pausedProducts({ BOOKING_PAUSED: "  " }).size).toBe(0);
  });

  it("accepts singular and plural, either case", () => {
    expect([...pausedProducts({ BOOKING_PAUSED: "Flights" })]).toEqual(["flight"]);
    expect([...pausedProducts({ BOOKING_PAUSED: "hotel" })]).toEqual(["hotel"]);
  });

  it("takes a list, and `all`", () => {
    expect(pausedProducts({ BOOKING_PAUSED: "flights, hotels" }).size).toBe(2);
    expect(pausedProducts({ BOOKING_PAUSED: "all" }).size).toBe(2);
    expect(pausedProducts({ BOOKING_PAUSED: "true" }).size).toBe(2);
  });

  it("ignores words it does not know rather than pausing everything", () => {
    expect(pausedProducts({ BOOKING_PAUSED: "trains" }).size).toBe(0);
  });

  it("pauses one product without the other", () => {
    const env = { BOOKING_PAUSED: "hotels" };
    expect(bookingPaused("hotel", env)).toBe(true);
    expect(bookingPaused("flight", env)).toBe(false);
  });

  it("prefers the owner's message when set", () => {
    expect(pausedMessage("flight", { BOOKING_PAUSED_MESSAGE: "Back at 6pm." })).toBe("Back at 6pm.");
    expect(pausedMessage("flight", {})).toMatch(/Call us/);
  });
});
