import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { tboHotelIsLive } from "@/lib/tbo-env";

/**
 * A booking session for TBO's portal verifier — the one way to complete a hotel
 * booking on the public site without paying.
 *
 * Why it exists. Certification is meant to run WITHOUT a payment gateway: that is
 * what `hotelUnpaidBookingAllowed` is for. But Cashfree went live for FLIGHTS on
 * 18-Aug-2026, and `cashfreeConfigured` is one global flag — so from that day the
 * hotel checkout demanded a real payment even though the hotel stack is still on
 * TBO's certification host. TBO's verifier could not get past it (they tried a
 * MobiKwik wallet and got "your cell number is unverified"), which stalled seven
 * portal checkpoints behind a payment page — Book, PAN, voucher, BookingDetail,
 * cancel. Removing the flight keys to unblock them would stop real customers
 * buying real tickets.
 *
 * Two conditions, both required, and the second is the one that matters:
 *
 *  1. The browser presents a secret held only in `TBO_VERIFICATION_TOKEN`.
 *  2. The hotel services are STILL on a TBO certification host.
 *
 * So the token can never give away live inventory: the day `TBO_HOTEL_URL` moves
 * to a live host this returns false for everyone, token or not. Flights are not
 * touched at all — there is no unpaid flight path, and this is never consulted by
 * one.
 *
 * Unset token = feature absent, not feature open.
 */

const COOKIE = "tbo_verification";
/** 30 days — TBO's verification rounds have run over weeks. */
const MAX_AGE = 60 * 60 * 24 * 30;

const TOKEN = process.env.TBO_VERIFICATION_TOKEN?.trim() || "";

/** True when a token is configured at all. */
export const tboVerificationConfigured = TOKEN.length > 0;

/** Constant-time compare that tolerates a length mismatch. */
export function tokenMatches(candidate: string): boolean {
  if (!tboVerificationConfigured) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) {
    // Still burn a comparison so length is not readable from timing.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Does this request carry a valid verification session AND are the hotel
 * services still on certification hosts?
 *
 * The only question callers should ask. Server-side only — it reads cookies.
 */
export async function hotelVerificationSession(): Promise<boolean> {
  if (!tboVerificationConfigured) return false;
  if (tboHotelIsLive()) return false;
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value ?? "";
  return Boolean(value) && tokenMatches(value);
}

export const TBO_VERIFICATION_COOKIE = COOKIE;
export const TBO_VERIFICATION_MAX_AGE = MAX_AGE;
