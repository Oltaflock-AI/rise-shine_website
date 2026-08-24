"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BookingDetailCheck } from "./BookingDetailCheck";
import { formatDate } from "@/lib/format-date";
import {
  cancellationHeadline,
  cancellationWindows,
  tboDateToISO,
} from "@/lib/hotel-cancellation";
import { formatDeadline, mealLabel, perNightFare } from "@/lib/hotel-display";
import { cn } from "@/lib/cn";
import { controlClass, DateField, Select } from "@/components/ui/form-controls";
import {
  openCashfreeCheckout,
  type CashfreeMode,
} from "@/lib/cashfree-checkout";

// ── quote/booked shapes (subset of the API responses) ──
type Validation = {
  panMandatory?: boolean;
  passportMandatory?: boolean;
  gstAllowed?: boolean;
  paxNameMinLength?: number;
  paxNameMaxLength?: number;
  panCountRequired?: number;
};
type Quote = {
  ok: boolean;
  netAmount?: number;
  totalFare?: number;
  currency?: string;
  isPriceChanged?: boolean;
  isCancellationPolicyChanged?: boolean;
  cancelPolicies?: {
    fromDate: string;
    chargeType?: string | number;
    charge: number;
  }[];
  mealType?: string;
  inclusion?: string;
  rateConditions?: string[];
  roomPromotions?: string[];
  supplements?: {
    type?: string;
    description?: string;
    price?: number;
    currency?: string;
  }[];
  amenities?: string[];
  lastCancellationDeadline?: string;
  validation?: Validation;
  error?: string;
};
type Booked = {
  ok: boolean;
  rule?: boolean;
  status?: string;
  bookingId?: number;
  confirmationNo?: string;
  bookingRefNo?: string;
  refunded?: boolean;
  /** Server says the order was never paid — worded as "not charged", not as a failure. */
  unpaid?: boolean;
  error?: string;
};

// TBO's hotel API accepts only these three guest titles (no Miss/Mstr).
const TITLES = ["Mr", "Mrs", "Ms"];
const TODAY = new Date().toISOString().slice(0, 10);

// TBO Book rejects special characters in names and caps length (default 25,
// or the rate's ValidationInfo range) — enforce while typing, server re-checks.
function cleanName(raw: string, v?: Validation): string {
  return raw
    .replace(/[^A-Za-z ]/g, "")
    .replace(/ {2,}/g, " ")
    .slice(0, v?.paxNameMaxLength ?? 25);
}

type Guest = {
  roomIndex: number;
  lead: boolean;
  /** Set for child guests (from the search occupancy); drives PaxType at Book. */
  childAge?: number;
  title: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  pan: string;
  passportNo: string;
  passportIssue: string;
  passportExp: string;
};

