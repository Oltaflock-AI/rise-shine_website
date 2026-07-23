/**
 * TBO (TekTravels) Hotel API — BOOK + recovery. SERVER ONLY.
 *
 * The committing step of the hotel flow. Runs on the SAME host+creds as
 * Search/PreBook (affiliate.tektravels.com/HotelAPI + agency Basic auth) because
 * a `BookingCode` is scoped to the account that priced it. Docs:
 * https://apidoc.tektravels.com/hotelnew
 *
 *   Flow (per booking): Search → PreBook → **Book** → GetBookingDetail
 *
 * Rules that mirror the flight layer and TBO's hotel validation page:
 *  - PreBook's `ValidationInfo` decides what Book must carry (PAN/passport/GST).
 *  - The lead passenger of EACH room must have Email + Phone.
 *  - Book is NEVER auto-retried — a retry can double-book. On a timeout we
 *    recover read-only via GetBookingDetail, never by re-booking.
 *
 * Never import from a client component; reach via /api/hotels/book.
 */
import { TboHotelError } from "./tbo-hotel-static";
import { bookingCall, type HotelValidationInfo } from "./tbo-hotel";
import { hotelBookingDetail } from "./tbo-hotel-post";

const TIMEOUT_BOOK = 300_000; // Book may run long — never cut it short.

// ── request shapes ──
export type HotelPassenger = {
  title: string;
  firstName: string;
  lastName: string;
  /** ISO-2 nationality; falls back to the booking's GuestNationality. */
  paxType: 1 | 2; // 1 = Adult, 2 = Child
  leadPassenger?: boolean;
  age?: number; // child only
  email?: string; // mandatory for a room's lead pax
  phone?: string; // mandatory for a room's lead pax
  pan?: string;
  passportNo?: string;
  passportIssueDate?: string;
  passportExpDate?: string;
};

export type HotelBookRoom = { passengers: HotelPassenger[] };

export type HotelBookRequest = {
  bookingCode: string;
  nationality: string;
  netAmount: number;
  isVoucherBooking?: boolean;
  rooms: HotelBookRoom[];
  /** From the PreBook that priced this bookingCode — drives required fields. */
  validation?: HotelValidationInfo;
  clientReferenceId?: string;
};

export type HotelBookResult = {
  ok: boolean;
  /** true when a client-side validation stopped us before calling TBO. */
  rule?: boolean;
  status?: "confirmed" | "verify-price" | "failed" | "cancelled" | "unknown";
  bookingId?: number;
  confirmationNo?: string;
  bookingRefNo?: string;
  isPriceChanged?: boolean;
  netAmount?: number;
  error?: string;
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Enforce TBO's hotel booking rules BEFORE calling Book, so a bad request is
 * rejected here (fast, our fault → 422) instead of at the supplier. Returns an
 * error string, or null when the passengers are valid.
 */
export function validateHotelPax(req: HotelBookRequest): string | null {
  if (!req.rooms.length) return "At least one room is required.";
  const v = req.validation;

  for (let i = 0; i < req.rooms.length; i++) {
    const pax = req.rooms[i].passengers;
    if (!pax.length) return `Room ${i + 1} has no passengers.`;
    const leads = pax.filter((p) => p.leadPassenger);
    if (leads.length !== 1) return `Room ${i + 1} must have exactly one lead passenger.`;
    const lead = leads[0];
    if (!lead.email?.trim() || !lead.phone?.trim())
      return `Room ${i + 1}'s lead guest needs both an email and a phone number.`;

    for (const p of pax) {
      if (!p.firstName?.trim() || !p.lastName?.trim()) return `Every guest needs a first and last name.`;
      if (p.paxType === 2 && (p.age == null || p.age < 0 || p.age > 12))
        return `Child guests need an age of 0–12.`;
      const min = v?.paxNameMinLength ?? 2;
      const max = v?.paxNameMaxLength ?? 50;
      if (p.firstName.trim().length < min || p.firstName.trim().length > max || p.lastName.trim().length < min || p.lastName.trim().length > max)
        return `Guest names must be ${min}–${max} characters.`;
    }

    if (v?.passportMandatory) {
      for (const p of pax) {
        if (!p.passportNo?.trim() || !p.passportIssueDate || !p.passportExpDate)
          return `This rate requires full passport details for every guest.`;
      }
    }
  }

  if (v?.panMandatory) {
    const need = v.panCountRequired ?? 1;
    const pans = req.rooms.flatMap((r) => r.passengers).map((p) => p.pan?.trim().toUpperCase()).filter(Boolean) as string[];
    const uniq = [...new Set(pans)];
    if (uniq.length < need) return `This rate requires ${need} PAN card${need > 1 ? "s" : ""}.`;
    for (const pan of uniq) if (!PAN_RE.test(pan)) return `PAN "${pan}" is not a valid format (AAAAA9999A).`;
  }
  return null;
}

function ip(): string {
  return process.env.TBO_END_USER_IP || "115.112.175.13";
}

/**
 * After a Book timeout: poll GetBookingDetail by our ClientReferenceNo to learn
 * whether the booking actually went through. Returns a definitive result when
 * TBO answers (confirmed → ok, cancelled/failed → failed), or null when the
 * booking can't be found / detail service is unreachable — the caller then
 * surfaces the "verify manually, do not retry" state.
 */
async function recoverBookByReference(clientReferenceNo: string): Promise<HotelBookResult | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10_000));
    const d = await hotelBookingDetail({ clientReferenceNo });
    if (!d.ok) continue;
    if (d.status === 1) {
      return {
        ok: true,
        status: "confirmed",
        bookingId: d.bookingId,
        confirmationNo: d.confirmationNo,
        bookingRefNo: d.bookingRefNo,
      };
    }
    if (d.status === 0 || d.status === 6) {
      return { ok: false, status: d.status === 6 ? "cancelled" : "failed", error: "The booking did not go through." };
    }
  }
  return null;
}

