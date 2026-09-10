import { describe, expect, it } from "vitest";
import { canonicalState, parsePincodeResponse } from "@/lib/pincode";
import { INDIAN_STATES } from "@/data/indian-states";

const ok = (offices: { District: string; State: string }[]) => [
  { Status: "Success", PostOffice: offices },
];

describe("canonicalState", () => {
  it("returns dropdown values for India Post spellings", () => {
    expect(canonicalState("Gujarat")).toBe("Gujarat");
    expect(canonicalState("gujarat ")).toBe("Gujarat");
    expect(canonicalState("Chattisgarh")).toBe("Chhattisgarh");
    expect(canonicalState("Orissa")).toBe("Odisha");
    expect(canonicalState("Pondicherry")).toBe("Puducherry");
    expect(canonicalState("Jammu & Kashmir")).toBe("Jammu and Kashmir");
    expect(canonicalState("Daman & Diu")).toBe(
      "Dadra and Nagar Haveli and Daman and Diu",
    );
  });
  it("only ever answers with a value the dropdown offers", () => {
    for (const s of INDIAN_STATES) expect(canonicalState(s)).toBe(s);
    expect(canonicalState("Narnia")).toBe("");
    expect(canonicalState(null)).toBe("");
  });
});

describe("parsePincodeResponse", () => {
  it("reads city and state from a single-district PIN", () => {
    const place = parsePincodeResponse(
      "380015",
      ok([
        { District: "Ahmedabad", State: "Gujarat" },
        { District: "Ahmedabad", State: "Gujarat" },
      ]),
    );
    expect(place).toEqual({ pin: "380015", city: "Ahmedabad", state: "Gujarat" });
  });

  it("takes the district most offices agree on when a PIN straddles two", () => {
    const place = parsePincodeResponse(
      "400001",
      ok([
        { District: "Mumbai", State: "Maharashtra" },
        { District: "Raigarh(MH)", State: "Maharashtra" },
        { District: "Mumbai", State: "Maharashtra" },
      ]),
    );
    expect(place?.city).toBe("Mumbai");
  });

  it("strips the parenthetical disambiguator from a district", () => {
    const place = parsePincodeResponse(
      "402107",
      ok([{ District: "Raigarh(MH)", State: "Maharashtra" }]),
    );
    expect(place?.city).toBe("Raigarh");
  });

  it("calls every Delhi district New Delhi", () => {
    const place = parsePincodeResponse(
      "110001",
      ok([{ District: "Central Delhi", State: "Delhi" }]),
    );
    expect(place).toEqual({ pin: "110001", city: "New Delhi", state: "Delhi" });
  });

  it("returns null on India Post's not-found shape and on garbage", () => {
    expect(
      parsePincodeResponse("999999", [
        { Message: "No records found", Status: "Error", PostOffice: null },
      ]),
    ).toBeNull();
    expect(parsePincodeResponse("123456", { nope: true })).toBeNull();
    expect(parsePincodeResponse("123456", "<html>")).toBeNull();
    expect(
      parsePincodeResponse("123456", ok([{ District: "X", State: "Nowhere" }])),
    ).toBeNull();
  });
});