export function HotelBookingForm({
  b,
  contactEmail,
}: {
  b: Record<string, string>;
  contactEmail: string;
}) {
  const rooms = Math.max(1, Number(b.rooms || 1));
  const adults = Math.max(1, Number(b.adults || 2));
  // Children per room, carried from the search (ages comma-joined).
  const childAges = (b.ages || "")
    .split(",")
    .map((a) => parseInt(a, 10))
    .filter((a) => Number.isFinite(a) && a >= 1 && a <= 17)
    .slice(0, Math.max(0, Number(b.children || 0)));

  const [quote, setQuote] = useState<Quote | null>(null);
  const [guests, setGuests] = useState<Guest[]>(() => {
    const blank = (
      roomIndex: number,
      lead: boolean,
      childAge?: number,
    ): Guest => ({
      roomIndex,
      lead,
      childAge,
      title: childAge != null ? "Ms" : "Mr",
      first: "",
      last: "",
      email: roomIndex === 0 && lead ? contactEmail : "",
      phone: "",
      pan: "",
      passportNo: "",
      passportIssue: "",
      passportExp: "",
    });
    const list: Guest[] = [];
    for (let r = 0; r < rooms; r++) {
      for (let a = 0; a < adults; a++) list.push(blank(r, a === 0));
      for (const age of childAges) list.push(blank(r, false, age));
    }
    return list;
  });
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);

  /**
   * On a phone the summary aside — and with it this failure message — sits below
   * the whole guest form, while the CTA that triggers it is a fixed bar at the
   * bottom of the screen. Without this the guest taps "Pay & Book" and sees
   * nothing change. Bring the message into view and announce it.
   */
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!booked || booked.ok) return;
    const el = errorRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }, [booked]);

  // PreBook on mount: confirm the rate + learn what fields TBO requires.
  useEffect(() => {
    let alive = true;
    fetch("/api/hotels/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingCode: b.bookingCode,
        ...(b.cc ? { destinationCountry: b.cc } : {}),
      }),
    })
      .then((r) => r.json())
      .then((j) => alive && setQuote(j as Quote))
      .catch(
        () =>
          alive &&
          setQuote({
            ok: false,
            error: "Could not confirm this rate. Please try again.",
          }),
      );
    return () => {
      alive = false;
    };
  }, [b.bookingCode, b.cc]);

  const v = quote?.validation;
  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: quote?.currency || b.currency || "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [quote?.currency, b.currency],
  );
  // What the CUSTOMER pays and what the page shows: the PreBook TotalFare
  // (floored at the B2C RecommendedSellingRate). TBO portal checkpoint 30 —
  // NetAmount is TBO's charge to the agency, is never displayed, and rides only
  // in the Book RQ (checkpoint 31).
  const amountInr = quote?.totalFare ?? Number(b.fare || 0);
  // Windows that have already closed are dropped, so this can never promise a
  // refund deadline that passed before the guest reached the page.
  const cancelHeadline = cancellationHeadline(
    cancellationWindows(quote?.cancelPolicies),
    formatDeadline,
  );

  const setGuest = (i: number, patch: Partial<Guest>) =>
    setGuests((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));

  function buildRooms() {
    const byRoom: Array<{ passengers: Record<string, unknown>[] }> = Array.from(
      { length: rooms },
      () => ({ passengers: [] }),
    );
    for (const g of guests) {
      // TBO Book treats ≤12 as a Child (PaxType 2, Age required); older
      // "children" from the search ride as adults.
      const isChild = g.childAge != null && g.childAge <= 12;
      byRoom[g.roomIndex].passengers.push({
        title: g.title,
        firstName: g.first.trim(),
        lastName: g.last.trim(),
        paxType: isChild ? 2 : 1,
        ...(isChild ? { age: g.childAge } : {}),
        leadPassenger: g.lead,
        ...(g.lead ? { email: g.email.trim(), phone: g.phone.trim() } : {}),
        ...(g.pan.trim() ? { pan: g.pan.trim().toUpperCase() } : {}),
        ...(g.passportNo.trim()
          ? {
              passportNo: g.passportNo.trim(),
              passportIssueDate: g.passportIssue,
              passportExpDate: g.passportExp,
            }
          : {}),
      });
    }
    return byRoom;
  }

  function commonPayload() {
    return {
      bookingCode: b.bookingCode,
      // The nationality searched with — Book must match Search (checkpoint 27).
      nationality: b.nat || "IN",
      netAmount: quote?.netAmount ?? amountInr,
      isVoucherBooking: true,
      rooms: buildRooms(),
      validation: v,
      // Display context mirrored into the customer's account view.
      stay: {
        hotelName: b.hotel,
        city: b.city,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      },
    };
  }

  /**
   * POST /api/hotels/book — book the room, passing the Cashfree order the guest paid
   * (null on the certification hosts, where booking runs without a gateway).
   *
   * Only the order id is sent; the server re-reads the order from Cashfree and refuses
   * to book unless it is PAID and bound to this rate. `bookingCode` is overridden with
   * the one PreBook returned at order time, because that is what the payment is bound
   * to — a re-PreBooked code would not match.
   */
  async function sendToBook(orderId: string | null, bookingCode?: string) {
    try {
      const r = await fetch("/api/hotels/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commonPayload(),
          ...(bookingCode ? { bookingCode } : {}),
          payment: orderId ? { orderId } : undefined,
        }),
      });
      const parsed = (await r.json()) as Booked;
      if (parsed.ok) trackEvent("booking_confirmed", { kind: "hotel" });
      setBooked(
        parsed.unpaid
          ? {
              ok: false,
              error: "Payment was not completed — you have not been charged.",
            }
          : parsed,
      );
    } catch {
      setBooked({ ok: false, error: "Network error — please try again." });
    } finally {
      setBooking(false);
    }
  }

  /** Collect payment (Cashfree), then book. Money is taken BEFORE Book; the server refunds if Book fails. */
  async function submit() {
    // Light client check; the order route re-validates authoritatively before charging.
    const firstNames = new Set<string>();
    for (const g of guests) {
      if (!g.first.trim() || !g.last.trim())
        return setBooked({
          ok: false,
          rule: true,
          error: "Every guest needs a first and last name.",
        });
      if (g.lead && (!g.email.trim() || !g.phone.trim()))
        return setBooked({
          ok: false,
          rule: true,
          error: "Each room's lead guest needs an email and phone.",
        });
      // TBO accepts only one guest per first name on a booking, whatever the surname.
      const first = g.first.trim().toUpperCase();
      if (firstNames.has(first))
        return setBooked({
          ok: false,
          rule: true,
          error: `Two guests can't share the first name "${g.first.trim()}" — please give each guest their own first name.`,
        });
      firstNames.add(first);
    }

    setBooking(true);
    setBooked(null);

    let order: {
      ok: boolean;
      orderId?: string;
      paymentSessionId?: string;
      mode?: CashfreeMode;
      bookingCode?: string;
      error?: string;
      rule?: string;
      unpaidBookingAllowed?: boolean;
    };
    try {
      const r = await fetch("/api/hotels/payment/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commonPayload()),
      });
      if (r.status === 503) {
        // No payment gateway. The SERVER decides whether booking may still proceed:
        // on TBO's certification hosts an unpaid booking is the intended flow, while
        // against live credentials it would hold a real room on agency credit with no
        // money collected — so there the booking stops here.
        const j = (await r.json().catch(() => ({}))) as {
          unpaidBookingAllowed?: boolean;
        };
        if (j.unpaidBookingAllowed) {
          await sendToBook(null);
          return;
        }
        setBooked({
          ok: false,
          error:
            "Online payment is temporarily unavailable, so we can't confirm this booking right now. Please call us and we'll book it for you.",
        });
        setBooking(false);
        return;
      }
      order = await r.json();
    } catch {
      setBooked({
        ok: false,
        error: "Could not start payment. Please try again.",
      });
      setBooking(false);
      return;
    }

    if (!order.ok || !order.orderId || !order.paymentSessionId) {
      // Includes a 422 pre-charge validation failure — nothing was charged.
      setBooked({
        ok: false,
        error: order.error ?? "Could not start payment.",
        rule: Boolean(order.rule),
      });
      setBooking(false);
      return;
    }

    trackEvent("payment_started", { kind: "hotel" });
    const result = await openCashfreeCheckout({
      mode: order.mode ?? "sandbox",
      paymentSessionId: order.paymentSessionId,
    });
    if (!result) {
      setBooked({
        ok: false,
        error:
          "Could not load the payment window. Check your connection and retry.",
      });
      setBooking(false);
      return;
    }
    if (result.redirect) {
      // In-app browsers can't host the popup; Cashfree takes over the page instead.
      setBooked({ ok: false, error: "Taking you to the payment page…" });
      return;
    }

    // Ask the SERVER whether the order is paid, whatever the popup reported — a guest
    // who pays then closes the window still gets their room rather than a silent charge.
    await sendToBook(order.orderId, order.bookingCode);
  }

  // ── states ──
  if (!quote) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <span className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="animate-spin text-red" size={18} aria-hidden />{" "}
          Confirming this rate with the hotel…
        </span>
      </div>
    );
  }

  if (!quote.ok) {
    return (
      <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
        <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
        <h2 className="h-sm mb-2">This rate is no longer available</h2>
        <p className="mb-6 text-muted">{quote.error}</p>
        <Button href="/hotels" arrow>
          Search again
        </Button>
      </div>
    );
  }

  if (booked?.ok) {
    return (
      <div className="mx-auto max-w-xl rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-red" aria-hidden />
        <h2 className="h-sm mb-1">Booking confirmed</h2>
        <p className="mb-6 text-muted">
          {b.hotel} · {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
        </p>
        <dl className="mx-auto mb-6 grid max-w-sm gap-2 text-left text-body">
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Confirmation no.</dt>
            <dd className="font-bold tracking-wide text-navy">
              {booked.confirmationNo || "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Booking ref</dt>
            <dd className="font-semibold text-ink">
              {booked.bookingRefNo || booked.bookingId || "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Status</dt>
            <dd className="inline-flex items-center gap-1 font-semibold text-ink">
              <BadgeCheck size={14} className="text-red" aria-hidden />{" "}
              Confirmed
            </dd>
          </div>
        </dl>
        {/* TBO checkpoint 38: re-read the booking from GetBookingDetail 120s
            after Book and show the guest that settled status. */}
        {booked.bookingId ? (
          <BookingDetailCheck bookingId={booked.bookingId} />
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          {booked.bookingId ? (
            <Button href={`/hotels/voucher/${booked.bookingId}`} arrow>
              View voucher
            </Button>
          ) : null}
          <Button href="/account" variant="light">
            My bookings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[1fr_20rem] lg:pb-0">
      {/* ── guests ── */}
      <div className="space-y-6">
        {quote.isPriceChanged && (
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-body text-ink">
            The hotel re-priced this rate. The total shown is the confirmed
            price.
          </p>
        )}
        {quote.isCancellationPolicyChanged && (
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-body text-ink">
            The cancellation policy for this rate was updated — please review it
            below before paying.
          </p>
        )}

        {/* TBO certification: the PreBook RS terms (inclusions, promotions, rate
            conditions, pay-at-hotel supplements, final cancellation policy) must
            be shown to the guest BEFORE they book. */}
        <RateTerms quote={quote} />

        {Array.from({ length: rooms }).map((_, r) => (
          <div
            key={r}
            className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm"
          >
            <h3 className="mb-4 text-lead font-bold text-ink">
              Room {r + 1}
            </h3>
            <div className="space-y-4">
              {guests.map((g, i) =>
                g.roomIndex !== r ? null : (
                  <div
                    key={i}
                    className="border-t border-dashed border-line pt-4 first:border-0 first:pt-0"
                  >
                    <p className="mb-2 text-meta font-semibold text-muted">
                      Guest{" "}
                      {guests.filter((x) => x.roomIndex === r).indexOf(g) + 1}
                      {g.childAge != null && (
                        <span className="ml-1">· Child ({g.childAge} yrs)</span>
                      )}
                      {g.lead && (
                        <span className="ml-1 text-red">· Lead (contact)</span>
                      )}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
                      <Select
                        value={g.title}
                        autoComplete={`section-guest${i} honorific-prefix`}
                        onChange={(e) => setGuest(i, { title: e.target.value })}
                        aria-label="Title"
                      >
                        {TITLES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                      <input
                        value={g.first}
                        autoComplete={`section-guest${i} given-name`}
                        autoCapitalize="words"
                        onChange={(e) =>
                          setGuest(i, { first: cleanName(e.target.value, v) })
                        }
                        placeholder="First name"
                        className={controlClass}
                        aria-label="First name"
                      />
                      <input
                        value={g.last}
                        autoComplete={`section-guest${i} family-name`}
                        autoCapitalize="words"
                        onChange={(e) =>
                          setGuest(i, { last: cleanName(e.target.value, v) })
                        }
                        placeholder="Last name"
                        className={controlClass}
                        aria-label="Last name"
                      />
                    </div>

                    {g.lead && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          value={g.email}
                          onChange={(e) =>
                            setGuest(i, { email: e.target.value })
                          }
                          placeholder="Email"
                          className={controlClass}
                          aria-label="Email"
                        />
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={g.phone}
                          onChange={(e) =>
                            setGuest(i, { phone: e.target.value })
                          }
                          placeholder="Phone"
                          className={controlClass}
                          aria-label="Phone"
                        />
                      </div>
                    )}

                    {v?.panMandatory && (
                      <input
                        autoCapitalize="characters"
                        value={g.pan}
                        onChange={(e) =>
                          setGuest(i, { pan: e.target.value.toUpperCase() })
                        }
                        placeholder="PAN (AAAAA9999A)"
                        maxLength={10}
                        className={cn(controlClass, "mt-3 uppercase")}
                        aria-label="PAN"
                      />
                    )}

                    {v?.passportMandatory && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <input
                          autoCapitalize="characters"
                          value={g.passportNo}
                          onChange={(e) =>
                            setGuest(i, { passportNo: e.target.value })
                          }
                          placeholder="Passport no."
                          className={controlClass}
                          aria-label="Passport number"
                        />
                        <DateField
                          value={g.passportIssue}
                          max={TODAY}
                          onChange={(val) =>
                            setGuest(i, { passportIssue: val })
                          }
                          placeholder="Issued (dd-mm-yy)"
                          aria-label="Passport issue date"
                        />
                        <DateField
                          value={g.passportExp}
                          min={TODAY}
                          onChange={(val) => setGuest(i, { passportExp: val })}
                          placeholder="Expires (dd-mm-yy)"
                          aria-label="Passport expiry date"
                        />
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ))}

        {v?.panMandatory && (
          <p className="text-meta text-muted">
            This rate requires PAN
            {v.panCountRequired && v.panCountRequired > 1
              ? ` (${v.panCountRequired} guests)`
              : ""}{" "}
            per TBO rules.
          </p>
        )}
      </div>

      {/* ── summary / pay ── */}
      <aside className="h-fit rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm lg:sticky lg:top-24">
        <h3 className="mb-3 text-lead font-bold text-ink">Price summary</h3>
        {/* The total alone left the guest doing the arithmetic that decides
            whether the stay is worth it. Show the working, then the total. */}
        <dl className="space-y-1.5 border-b border-line pb-3 text-meta">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">
              Room rate · {b.nights} night{Number(b.nights) > 1 ? "s" : ""}
            </dt>
            <dd className="tabular-nums text-ink">
              {money.format(perNightFare(amountInr, Number(b.nights || 1)))} /
              night
            </dd>
          </div>
          {rooms > 1 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Rooms</dt>
              <dd className="tabular-nums text-ink">{rooms}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Taxes &amp; fees</dt>
            <dd className="text-ink">Included</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-1.5">
            <dt className="text-body font-semibold text-ink">Total payable now</dt>
            <dd className="text-[1.4rem] font-extrabold tabular-nums text-navy">
              {money.format(amountInr)}
            </dd>
          </div>
        </dl>

        {/* The pay-at-hotel charges are set out in full under "Room & rate
            terms"; the guest deciding whether to press Pay is looking HERE, so
            the total must not read as the whole cost of the stay. */}
        {(quote.supplements ?? []).length > 0 && (
          <p className="mt-2 rounded-brand border border-amber-300 bg-amber-50 px-3 py-2 text-meta text-amber-900">
            Plus charges payable directly at the hotel — see “Room &amp; rate
            terms”.
          </p>
        )}
        {cancelHeadline && (
          <p
            className={cn(
              "mt-2 text-meta font-medium",
              cancelHeadline.startsWith("Free")
                ? "text-green-700"
                : "text-muted",
            )}
          >
            {cancelHeadline}
          </p>
        )}

        <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive">
          {booked && !booked.ok && (
            <p className="mt-4 rounded-brand border border-red/30 bg-red/5 px-3 py-2 text-meta text-red">
              {booked.error}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={booking}
          className="grad-red mt-4 hidden w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-body font-semibold text-white shadow-brand-red transition disabled:opacity-60 lg:inline-flex"
        >
          {booking ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden />{" "}
              Processing…
            </>
          ) : (
            <>Pay &amp; Book</>
          )}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-meta text-muted">
          <ShieldCheck size={12} aria-hidden /> Secure payment · confirmed
          instantly
        </p>
      </aside>

      {/* Mobile sticky pay bar — the summary card sits below the form on small
          screens, so surface the total + CTA without scrolling past it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-[84px] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="text-meta font-bold uppercase tracking-wide text-muted">
            Total
          </p>
          <p className="truncate text-[1.05rem] font-extrabold text-navy">
            {money.format(amountInr)}
          </p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={booking}
          className="grad-red inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-full px-5 text-body font-semibold text-white shadow-brand-red disabled:opacity-60"
        >
          {booking ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden />{" "}
              Processing…
            </>
          ) : (
            <>Pay &amp; Book</>
          )}
        </button>
      </div>
    </div>
  );
}

function cancelCharge(
  p: { chargeType?: string | number; charge: number },
  currency: string,
): string {
  const t = String(p.chargeType ?? "").toLowerCase();
  if (p.charge <= 0) return "Free cancellation";
  if (t === "2" || t === "percentage") return `${p.charge}% of the fare`;
  if (t === "3" || t === "nights")
    return `${p.charge} night${p.charge > 1 ? "s" : ""}' charge`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(p.charge);
}

/**
 * PreBook RS terms the guest must see before paying (TBO certification):
 * inclusions, room promotions, rate conditions, pay-at-hotel supplements
 * (often in the hotel's local currency) and the final cancellation policy.
 */
function RateTerms({ quote }: { quote: Quote }) {
  const currency = quote.currency || "INR";
  const conditions = quote.rateConditions ?? [];
  const promos = quote.roomPromotions ?? [];
  const supplements = quote.supplements ?? [];
  const windows = cancellationWindows(quote.cancelPolicies);
  const amenities = quote.amenities ?? [];
  // TBO hands this over as its own "DD-MM-YYYY hh:mm:ss" string. Printed
  // verbatim it broke the site-wide date format and, like the raw policy rows,
  // could name a deadline that had already passed.
  const lastDeadlineISO = (() => {
    const iso = tboDateToISO(quote.lastCancellationDeadline ?? "");
    return iso && iso > new Date().toISOString() ? iso : "";
  })();
  const [showAll, setShowAll] = useState(false);
  // Never returns null: TBO's verifier must be able to find the rate's terms on the
  // book page for EVERY rate, including one whose supplier sends no conditions.
  const shown = showAll ? conditions : conditions.slice(0, 3);

  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
      <h3 className="mb-3 text-lead font-bold text-ink">
        Room &amp; rate terms
      </h3>
      <div className="space-y-3 text-body text-ink">
        {quote.mealType && (
          <p>
            <span className="font-semibold">Meal plan:</span>{" "}
            {mealLabel(quote.mealType, true)}
          </p>
        )}
        {quote.inclusion && (
          <p>
            <span className="font-semibold">Includes:</span> {quote.inclusion}
          </p>
        )}
        {promos.length > 0 && (
          <p>
            <span className="font-semibold">Promotion:</span>{" "}
            {promos.join(" · ")}
          </p>
        )}
        {supplements.length > 0 && (
          <div className="rounded-brand border border-red/30 bg-red/5 px-3 py-2">
            <p className="font-semibold">
              Payable at the hotel (not included in this total):
            </p>
            <ul className="mt-1 list-disc pl-5">
              {supplements.map((s, i) => (
                <li key={i}>
                  {s.description || s.type || "Mandatory supplement"}
                  {s.price != null && s.price > 0 && (
                    <>
                      {" — "}
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: s.currency || currency,
                        maximumFractionDigits: 2,
                      }).format(s.price)}
                      {s.currency &&
                        s.currency !== "INR" &&
                        " (hotel's local currency)"}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {windows.length > 0 && (
          <div>
            <p className="font-semibold">Cancellation policy:</p>
            {/* Windows the guest can still choose, not TBO's raw rows. Rendered
                literally, those rows read "From 21-08-26: No charge" on a stay
                booked on the 23rd — a refund window that shut two days ago,
                printed as though it were on offer. */}
            <ul className="mt-1 list-disc pl-5">
              {windows.map((w, i) => (
                <li key={i} className={w.active ? "font-medium text-ink" : ""}>
                  {w.untilISO
                    ? `Until ${formatDeadline(w.untilISO)}`
                    : `From ${formatDeadline(w.fromISO)}`}
                  : {cancelCharge(w, currency)}
                  {w.active ? " — applies if you cancel now" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {amenities.length > 0 && (
          <div>
            <p className="font-semibold">Room amenities:</p>
            <p className="mt-1 text-muted">{amenities.join(" · ")}</p>
          </div>
        )}
        {lastDeadlineISO && (
          <p className="text-muted">
            <span className="font-semibold text-ink">
              Last cancellation deadline:
            </span>{" "}
            {formatDeadline(lastDeadlineISO)}
          </p>
        )}
        <div>
          <p className="font-semibold">Rate conditions:</p>
          {conditions.length === 0 ? (
            <p className="mt-1 text-muted">
              The hotel returns no additional rate conditions for this rate.
            </p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-muted">
              {shown.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {conditions.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-1 font-semibold text-red"
            >
              {showAll
                ? "Show fewer conditions"
                : `Show all ${conditions.length} conditions`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
