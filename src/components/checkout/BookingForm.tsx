"use client";

import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { BadgeCheck, CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format-date";
import { PlaneLoader } from "@/components/ui/PlaneLoader";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// ── Razorpay Checkout (hosted script) ──
type RzpResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
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

/** Inject Razorpay's hosted checkout.js once; resolves false if it can't load. */
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
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Titles TBO accepts (Navitaire 4X). "Master"/"Miss" are rejected. */
const TITLES: Record<PaxType, string[]> = {
  1: ["MR", "MRS", "MS"],
  2: ["MR", "MS"],
  3: ["MSTR", "MR", "MS"],
};
type PaxType = 1 | 2 | 3;
const TYPE_LABEL: Record<PaxType, string> = { 1: "Adult", 2: "Child", 3: "Infant" };

type Flags = {
  IsPanRequiredAtBook?: boolean;
  IsPanRequiredAtTicket?: boolean;
  IsPassportRequiredAtBook?: boolean;
  IsPassportRequiredAtTicket?: boolean;
  IsPassportFullDetailRequiredAtBook?: boolean;
  IsGSTMandatory?: boolean;
  isseatmandatory?: boolean;
  ismealmandatory?: boolean;
};
type Quote = {
  ok: boolean;
  isLCC?: boolean;
  publishedFare?: number;
  priceChanged?: boolean;
  flags?: Flags;
  error?: string;
};
type Booked = {
  ok: boolean;
  pnr?: string;
  bookingId?: number;
  status?: number;
  invoiceNo?: string;
  ticketNumbers?: string[];
  refunded?: boolean;
  error?: string;
  rule?: string;
};

type PaxForm = {
  PaxType: PaxType;
  Title: string;
  FirstName: string;
  LastName: string;
  Gender: 1 | 2;
  DateOfBirth: string; // yyyy-mm-dd
  PAN: string;
  PassportNo: string;
  PassportExpiry: string;
  PassportIssueDate: string;
  GuardianTitle: string;
  GuardianFirstName: string;
  GuardianLastName: string;
  GuardianPAN: string;
};

const blankPax = (t: PaxType): PaxForm => ({
  PaxType: t,
  Title: TITLES[t][0],
  FirstName: "",
  LastName: "",
  Gender: 1,
  DateOfBirth: "",
  PAN: "",
  PassportNo: "",
  PassportExpiry: "",
  PassportIssueDate: "",
  GuardianTitle: "MR",
  GuardianFirstName: "",
  GuardianLastName: "",
  GuardianPAN: "",
});

const field =
  "w-full rounded-brand border border-line bg-white px-3 py-2.5 text-base text-ink outline-none transition focus:border-red focus:ring-2 focus:ring-red/15";
const label = "mb-1 block text-[0.75rem] font-semibold uppercase tracking-wide text-muted";

export function BookingForm({
  b,
  contactEmail,
}: {
  b: Record<string, string>;
  contactEmail: string;
}) {
  const adults = Math.max(1, Number(b.adults || 1));
  const children = Math.max(0, Number(b.children || 0));
  const infants = Math.max(0, Number(b.infants || 0));

  const [quote, setQuote] = useState<Quote | null>(null);
  const [pax, setPax] = useState<PaxForm[]>(() => [
    ...Array.from({ length: adults }, () => blankPax(1)),
    ...Array.from({ length: children }, () => blankPax(2)),
    ...Array.from({ length: infants }, () => blankPax(3)),
  ]);
  const [contact, setContact] = useState({ phone: "", email: contactEmail, address: "", city: "Ahmedabad" });
  const [gst, setGst] = useState({ GSTCompanyName: "", GSTNumber: "" });
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  /** Captured once — reading the clock during render is impure. */

  // Ask TBO what this fare needs BEFORE collecting details (FareQuote flags).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            traceId: b.traceId,
            searchedAt: Number(b.searchedAt || Date.now()),
            resultIndex: b.resultIndex,
          }),
        });
        const j = (await r.json()) as Quote;
        if (alive) setQuote(j);
      } catch {
        if (alive) setQuote({ ok: false, error: "Could not price this fare. Please search again." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [b.traceId, b.searchedAt, b.resultIndex]);

  const flags = quote?.flags ?? {};
  const isIntl = b.intl === "1";
  const needPassport = Boolean(flags.IsPassportRequiredAtBook || flags.IsPassportRequiredAtTicket || isIntl);
  const needFullPassport = Boolean(flags.IsPassportFullDetailRequiredAtBook);
  const needPan = Boolean(flags.IsPanRequiredAtBook || flags.IsPanRequiredAtTicket);
  const needGst = Boolean(flags.IsGSTMandatory);

  const set = (i: number, k: keyof PaxForm, v: string | number) =>
    setPax((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const totalFare = quote?.publishedFare ?? Number(b.fare || 0) * (adults + children);

  const canSubmit = useMemo(() => {
    if (!quote?.ok || booking) return false;
    if (!contact.phone.trim() || !contact.email.trim() || !contact.address.trim()) return false;
    if (needGst && (!gst.GSTNumber.trim() || !gst.GSTCompanyName.trim())) return false;
    return pax.every((p) => {
      if (!p.FirstName.trim() || p.LastName.trim().length < 2) return false;
      if ((p.PaxType === 2 || p.PaxType === 3) && !p.DateOfBirth) return false;
      if (needPassport && (!p.PassportNo.trim() || !p.PassportExpiry)) return false;
      if (needFullPassport && !p.PassportIssueDate) return false;
      if (needPan) {
        // Adult pax type enters their own PAN (the form has no guardian fields
        // for adults — TBO rejects guardian PAN for 18+ anyway); child/infant
        // bookings carry a guardian's.
        if (p.PaxType === 1) return Boolean(p.PAN.trim());
        return Boolean(p.GuardianPAN.trim());
      }
      return true;
    });
  }, [quote, booking, contact, gst, pax, needPassport, needFullPassport, needPan, needGst]);

  /** Shape passengers into TBO's Pax objects from the current form state. */
  function buildPassengers() {
    return pax.map((p, i) => {
      const out: Record<string, unknown> = {
        Title: p.Title,
        FirstName: p.FirstName.trim(),
        LastName: p.LastName.trim(),
        PaxType: p.PaxType,
        Gender: p.Gender,
        DateOfBirth: p.DateOfBirth ? `${p.DateOfBirth}T00:00:00` : "",
        IsLeadPax: i === 0,
        ContactNo: contact.phone.trim(),
        CellCountryCode: "+91", // TBO rejects a bare "91"
        Email: contact.email.trim(),
        AddressLine1: contact.address.trim(),
        City: contact.city.trim(),
        CountryCode: "IN",
        CountryName: "India",
        Nationality: "IN",
      };
      if (p.PAN.trim()) out.PAN = p.PAN.trim().toUpperCase();
      if (needPassport) {
        out.PassportNo = p.PassportNo.trim();
        out.PassportExpiry = `${p.PassportExpiry}T00:00:00`;
        if (p.PassportIssueDate) out.PassportIssueDate = `${p.PassportIssueDate}T00:00:00`;
        out.PassportIssueCountryCode = "IN";
      }
      // Child/infant PAN travels as the guardian's, per TBO.
      if (needPan && p.PaxType !== 1 && p.GuardianPAN.trim()) {
        out.GuardianDetails = {
          Title: p.GuardianTitle,
          FirstName: p.GuardianFirstName.trim(),
          LastName: p.GuardianLastName.trim(),
          PAN: p.GuardianPAN.trim().toUpperCase(),
        };
      }
      return out;
    });
  }

  /** The booking payload shared by /api/payment/order (pre-charge) and /api/book. */
  function commonPayload(passengers: ReturnType<typeof buildPassengers>) {
    return {
      traceId: b.traceId,
      searchedAt: Number(b.searchedAt || Date.now()),
      resultIndex: b.resultIndex,
      isLCC: b.lcc === "1",
      airlineCode: b.airlineCode,
      flightNumber: (b.flightNo || "").replace(/\D/g, ""),
      origin: b.from,
      destination: b.to,
      departDate: b.depart,
      isInternational: isIntl,
      passengers,
      gst: needGst
        ? {
            GSTCompanyName: gst.GSTCompanyName,
            GSTNumber: gst.GSTNumber,
            GSTCompanyAddress: contact.address,
            GSTCompanyEmail: contact.email,
            GSTCompanyContactNumber: contact.phone,
          }
        : undefined,
    };
  }

  /** POST /api/book — ticket the fare. `payment` is present once Razorpay has confirmed. */
  async function sendToBook(
    passengers: ReturnType<typeof buildPassengers>,
    payment: RzpResponse | null,
  ) {
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commonPayload(passengers),
          payment: payment
            ? {
                orderId: payment.razorpay_order_id,
                paymentId: payment.razorpay_payment_id,
                signature: payment.razorpay_signature,
              }
            : undefined,
        }),
      });
      const parsed = (await r.json()) as Booked;
      if (parsed.ok) trackEvent("booking_confirmed", { kind: "flight" });
      setBooked(parsed);
    } catch {
      setBooked({ ok: false, error: "Network error — please try again." });
    } finally {
      setBooking(false);
    }
  }

  /**
   * Collect payment (Razorpay), then ticket. Money is captured BEFORE we call TBO;
   * the server refunds automatically if ticketing then fails. If online payment isn't
   * configured (503), fall back to ticketing directly — dev/staging without keys.
   */
  async function submit() {
    setBooking(true);
    setBooked(null);
    const passengers = buildPassengers();

    let order: {
      ok: boolean;
      orderId?: string;
      amount?: number;
      currency?: string;
      keyId?: string;
      error?: string;
      rule?: string;
    };
    try {
      // The order endpoint runs the FULL pre-ticket validation before creating an
      // order, so a booking TBO would reject fails here — before any money is taken.
      const r = await fetch("/api/payment/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commonPayload(passengers)),
      });
      if (r.status === 503) {
        // Payments not configured — legacy direct-ticket path.
        await sendToBook(passengers, null);
        return;
      }
      order = await r.json();
    } catch {
      setBooked({ ok: false, error: "Could not start payment. Please try again." });
      setBooking(false);
      return;
    }

    if (!order.ok || !order.orderId || !order.keyId) {
      // Includes a 422 pre-charge validation failure (order.rule) — nothing was charged.
      setBooked({ ok: false, error: order.error ?? "Could not start payment.", rule: order.rule });
      setBooking(false);
      return;
    }

    trackEvent("payment_started", { kind: "flight" });
    const ready = await loadRazorpay();
    if (!ready || !window.Razorpay) {
      setBooked({ ok: false, error: "Could not load the payment window. Check your connection and retry." });
      setBooking(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount ?? 0,
      currency: order.currency ?? "INR",
      name: "Rise & Shine Travels",
      description: `${b.from} → ${b.to} · ${b.airline}`,
      prefill: { email: contact.email, contact: contact.phone },
      notes: { traceId: b.traceId ?? "" },
      theme: { color: "#e11d2a" },
      handler: (resp) => {
        // Paid — hand the signed handles to the server, which verifies then tickets.
        void sendToBook(passengers, resp);
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
      setBooked({
        ok: false,
        error: resp?.error?.description ?? "Payment failed — you have not been charged.",
      });
    });
    rzp.open();
  }

  // ── states ──
  if (!quote) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <PlaneLoader message="Confirming this fare with the airline…" />
      </div>
    );
  }

  if (!quote.ok) {
    return (
      <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
        <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
        <h2 className="h-sm mb-2">This fare is no longer available</h2>
        <p className="mb-6 text-muted">{quote.error}</p>
        <Button href="/flights" arrow>
          Search again
        </Button>
      </div>
    );
  }

  if (booked?.ok) {
    // Round-trip step 1: hand the customer straight to the return-leg checkout.
    const nextLeg = b.next?.startsWith("/checkout?") ? b.next : undefined;
    return (
      <div className="mx-auto max-w-xl rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-red" aria-hidden />
        <h2 className="h-sm mb-1">{nextLeg ? "Outbound ticket confirmed" : "Ticket confirmed"}</h2>
        <p className="mb-6 text-muted">
          {b.from} → {b.to} · {b.airline}
          {nextLeg ? " · now book your return to complete the round trip" : ""}
        </p>
        <dl className="mx-auto mb-6 grid max-w-sm gap-2 text-left text-[0.9rem]">
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">PNR</dt>
            <dd className="font-bold tracking-wide text-navy">{booked.pnr}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Ticket number</dt>
            <dd className="min-w-0 break-words text-right font-semibold text-ink">{booked.ticketNumbers?.join(", ") || booked.pnr}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Invoice</dt>
            <dd className="font-semibold text-ink">{booked.invoiceNo}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Status</dt>
            <dd className="inline-flex items-center gap-1 font-semibold text-ink">
              <BadgeCheck size={14} className="text-red" aria-hidden /> Ticketed
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap justify-center gap-3">
          {nextLeg ? (
            <>
              <Button href={nextLeg} arrow>
                Book your return flight
              </Button>
              <Button href="/account" variant="light">
                View my bookings
              </Button>
            </>
          ) : (
            <Button href="/account" arrow>
              View my bookings
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[1fr_20rem] lg:pb-0">
      {/* ── passengers ── */}
      <div className="space-y-6">
        {quote.priceChanged && (
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-[0.85rem] text-ink">
            The airline re-priced this fare. The total below is the confirmed price.
          </p>
        )}

        {pax.map((p, i) => (
          <div key={i} className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
            <h3 className="mb-4 text-[0.95rem] font-bold text-ink">
              {TYPE_LABEL[p.PaxType]} {pax.filter((x) => x.PaxType === p.PaxType).indexOf(p) + 1}
              {p.PaxType === 2 && <span className="ml-1 font-normal text-muted">(2–12 yrs)</span>}
              {p.PaxType === 3 && <span className="ml-1 font-normal text-muted">(under 2 yrs)</span>}
            </h3>

            <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
              <div>
                <label className={label}>Title</label>
                <select className={field} value={p.Title} onChange={(e) => set(i, "Title", e.target.value)}>
                  {TITLES[p.PaxType].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>First name</label>
                <input
                  className={field}
                  value={p.FirstName}
                  maxLength={32}
                  onChange={(e) => set(i, "FirstName", e.target.value.replace(/[^A-Za-z ]/g, ""))}
                  placeholder="As on ID"
                />
              </div>
              <div>
                <label className={label}>Last name</label>
                <input
                  className={field}
                  value={p.LastName}
                  maxLength={32}
                  minLength={2}
                  onChange={(e) => set(i, "LastName", e.target.value.replace(/[^A-Za-z ]/g, ""))}
                  placeholder="As on ID (min 2 letters, no title)"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Gender</label>
                <select
                  className={field}
                  value={p.Gender}
                  onChange={(e) => set(i, "Gender", Number(e.target.value) as 1 | 2)}
                >
                  <option value={1}>Male</option>
                  <option value={2}>Female</option>
                </select>
              </div>
              <div>
                <label className={label}>
                  Date of birth {p.PaxType !== 1 && <span className="text-red">*</span>}
                </label>
                <input
                  type="date"
                  className={field}
                  value={p.DateOfBirth}
                  onChange={(e) => set(i, "DateOfBirth", e.target.value)}
                />
              </div>
            </div>

            {needPassport && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={label}>Passport no.</label>
                  <input className={field} value={p.PassportNo} onChange={(e) => set(i, "PassportNo", e.target.value)} />
                </div>
                <div>
                  <label className={label}>Expiry</label>
                  <input
                    type="date"
                    className={field}
                    value={p.PassportExpiry}
                    onChange={(e) => set(i, "PassportExpiry", e.target.value)}
                  />
                </div>
                {needFullPassport && (
                  <div>
                    <label className={label}>Issue date</label>
                    <input
                      type="date"
                      className={field}
                      value={p.PassportIssueDate}
                      onChange={(e) => set(i, "PassportIssueDate", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {needPan && (
              <div className="mt-3">
                {p.PaxType === 1 ? (
                  <div>
                    <label className={label}>PAN (as per the PAN card)</label>
                    <input
                      className={field}
                      autoCapitalize="characters"
                      value={p.PAN}
                      onChange={(e) => set(i, "PAN", e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                    />
                  </div>
                ) : (
                  <div className="rounded-brand bg-mist p-3">
                    <p className="mb-2 text-[0.78rem] text-muted">
                      Parent/guardian PAN is required for a {TYPE_LABEL[p.PaxType].toLowerCase()}.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        className={field}
                        value={p.GuardianFirstName}
                        maxLength={32}
                        onChange={(e) => set(i, "GuardianFirstName", e.target.value.replace(/[^A-Za-z ]/g, ""))}
                        placeholder="Guardian first name"
                      />
                      <input
                        className={field}
                        value={p.GuardianLastName}
                        maxLength={32}
                        onChange={(e) => set(i, "GuardianLastName", e.target.value.replace(/[^A-Za-z ]/g, ""))}
                        placeholder="Guardian last name"
                      />
                      <input
                        className={field}
                        autoCapitalize="characters"
                        value={p.GuardianPAN}
                        onChange={(e) => set(i, "GuardianPAN", e.target.value.toUpperCase())}
                        placeholder="Guardian PAN"
                        maxLength={10}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* ── contact ── */}
        <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
          <h3 className="mb-4 text-[0.95rem] font-bold text-ink">Contact details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Mobile</label>
              <div className="flex gap-2">
                <span className="grid place-items-center rounded-brand border border-line bg-mist px-3 text-[0.9rem] text-muted">
                  +91
                </span>
                <input
                  className={field}
                  type="tel"
                  inputMode="tel"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  placeholder="9876543210"
                />
              </div>
            </div>
            <div>
              <label className={label}>Email</label>
              <input
                className={field}
                type="email"
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Address</label>
              <input
                className={field}
                value={contact.address}
                onChange={(e) => setContact({ ...contact, address: e.target.value })}
                placeholder="Street, area"
              />
            </div>
          </div>

          {needGst && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>GST company name</label>
                <input
                  className={field}
                  value={gst.GSTCompanyName}
                  onChange={(e) => setGst({ ...gst, GSTCompanyName: e.target.value })}
                />
              </div>
              <div>
                <label className={label}>GSTIN</label>
                <input
                  className={field}
                  value={gst.GSTNumber}
                  onChange={(e) => setGst({ ...gst, GSTNumber: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          )}
        </div>

        {booked && !booked.ok && (
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-[0.85rem] text-ink">
            <b>Booking not completed.</b> {booked.error}
          </p>
        )}
      </div>

      {/* ── summary ── */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
          <h3 className="mb-3 text-[0.95rem] font-bold text-ink">{b.airline}</h3>
          <p className="text-[0.85rem] text-muted">
            {b.from} → {b.to}
          </p>
          <p className="mb-4 text-[0.85rem] text-muted">
            {formatDate(b.depart)} · {b.flightNo}
          </p>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-[0.85rem] text-muted">Total</span>
            <span className="text-[1.35rem] font-extrabold text-navy">₹{inr.format(totalFare)}</span>
          </div>
          <p className="mb-4 text-[0.72rem] text-muted">
            {adults} adult{adults > 1 ? "s" : ""}
            {children ? `, ${children} child` : ""}
            {infants ? `, ${infants} infant` : ""} · taxes included
          </p>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="grad-red hidden w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9rem] font-semibold text-white shadow-brand-red transition-transform duration-300 hover:-translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 lg:inline-flex"
          >
            {booking ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden /> Processing…
              </>
            ) : (
              <>Pay ₹{inr.format(totalFare)} & issue ticket</>
            )}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.72rem] text-muted">
            <ShieldCheck size={13} aria-hidden /> Secure payment via Razorpay · ticket issued on success
          </p>
        </div>
      </aside>

      {/* Mobile sticky pay bar — the summary card sits below the form on small
          screens, so surface the total + CTA without scrolling past it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-[84px] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Total</p>
          <p className="truncate text-[1.05rem] font-extrabold text-navy">₹{inr.format(totalFare)}</p>
        </div>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="grad-red inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-full px-5 text-[0.9rem] font-semibold text-white shadow-brand-red disabled:cursor-not-allowed disabled:opacity-50"
        >
          {booking ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden /> Processing…
            </>
          ) : (
            <>Pay &amp; issue ticket</>
          )}
        </button>
      </div>
    </div>
  );
}
