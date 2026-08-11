/**
 * Which TBO environment are we pointed at?
 *
 * Staging and live are different hosts, not just different credentials (TBO issued the
 * live URLs on 2026-08-11), so the host tells us the environment. The service bases are
 * read from TBO_AUTH_URL / TBO_SEARCH_URL / TBO_BOOK_URL — unset means staging.
 *
 * This exists for one reason: the payment guard in the booking routes. Payment is only
 * REQUIRED when Razorpay is configured, which is correct for staging — certification
 * needed bookings without a payment gateway. Against live credentials the same branch
 * issues real tickets on agency credit for free, so `requirePaymentForBooking` makes the
 * combination "live TBO + no Razorpay" refuse to book instead of quietly giving stock away.
 */

const LIVE_HOST = "travelboutiqueonline.com";

/** True when any TBO service base points at the production hosts. */
export function tboIsLive(): boolean {
  return [process.env.TBO_AUTH_URL, process.env.TBO_SEARCH_URL, process.env.TBO_BOOK_URL].some(
    (u) => u?.toLowerCase().includes(LIVE_HOST),
  );
}

/**
 * True when we are live but have no way to charge — booking must be refused outright.
 * Fails closed: adding live URLs without payment keys disables booking rather than
 * enabling free ones.
 */
export function bookingBlockedForMissingPayments(razorpayConfigured: boolean): boolean {
  return tboIsLive() && !razorpayConfigured;
}
