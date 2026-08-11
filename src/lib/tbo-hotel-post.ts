import "server-only";

/**
 * TBO Hotel API — POST-BOOKING family. SERVER ONLY.
 *
 * GetBookingDetail / GenerateVoucher / SendChangeRequest (cancel) live on a
 * THIRD host — `HotelBE.tektravels.com` — and use the legacy TokenId auth
 * (Sharedapi Authenticate, same agency creds as flights; token shared via
 * lib/tbo.getAuthToken). Docs: apidoc.tektravels.com/hotelnew — URLs read from
 * the method pages:
 *   .../hotelservice.svc/rest/Getbookingdetail
 *   .../hotelservice.svc/rest/GenerateVoucher
 *   .../hotelservice.svc/rest/SendChangeRequest  (RequestType 4 = cancel)
 *   .../hotelservice.svc/rest/GetChangeRequestStatus
 *
 * ErrorCode 6 (invalid token) → refresh + retry once, matching the CODE not the
 * message (TBO checklist rule). These calls are all read-only or idempotent
 * change-requests — safe to retry, unlike Book.
 */
import { getAuthToken } from "./tbo";
import { TboHotelError } from "./tbo-hotel-static";
import { tboFetch } from "./tbo-fetch";

const BASE = (process.env.TBO_HOTEL_BE_URL || "https://HotelBE.tektravels.com/hotelservice.svc/rest").replace(/\/+$/, "");
const TOKEN_INVALID = 6;

function ip(): string {
  return process.env.TBO_END_USER_IP || "115.112.175.13";
}

type Json = Record<string, unknown>;

async function post(method: string, body: Json, timeoutMs = 30_000): Promise<Json> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await tboFetch(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctl.signal,
    });
    return (await r.json()) as Json;
  } catch {
    throw new TboHotelError(`Network error calling ${method}.`, 0);
  } finally {
    clearTimeout(t);
  }
}

/** Call a TokenId-family method, refreshing the token once on ErrorCode 6. */
async function call(method: string, fields: Json): Promise<Json> {
  let token = await getAuthToken();
  if (!token) throw new TboHotelError("TBO credentials are not configured.", -1);

  let j = await post(method, { EndUserIp: ip(), TokenId: token, ...fields });
  const err = (j as { Error?: { ErrorCode?: number } }).Error;
  if (err?.ErrorCode === TOKEN_INVALID) {
    token = await getAuthToken(true);
    if (token) j = await post(method, { EndUserIp: ip(), TokenId: token, ...fields });
  }
  return j;
}

// ── GetBookingDetail ──
export type VoucherRoom = {
  roomTypeName?: string;
  mealType?: string;
  totalFare?: number;
  currency?: string;
  guests: string[];
  cancelPolicies: Array<{ fromDate: string; chargeType?: string | number; charge: number }>;
};

export type HotelBookingDetail = {
  ok: boolean;
  /** TBO booking Status: 1 = Confirmed, 6 = Cancelled … */
  status?: number;
  hotelBookingStatus?: string;
  bookingId?: number;
  confirmationNo?: string;
  bookingRefNo?: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  /** Voucher detail — TBO portal checkpoints 39 and 41. */
  address?: string;
  city?: string;
  isVoucherBooked?: boolean;
  noOfRooms?: number;
  invoiceAmount?: number;
  currency?: string;
  rooms?: VoucherRoom[];
  error?: string;
};

/**
 * Look up a booking by BookingId, TraceId, ClientReferenceNo, or
 * ConfirmationNo (+ lead guest names). This is the recovery/status method —
 * the only trustworthy answer to "did that Book actually go through?".
 */
