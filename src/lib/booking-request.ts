import "server-only";

/**
 * Shape + normalize an incoming booking body into a TBO `BookingRequest`.
 *
 * Shared by /api/payment/order (pre-charge validation) and /api/book (ticketing) so
 * both act on the EXACT same request — required fields, at least one passenger, and
 * TBO title normalization ("Master"/"Miss" are rejected) + canonical casing.
 */
import { normalizeTitle, type PaxType } from "@/lib/tbo-validate";
import type { BookingRequest } from "@/lib/tbo-book";
import type { BillingDetails } from "@/lib/travel-profile";

export type IncomingBooking = {
  traceId?: string;
  searchedAt?: number;
  resultIndex?: string;
  isLCC?: boolean;
  airlineCode?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departDate?: string;
  isInternational?: boolean;
  passengers?: Array<Record<string, unknown>>;
  gst?: BookingRequest["gst"];
  /**
   * The structured billing address, carried alongside the TBO request rather
   * than inside it — TBO's Passenger has no state/PIN field, so the form folds
   * those into AddressLine2. Ignored here on purpose: nothing about ticketing
   * depends on it. /api/book hands it to lib/travel-profile so the customer's
   * next checkout can prefill (see migrations/0008).
   */
  billing?: BillingDetails;
};

export type ParseResult =
  | { ok: true; req: BookingRequest }
  | { ok: false; error: string; status: number };

export function parseBookingRequest(body: IncomingBooking): ParseResult {
  const required = ["traceId", "resultIndex", "origin", "destination", "departDate"] as const;
  for (const k of required) {
    if (!body[k]) return { ok: false, error: `Missing "${k}".`, status: 400 };
  }
  if (!body.passengers?.length) {
    return { ok: false, error: "At least one passenger is required.", status: 400 };
  }

  const passengers = body.passengers.map((p) => {
    const paxType = (Number(p.PaxType) || 1) as PaxType;
    const gender = (Number(p.Gender) === 2 ? 2 : 1) as 1 | 2;
    return {
      ...p,
      PaxType: paxType,
      Gender: gender,
      Title: normalizeTitle(String(p.Title ?? ""), paxType, gender),
    };
  }) as BookingRequest["passengers"];

  const req = {
    traceId: body.traceId!,
    searchedAt: body.searchedAt ?? Date.now(),
    resultIndex: body.resultIndex!,
    isLCC: Boolean(body.isLCC),
    airlineCode: (body.airlineCode ?? "").toUpperCase(),
    flightNumber: body.flightNumber ?? "",
    origin: body.origin!.toUpperCase(),
    destination: body.destination!.toUpperCase(),
    departDate: body.departDate!,
    isInternational: Boolean(body.isInternational),
    passengers,
    gst: body.gst,
  } satisfies BookingRequest;

  return { ok: true, req };
}