/**
 * Book — commit the reserved room. Validates first (422-style), then calls TBO
 * once. On timeout it recovers via GetBookingDetail rather than re-booking.
 */
export async function bookHotel(req: HotelBookRequest): Promise<HotelBookResult> {
  const ruleError = validateHotelPax(req);
  if (ruleError) return { ok: false, rule: true, error: ruleError };

  const HotelRoomsDetails = req.rooms.map((room) => ({
    HotelPassenger: room.passengers.map((p) => ({
      Title: p.title,
      FirstName: p.firstName.trim(),
      LastName: p.lastName.trim(),
      PaxType: p.paxType,
      LeadPassenger: Boolean(p.leadPassenger),
      ...(p.paxType === 2 && p.age != null ? { Age: p.age } : {}),
      ...(p.email ? { Email: p.email.trim() } : {}),
      ...(p.phone ? { Phoneno: p.phone.trim() } : {}),
      ...(p.pan ? { PAN: p.pan.trim().toUpperCase() } : {}),
      ...(p.passportNo
        ? { PassportNo: p.passportNo.trim(), PassportIssueDate: p.passportIssueDate, PassportExpDate: p.passportExpDate }
        : {}),
    })),
  }));

  const body = {
    EndUserIp: ip(),
    BookingCode: req.bookingCode,
    GuestNationality: req.nationality.toUpperCase(),
    IsVoucherBooking: req.isVoucherBooking ?? true,
    NetAmount: req.netAmount,
    HotelRoomsDetails,
    ...(req.clientReferenceId ? { ClientReferenceId: req.clientReferenceId } : {}),
  };

  type Resp = {
    Status?: { Code?: number; Description?: string };
    BookResult?: {
      Status?: number; // 0 Failed, 1 Confirmed, 3 VerifyPrice, 6 Cancelled
      BookingId?: number;
      ConfirmationNo?: string;
      BookingRefNo?: string;
      IsPriceChanged?: boolean;
      NetAmount?: number;
      Error?: { ErrorCode?: number; ErrorMessage?: string };
    };
  };

  let j: Resp;
  try {
    j = await bookingCall<Resp>("Book", body, TIMEOUT_BOOK);
  } catch (e) {
    // A timeout/network fault must NEVER trigger a re-book (double-book risk).
    // Instead, ask TBO read-only whether the booking exists — Book always carries
    // our ClientReferenceId, so GetBookingDetail can find it either way.
    if (req.clientReferenceId) {
      const rec = await recoverBookByReference(req.clientReferenceId);
      if (rec) return rec;
    }
    return {
      ok: false,
      status: "unknown",
      error:
        e instanceof TboHotelError
          ? "The booking request timed out and could not be confirmed either way. Do NOT retry — our team will verify against the booking reference before any re-attempt."
          : e instanceof Error
            ? e.message
            : "network",
    };
  }

  const B = j.BookResult;
  if (!B) return { ok: false, status: "failed", error: j.Status?.Description || "Book returned no result." };

  const statusMap: Record<number, HotelBookResult["status"]> = { 0: "failed", 1: "confirmed", 3: "verify-price", 6: "cancelled" };
  const status = statusMap[B.Status ?? -1] ?? "unknown";

  if (status === "confirmed") {
    return {
      ok: true,
      status,
      bookingId: B.BookingId,
      confirmationNo: B.ConfirmationNo,
      bookingRefNo: B.BookingRefNo,
      netAmount: B.NetAmount,
    };
  }
  if (status === "verify-price") {
    return { ok: false, status, isPriceChanged: true, netAmount: B.NetAmount, error: "The room price changed — re-price (PreBook) and confirm the new fare before booking." };
  }
  return { ok: false, status, error: B.Error?.ErrorMessage || `Booking ${status}.` };
}