export async function hotelBookingDetail(args: {
  bookingId?: number;
  traceId?: string;
  clientReferenceNo?: string;
  confirmationNo?: string;
  firstName?: string;
  lastName?: string;
}): Promise<HotelBookingDetail> {
  const fields: Json = {};
  if (args.bookingId) fields.BookingId = args.bookingId;
  if (args.traceId) fields.TraceId = args.traceId;
  if (args.clientReferenceNo) fields.ClientReferenceNo = args.clientReferenceNo;
  if (args.confirmationNo) {
    fields.ConfirmationNo = args.confirmationNo;
    fields.FirstName = args.firstName;
    fields.LastName = args.lastName;
  }
  if (!Object.keys(fields).length) return { ok: false, error: "No booking identifier given." };

  let j: Json;
  try {
    j = await call("Getbookingdetail", fields);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }

  type RawPax = { Title?: string; FirstName?: string; LastName?: string; PaxType?: number; Age?: number };
  type RawRoomDetail = {
    RoomTypeName?: string;
    MealType?: string;
    Price?: { PublishedPrice?: number; RoomPrice?: number; Tax?: number; CurrencyCode?: string };
    TotalFare?: number;
    Currency?: string;
    HotelPassenger?: RawPax[];
    CancellationPolicies?: Array<{ FromDate?: string; ChargeType?: string | number; Charge?: number; CancellationCharge?: number }>;
  };
  type R = {
    GetBookingDetailResult?: {
      ResponseStatus?: number;
      Status?: number;
      HotelBookingStatus?: string;
      BookingId?: number;
      ConfirmationNo?: string;
      BookingRefNo?: string;
      HotelName?: string;
      AddressLine1?: string;
      City?: string;
      CheckInDate?: string;
      CheckOutDate?: string;
      IsVoucherBooked?: boolean;
      NoOfRooms?: number;
      InvoiceAmount?: number;
      Currency?: string;
      HotelRoomsDetails?: RawRoomDetail[];
      Error?: { ErrorCode?: number; ErrorMessage?: string };
    };
  };
  const R = (j as R).GetBookingDetailResult;
  if (!R || R.ResponseStatus !== 1) {
    return { ok: false, error: R?.Error?.ErrorMessage || "Booking not found." };
  }

  // Everything the voucher has to show: rooms, guests, per-room fare and the
  // cancellation policy as TBO holds it (portal checkpoints 39 and 41).
  const rooms: VoucherRoom[] = (R.HotelRoomsDetails ?? []).map((rd) => ({
    roomTypeName: rd.RoomTypeName,
    mealType: rd.MealType,
    totalFare: rd.TotalFare ?? rd.Price?.PublishedPrice ?? rd.Price?.RoomPrice,
    currency: rd.Currency ?? rd.Price?.CurrencyCode,
    guests: (rd.HotelPassenger ?? [])
      .map((p) => [p.Title, p.FirstName, p.LastName].filter(Boolean).join(" ").trim())
      .filter(Boolean),
    cancelPolicies: (rd.CancellationPolicies ?? []).map((c) => ({
      fromDate: c.FromDate ?? "",
      chargeType: c.ChargeType,
      charge: c.Charge ?? c.CancellationCharge ?? 0,
    })),
  }));

  return {
    ok: true,
    status: R.Status,
    hotelBookingStatus: R.HotelBookingStatus,
    bookingId: R.BookingId,
    confirmationNo: R.ConfirmationNo,
    bookingRefNo: R.BookingRefNo,
    hotelName: R.HotelName,
    address: R.AddressLine1,
    city: R.City,
    checkIn: R.CheckInDate,
    checkOut: R.CheckOutDate,
    isVoucherBooked: R.IsVoucherBooked,
    noOfRooms: R.NoOfRooms,
    invoiceAmount: R.InvoiceAmount,
    currency: R.Currency,
    ...(rooms.length ? { rooms } : {}),
  };
}

// ── GenerateVoucher (needed for hold bookings; voucher bookings self-voucher) ──
export async function generateHotelVoucher(bookingId: number): Promise<{ ok: boolean; error?: string }> {
  let j: Json;
  try {
    j = await call("GenerateVoucher", { BookingId: bookingId });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
  const R = (j as { GenerateVoucherResult?: { ResponseStatus?: number; VoucherStatus?: boolean; Error?: { ErrorMessage?: string } } })
    .GenerateVoucherResult;
  if (!R || R.ResponseStatus !== 1 || !R.VoucherStatus) {
    return { ok: false, error: R?.Error?.ErrorMessage || "Voucher generation failed." };
  }
  return { ok: true };
}

// ── Cancel: SendChangeRequest (RequestType 4) + status poll ──
export type CancelResult = {
  ok: boolean;
  changeRequestId?: number;
  /** 0 NotSet · 1 Pending · 2 InProgress · 3 Processed · 4 Rejected */
  changeRequestStatus?: number;
  refundedAmount?: number;
  cancellationCharge?: number;
  error?: string;
};

export async function cancelHotelBooking(bookingId: number, remarks: string): Promise<CancelResult> {
  let j: Json;
  try {
    j = await call("SendChangeRequest", { BookingId: bookingId, RequestType: 4, Remarks: remarks || "Customer requested cancellation" });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
  const R = (j as {
    HotelChangeRequestResult?: {
      ResponseStatus?: number;
      ChangeRequestId?: number;
      ChangeRequestStatus?: number;
      Error?: { ErrorMessage?: string };
    };
  }).HotelChangeRequestResult;
  if (!R || R.ResponseStatus !== 1) {
    return { ok: false, error: R?.Error?.ErrorMessage || "Cancellation request failed." };
  }
  return { ok: true, changeRequestId: R.ChangeRequestId, changeRequestStatus: R.ChangeRequestStatus };
}

export async function hotelCancelStatus(changeRequestId: number): Promise<CancelResult> {
  let j: Json;
  try {
    j = await call("GetChangeRequestStatus", { ChangeRequestId: changeRequestId });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
  const R = (j as {
    HotelChangeRequestStatusResult?: {
      ResponseStatus?: number;
      ChangeRequestId?: number;
      ChangeRequestStatus?: number;
      RefundedAmount?: number;
      CancellationCharge?: number;
      Error?: { ErrorMessage?: string };
    };
  }).HotelChangeRequestStatusResult;
  if (!R || R.ResponseStatus !== 1) {
    return { ok: false, error: R?.Error?.ErrorMessage || "Could not fetch cancellation status." };
  }
  return {
    ok: true,
    changeRequestId: R.ChangeRequestId,
    changeRequestStatus: R.ChangeRequestStatus,
    refundedAmount: R.RefundedAmount,
    cancellationCharge: R.CancellationCharge,
  };
}
