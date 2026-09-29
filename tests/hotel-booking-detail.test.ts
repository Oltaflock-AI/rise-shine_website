import { describe, expect, it } from "vitest";
import { mapBookingDetail } from "@/lib/tbo-hotel-post";

/**
 * GetBookingDetail puts the rooms under `Rooms` and each room's policy under
 * `CancelPolicies`. We read `HotelRoomsDetails` / `CancellationPolicies` until
 * 29-Sep-2026 — both absent — and the voucher silently lost room type, guests and
 * cancellation policy (TBO portal checkpoint 39). Trimmed from the live response
 * for BookingId 2200219, TBO's own test booking.
 */
const live = {
  GetBookingDetailResult: {
    ResponseStatus: 1,
    Status: 1,
    HotelBookingStatus: "Confirmed",
    BookingId: 2200219,
    ConfirmationNo: "7616164755435",
    BookingRefNo: "145114447592024",
    HotelName: "Sahara Star",
    CheckInDate: "2026-12-01T00:00:00",
    CheckOutDate: "2026-12-03T00:00:00",
    NoOfRooms: 1,
    NetAmount: 30191.65,
    InvoiceAmount: 30191,
    Rooms: [
      {
        RoomTypeName: "Mercury City View Room - King Bed,1 King Bed",
        Inclusion: "Free valet parking,Free self parking,Non-Smoking",
        HotelPassenger: [{ Title: "Mr", FirstName: "leoo", LastName: "test", PaxType: 1 }],
        CancellationPolicies: null,
        CancelPolicies: [
          { CancellationCharge: 0, ChargeType: 1, Currency: "INR", FromDate: "27/09/2026 00:00:00", ToDate: "28/11/2026 23:59:59" },
          { CancellationCharge: 15192, ChargeType: 1, Currency: "INR", FromDate: "29/11/2026 00:00:00", ToDate: "30/11/2026 23:59:59" },
          { CancellationCharge: 100, ChargeType: 2, Currency: "INR", FromDate: "01/12/2026 00:00:00", ToDate: "03/12/2026 23:59:59" },
        ],
      },
    ],
  },
};

describe("mapBookingDetail", () => {
  it("reads rooms, guests and cancellation windows from the live shape", () => {
    const d = mapBookingDetail(live);
    expect(d.ok).toBe(true);
    expect(d.rooms).toHaveLength(1);
    const room = d.rooms![0];
    expect(room.roomTypeName).toBe("Mercury City View Room - King Bed,1 King Bed");
    expect(room.inclusion).toContain("Free valet parking");
    expect(room.guests).toEqual(["Mr leoo test"]);
    expect(room.cancelPolicies).toEqual([
      { fromDate: "27/09/2026 00:00:00", toDate: "28/11/2026 23:59:59", chargeType: 1, charge: 0, currency: "INR" },
      { fromDate: "29/11/2026 00:00:00", toDate: "30/11/2026 23:59:59", chargeType: 1, charge: 15192, currency: "INR" },
      { fromDate: "01/12/2026 00:00:00", toDate: "03/12/2026 23:59:59", chargeType: 2, charge: 100, currency: "INR" },
    ]);
  });

  it("still accepts the older HotelRoomsDetails / CancellationPolicies names", () => {
    const d = mapBookingDetail({
      GetBookingDetailResult: {
        ResponseStatus: 1,
        HotelRoomsDetails: [
          { RoomTypeName: "Deluxe", CancellationPolicies: [{ FromDate: "01-12-2026", Charge: 500, ChargeType: 1 }] },
        ],
      },
    });
    expect(d.rooms?.[0].roomTypeName).toBe("Deluxe");
    expect(d.rooms?.[0].cancelPolicies[0].charge).toBe(500);
  });

  it("reports TBO's error instead of an empty voucher", () => {
    const d = mapBookingDetail({ GetBookingDetailResult: { ResponseStatus: 2, Error: { ErrorMessage: "Booking not found." } } });
    expect(d).toEqual({ ok: false, error: "Booking not found." });
  });
});
