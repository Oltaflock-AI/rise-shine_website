/**
 * Which TBO environment are we pointed at?
 *
 * Staging and live are different hosts, not just different credentials (TBO issued the
 * live URLs on 2026-08-11), so the host tells us the environment. The service bases are
 * read from the TBO_*_URL vars — unset means staging.
 *
 * This exists for one reason: the payment guard in the booking routes. Payment is only
 * REQUIRED when Razorpay is configured, which is correct for staging — certification
 * needs bookings without a payment gateway. Against live credentials the same branch
 * issues real tickets on agency credit for free, so the guard makes the combination
 * "live TBO + no Razorpay" refuse to book instead of quietly giving stock away.
 *
 * FLIGHTS and HOTELS are judged separately, because they are separate stacks and can be
 * at different stages: the flight services went live while the hotel services are still
 * on TBO's certification host. Judging hotels by the flight hosts blocked TBO's own
 * portal verification — they could not complete a single test booking (17-Aug-2026).
 */

/** Live flight service hosts. */
const LIVE_FLIGHT_HOST = "travelboutiqueonline.com";

/**
 * TBO's hotel CERTIFICATION hosts. Anything else is treated as live, so an unknown or
 * newly-issued host fails closed (payment required) rather than open.
 */
const TEST_HOTEL_HOSTS = ["affiliate.tektravels.com", "hotelbe.tektravels.com", "api.tbotechnology.in/hotelapi/staging"];

const DEFAULT_HOTEL_URL = "https://affiliate.tektravels.com/HotelAPI";
const DEFAULT_HOTEL_BE_URL = "https://HotelBE.tektravels.com/hotelservice.svc/rest";

/** True when any TBO FLIGHT service base points at the production hosts. */
export function tboIsLive(): boolean {
  return [process.env.TBO_AUTH_URL, process.env.TBO_SEARCH_URL, process.env.TBO_BOOK_URL].some(
    (u) => u?.toLowerCase().includes(LIVE_FLIGHT_HOST),
  );
}

/**
 * True unless EVERY hotel service base is a known TBO certification host. A host we do
 * not recognise counts as live — the safe direction, since the cost of being wrong is
 * either a blocked test booking (recoverable) or a free live booking (not).
 */
export function tboHotelIsLive(): boolean {
  const bases = [
    process.env.TBO_HOTEL_URL || DEFAULT_HOTEL_URL,
    process.env.TBO_HOTEL_BE_URL || DEFAULT_HOTEL_BE_URL,
  ].map((u) => u.toLowerCase());
  return !bases.every((b) => TEST_HOTEL_HOSTS.some((host) => b.includes(host)));
}

/**
 * True when we are live but have no way to charge — booking must be refused outright.
 * Fails closed: adding live URLs without payment keys disables booking rather than
 * enabling free ones.
 */
export function bookingBlockedForMissingPayments(razorpayConfigured: boolean): boolean {
  return tboIsLive() && !razorpayConfigured;
}

/** The hotel equivalent — judged on the hotel hosts, not the flight ones. */
export function hotelBookingBlockedForMissingPayments(razorpayConfigured: boolean): boolean {
  return tboHotelIsLive() && !razorpayConfigured;
}

/**
 * May a hotel booking be completed WITHOUT taking payment?
 *
 * Only on TBO's certification hosts, and only while no payment gateway is configured —
 * which is exactly the state certification runs in. The moment either changes (live
 * hotel hosts, or Razorpay keys present) this returns false and the paid path is the
 * only path.
 */
export function hotelUnpaidBookingAllowed(razorpayConfigured: boolean): boolean {
  return !razorpayConfigured && !tboHotelIsLive();
}
