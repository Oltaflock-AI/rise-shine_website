import { searchHotels, type RoomOccupancy } from "@/lib/tbo-hotel";
import { hotelCodesByCity } from "@/lib/tbo-hotel-static";
import { tooMany } from "@/lib/rate-limit";

// Live TBO hotel search — never statically cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/hotels — search priced rooms for a stay.
 *
 * Body: { checkIn, checkOut (YYYY-MM-DD), nationality?, rooms: [{adults, childrenAges?}],
 *         hotelCodes?: string[], cityCode?: string, refundableOnly?, mealType? }
 *
 * Provide `hotelCodes` directly, or a `cityCode` — we resolve that city's hotels
 * via the static-data API and price the first 100 (TBO's per-request ceiling).
 */
export async function POST(req: Request) {
  const limited = tooMany(req, "hotels", 15);
  if (limited) return limited;

  let body: {
    checkIn?: string;
    checkOut?: string;
    nationality?: string;
    rooms?: RoomOccupancy[];
    hotelCodes?: string[];
    cityCode?: string;
    refundableOnly?: boolean;
    mealType?: "All" | "WithMeal" | "RoomOnly";
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.checkIn || !ISO_DATE.test(body.checkIn) || !body.checkOut || !ISO_DATE.test(body.checkOut)) {
    return Response.json(
      { ok: false, error: 'Missing/invalid "checkIn" or "checkOut" (YYYY-MM-DD).' },
      { status: 400 },
    );
  }
  if (body.checkOut <= body.checkIn) {
    return Response.json({ ok: false, error: "checkOut must be after checkIn." }, { status: 400 });
  }

  const rooms: RoomOccupancy[] =
    body.rooms?.length ? body.rooms.map((r) => ({ adults: Math.max(1, Number(r.adults) || 1), childrenAges: r.childrenAges })) : [{ adults: 2 }];

  let hotelCodes = body.hotelCodes ?? [];
  if (!hotelCodes.length && body.cityCode) {
    try {
      const stubs = await hotelCodesByCity(body.cityCode);
      hotelCodes = stubs.slice(0, 100).map((s) => s.code);
    } catch {
      return Response.json({ ok: false, error: "Could not resolve hotels for that city." }, { status: 502 });
    }
  }
  if (!hotelCodes.length) {
    return Response.json({ ok: false, error: 'Provide "hotelCodes" or a "cityCode".' }, { status: 400 });
  }

  const result = await searchHotels({
    checkInISO: body.checkIn,
    checkOutISO: body.checkOut,
    hotelCodes,
    nationality: body.nationality || "IN",
    rooms,
    refundableOnly: body.refundableOnly,
    mealType: body.mealType,
  });

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
