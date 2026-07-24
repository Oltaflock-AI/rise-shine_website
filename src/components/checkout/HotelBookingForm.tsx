"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import { BadgeCheck, CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format-date";

// ── Razorpay hosted checkout ──
type RzpResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RzpOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (r: RzpResponse) => void;
  modal?: { ondismiss?: () => void };
};
type RzpInstance = { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (o: RzpOptions) => RzpInstance;
  }
}
const RZP_SRC = "https://checkout.razorpay.com/v1/checkout.js";
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RZP_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = RZP_SRC;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

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
  error?: string;
};

const TITLES = ["Mr", "Mrs", "Ms", "Miss"];

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

export function HotelBookingForm({ b, contactEmail }: { b: Record<string, string>; contactEmail: string }) {
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
    const blank = (roomIndex: number, lead: boolean, childAge?: number): Guest => ({
      roomIndex,
      lead,
      childAge,
      title: childAge != null ? "Miss" : "Mr",
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

  // PreBook on mount: confirm the rate + learn what fields TBO requires.
  useEffect(() => {
    let alive = true;
    fetch("/api/hotels/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingCode: b.bookingCode }),
    })
      .then((r) => r.json())
      .then((j) => alive && setQuote(j as Quote))
      .catch(() => alive && setQuote({ ok: false, error: "Could not confirm this rate. Please try again." }));
    return () => {
      alive = false;
    };
  }, [b.bookingCode]);

  const v = quote?.validation;
  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: quote?.currency || b.currency || "INR",
        maximumFractionDigits: 0,
      }),
    [quote?.currency, b.currency],
  );
  const amountInr = quote?.netAmount ?? quote?.totalFare ?? Number(b.fare || 0);

  const setGuest = (i: number, patch: Partial<Guest>) =>
    setGuests((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));

  function buildRooms() {
    const byRoom: Array<{ passengers: Record<string, unknown>[] }> = Array.from({ length: rooms }, () => ({ passengers: [] }));
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
          ? { passportNo: g.passportNo.trim(), passportIssueDate: g.passportIssue, passportExpDate: g.passportExp }
          : {}),
      });
    }
    return byRoom;
  }

  function commonPayload() {
    return {
      bookingCode: b.bookingCode,
      nationality: "IN",
      netAmount: amountInr,
      isVoucherBooking: true,
      rooms: buildRooms(),
      validation: v,
      // Display context mirrored into the customer's account view.
      stay: { hotelName: b.hotel, city: b.city, checkIn: b.checkIn, checkOut: b.checkOut },
    };
  }

  /** POST /api/hotels/book — `payment` present once Razorpay confirmed (else direct book). */
  async function sendToBook(payment: RzpResponse | null) {
    try {
      const r = await fetch("/api/hotels/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commonPayload(),
          payment: payment
            ? { orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }
            : undefined,
        }),
      });
      const parsed = (await r.json()) as Booked;
      if (parsed.ok) track("booking_confirmed", { kind: "hotel" });
      setBooked(parsed);
    } catch {
      setBooked({ ok: false, error: "Network error — please try again." });
    } finally {
      setBooking(false);
    }
  }

  /** Collect payment (Razorpay), then book. Money is captured BEFORE Book; the server refunds if Book fails. */
  async function submit() {
    // Light client check; the order route re-validates authoritatively before charging.
    for (const g of guests) {
      if (!g.first.trim() || !g.last.trim()) return setBooked({ ok: false, rule: true, error: "Every guest needs a first and last name." });
      if (g.lead && (!g.email.trim() || !g.phone.trim()))
        return setBooked({ ok: false, rule: true, error: "Each room's lead guest needs an email and phone." });
    }

    setBooking(true);
    setBooked(null);

    let order: { ok: boolean; orderId?: string; amount?: number; currency?: string; keyId?: string; error?: string; rule?: string };
    try {
      const r = await fetch("/api/hotels/payment/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commonPayload()),
      });
      if (r.status === 503) {
        // Payments not configured — legacy direct-book path (dev/staging).
        await sendToBook(null);
        return;
      }
      order = await r.json();
    } catch {
      setBooked({ ok: false, error: "Could not start payment. Please try again." });
      setBooking(false);
      return;
    }

    if (!order.ok || !order.orderId || !order.keyId) {
      // Includes a 422 pre-charge validation failure — nothing was charged.
      setBooked({ ok: false, error: order.error ?? "Could not start payment.", rule: Boolean(order.rule) });
      setBooking(false);
      return;
    }

    track("payment_started", { kind: "hotel" });
    const ready = await loadRazorpay();
    if (!ready || !window.Razorpay) {
      setBooked({ ok: false, error: "Could not load the payment window. Check your connection and retry." });
      setBooking(false);
      return;
    }

    const lead = guests.find((g) => g.lead);
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount ?? 0,
      currency: order.currency ?? "INR",
      name: "Rise & Shine Travels",
      description: `${b.hotel ?? "Hotel"} · ${formatDate(b.checkIn)} → ${formatDate(b.checkOut)}`,
      prefill: { email: lead?.email, contact: lead?.phone },
      notes: { bookingCode: b.bookingCode ?? "" },
      theme: { color: "#e11d2a" },
      handler: (resp) => {
        void sendToBook(resp);
      },
      modal: {
        ondismiss: () => {
          setBooking(false);
          setBooked({ ok: false, error: "Payment was cancelled — you have not been charged." });
        },
      },
    });
    rzp.on("payment.failed", (resp) => {
      setBooking(false);
      setBooked({ ok: false, error: resp?.error?.description ?? "Payment failed — you have not been charged." });
    });
    rzp.open();
  }

  // ── states ──
  if (!quote) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <span className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="animate-spin text-red" size={18} aria-hidden /> Confirming this rate with the hotel…
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
        <dl className="mx-auto mb-6 grid max-w-sm gap-2 text-left text-[0.9rem]">
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Confirmation no.</dt>
            <dd className="font-bold tracking-wide text-navy">{booked.confirmationNo || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Booking ref</dt>
            <dd className="font-semibold text-ink">{booked.bookingRefNo || booked.bookingId || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Status</dt>
            <dd className="inline-flex items-center gap-1 font-semibold text-ink">
              <BadgeCheck size={14} className="text-red" aria-hidden /> Confirmed
            </dd>
          </div>
        </dl>
        <Button href="/account" arrow>
          View my bookings
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[1fr_20rem] lg:pb-0">
      {/* ── guests ── */}
      <div className="space-y-6">
        {quote.isPriceChanged && (
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-[0.85rem] text-ink">
            The hotel re-priced this rate. The total shown is the confirmed price.
          </p>
        )}

        {Array.from({ length: rooms }).map((_, r) => (
          <div key={r} className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
            <h3 className="mb-4 text-[0.95rem] font-bold text-ink">Room {r + 1}</h3>
            <div className="space-y-4">
              {guests.map((g, i) =>
                g.roomIndex !== r ? null : (
                  <div key={i} className="border-t border-dashed border-line pt-4 first:border-0 first:pt-0">
                    <p className="mb-2 text-[0.8rem] font-semibold text-muted">
                      Guest {guests.filter((x) => x.roomIndex === r).indexOf(g) + 1}
                      {g.childAge != null && <span className="ml-1">· Child ({g.childAge} yrs)</span>}
                      {g.lead && <span className="ml-1 text-red">· Lead (contact)</span>}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
                      <select
                        value={g.title}
                        onChange={(e) => setGuest(i, { title: e.target.value })}
                        className="rounded-brand border border-line bg-white px-3 py-2.5 text-base text-ink"
                        aria-label="Title"
                      >
                        {TITLES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        value={g.first}
                        onChange={(e) => setGuest(i, { first: e.target.value })}
                        placeholder="First name"
                        className="rounded-brand border border-line px-3 py-2.5 text-base"
                        aria-label="First name"
                      />
                      <input
                        value={g.last}
                        onChange={(e) => setGuest(i, { last: e.target.value })}
                        placeholder="Last name"
                        className="rounded-brand border border-line px-3 py-2.5 text-base"
                        aria-label="Last name"
                      />
                    </div>

                    {g.lead && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input
                          type="email"
                          value={g.email}
                          onChange={(e) => setGuest(i, { email: e.target.value })}
                          placeholder="Email"
                          className="rounded-brand border border-line px-3 py-2.5 text-base"
                          aria-label="Email"
                        />
                        <input
                          type="tel"
                          value={g.phone}
                          onChange={(e) => setGuest(i, { phone: e.target.value })}
                          placeholder="Phone"
                          className="rounded-brand border border-line px-3 py-2.5 text-base"
                          aria-label="Phone"
                        />
                      </div>
                    )}

                    {v?.panMandatory && (
                      <input
                        value={g.pan}
                        onChange={(e) => setGuest(i, { pan: e.target.value.toUpperCase() })}
                        placeholder="PAN (AAAAA9999A)"
                        maxLength={10}
                        className="mt-3 w-full rounded-brand border border-line px-3 py-2.5 text-base uppercase"
                        aria-label="PAN"
                      />
                    )}

                    {v?.passportMandatory && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <input
                          value={g.passportNo}
                          onChange={(e) => setGuest(i, { passportNo: e.target.value })}
                          placeholder="Passport no."
                          className="rounded-brand border border-line px-3 py-2.5 text-base"
                          aria-label="Passport number"
                        />
                        <input
                          type="date"
                          value={g.passportIssue}
                          onChange={(e) => setGuest(i, { passportIssue: e.target.value })}
                          className="rounded-brand border border-line px-3 py-2.5 text-base"
                          aria-label="Passport issue date"
                        />
                        <input
                          type="date"
                          value={g.passportExp}
                          onChange={(e) => setGuest(i, { passportExp: e.target.value })}
                          className="rounded-brand border border-line px-3 py-2.5 text-base"
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
          <p className="text-[0.8rem] text-muted">
            This rate requires PAN{v.panCountRequired && v.panCountRequired > 1 ? ` (${v.panCountRequired} guests)` : ""} per TBO rules.
          </p>
        )}
      </div>

      {/* ── summary / pay ── */}
      <aside className="h-fit rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm lg:sticky lg:top-24">
        <h3 className="mb-3 text-[0.95rem] font-bold text-ink">Price summary</h3>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="text-muted">Total</span>
          <span className="text-[1.4rem] font-extrabold text-navy">{money.format(amountInr)}</span>
        </div>
        <p className="mt-2 text-[0.75rem] text-muted">
          {b.nights} night{Number(b.nights) > 1 ? "s" : ""} · {rooms} room{rooms > 1 ? "s" : ""} · taxes included
        </p>

        {booked && !booked.ok && (
          <p className="mt-4 rounded-brand border border-red/30 bg-red/5 px-3 py-2 text-[0.82rem] text-red">
            {booked.error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={booking}
          className="grad-red mt-4 hidden w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9rem] font-semibold text-white shadow-brand-red transition disabled:opacity-60 lg:inline-flex"
        >
          {booking ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden /> Processing…
            </>
          ) : (
            <>Pay &amp; Book</>
          )}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[0.72rem] text-muted">
          <ShieldCheck size={12} aria-hidden /> Secure payment · confirmed instantly
        </p>
      </aside>

      {/* Mobile sticky pay bar — the summary card sits below the form on small
          screens, so surface the total + CTA without scrolling past it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-[84px] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Total</p>
          <p className="truncate text-[1.05rem] font-extrabold text-navy">{money.format(amountInr)}</p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={booking}
          className="grad-red inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-full px-5 text-[0.9rem] font-semibold text-white shadow-brand-red disabled:opacity-60"
        >
          {booking ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden /> Processing…
            </>
          ) : (
            <>Pay &amp; Book</>
          )}
        </button>
      </div>
    </div>
  );
}
