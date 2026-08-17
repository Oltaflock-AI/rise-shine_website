import { describe, expect, it } from "vitest";
import { validateHotelPax, type HotelBookRequest, type HotelPassenger } from "../src/lib/tbo-hotel-book";

function pax(over: Partial<HotelPassenger> = {}): HotelPassenger {
  return {
    title: "Mr",
    firstName: "Rahul",
    lastName: "Shah",
    paxType: 1,
    leadPassenger: false,
    ...over,
  };
}

function req(passengers: HotelPassenger[][]): HotelBookRequest {
  return {
    bookingCode: "code",
    nationality: "IN",
    netAmount: 1000,
    rooms: passengers.map((p) => ({ passengers: p })),
  };
}

const lead = (over: Partial<HotelPassenger> = {}) =>
  pax({ leadPassenger: true, email: "lead@example.com", phone: "9876543210", ...over });

describe("guest first names — TBO portal checkpoint 29", () => {
  it("accepts one guest per first name", () => {
    expect(validateHotelPax(req([[lead(), pax({ firstName: "Priya", lastName: "Shah" })]]))).toBeNull();
  });

  it("rejects two guests sharing a first name even when the surnames differ", () => {
    const error = validateHotelPax(req([[lead(), pax({ firstName: "Rahul", lastName: "Mehta" })]]));
    expect(error).toMatch(/can't share the first name "Rahul"/);
  });

  it("rejects the same full name twice", () => {
    expect(validateHotelPax(req([[lead(), pax()]]))).toMatch(/can't share the first name/);
  });

  it("compares case- and whitespace-insensitively", () => {
    const error = validateHotelPax(req([[lead(), pax({ firstName: " rahul ", lastName: "Mehta" })]]));
    expect(error).toMatch(/can't share the first name/);
  });

  it("applies across rooms, not just within one", () => {
    const error = validateHotelPax(req([[lead()], [lead({ firstName: "Rahul", lastName: "Mehta" })]]));
    expect(error).toMatch(/can't share the first name/);
  });

  it("reports the missing name rather than a duplicate when a name is blank", () => {
    const error = validateHotelPax(req([[lead(), pax({ firstName: "  ", lastName: "Mehta" })]]));
    expect(error).toMatch(/needs a first and last name/);
  });

  it("still enforces one lead guest per room with contact details", () => {
    expect(validateHotelPax(req([[pax()]]))).toMatch(/exactly one lead passenger/);
    expect(validateHotelPax(req([[pax({ leadPassenger: true })]]))).toMatch(/email and a phone/);
  });
});
