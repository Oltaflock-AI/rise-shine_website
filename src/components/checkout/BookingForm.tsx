"use client";

import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDateWithDay } from "@/lib/format-date";
import { PlaneLoader } from "@/components/ui/PlaneLoader";
import {
  openCashfreeCheckout,
  type CashfreeMode,
} from "@/lib/cashfree-checkout";
import { FareEntitlements } from "./FareEntitlements";
import { BaggageSummary, weakestAllowance } from "@/components/ui/fare-info";
import { NATIONALITIES } from "@/data/nationalities";
import {
  controlClass,
  controlLabelClass,
  DateField,
  Select,
} from "@/components/ui/form-controls";
import { SavedAddressPicker, SavedTravellerPicker } from "./SavedDetails";
import {
  forgetSaved,
  loadSavedAddresses,
  loadSavedTravellers,
  type SavedAddress,
  type SavedTraveller,
} from "@/lib/saved-details";
import type { QuoteDetails } from "@/lib/tbo-book";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Titles TBO accepts (Navitaire 4X). "Master"/"Miss" are rejected. */
const TITLES: Record<PaxType, string[]> = {
  1: ["MR", "MRS", "MS"],
  2: ["MR", "MS"],
  3: ["MSTR", "MR", "MS"],
};
/** TBO only accepts the upper-case code, but shouting "MR" at the traveller is
 *  not how the rest of the site talks — show the cased word, send the code. */
const TITLE_LABEL: Record<string, string> = {
  MR: "Mr",
  MRS: "Mrs",
  MS: "Ms",
  MSTR: "Mstr",
};
type PaxType = 1 | 2 | 3;
const TYPE_LABEL: Record<PaxType, string> = {
  1: "Adult",
  2: "Child",
  3: "Infant",
};

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
  /** Baggage, inclusions and refund rules, read off the confirmed FareQuote. */
  details?: QuoteDetails;
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
  /** Server says the order was never paid — worded as "not charged", not as a failure. */
  unpaid?: boolean;
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

/** A saved address as the contact form holds it. Blank fields stay blank, not "null". */
function contactFromAddress(a: SavedAddress, fallbackEmail: string) {
  return {
    phone: a.phone ?? "",
    email: a.email || fallbackEmail,
    address1: a.address1 ?? "",
    address2: a.address2 ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    pin: a.pin ?? "",
    countryCode: a.country_code || "IN",
    nationality: a.nationality || a.country_code || "IN",
  };
}

const TODAY = new Date().toISOString().slice(0, 10);

const field = controlClass;
const label = controlLabelClass;

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
  /**
   * Billing address, in the shape airlines and GST invoices actually need. A single
   * free-text "address" line could not carry a PIN code, and TBO's Passenger object
   * has no PinCode/State field of its own — so line 2 carries area, state and PIN,
   * which is what an address line 2 is for. Nothing is silently dropped.
   */
  const [contact, setContact] = useState({
    phone: "",
    email: contactEmail,
    address1: "",
    address2: "",
    city: "Ahmedabad",
    state: "",
    pin: "",
    countryCode: "IN",
    nationality: "IN",
  });
  const [gst, setGst] = useState({ GSTCompanyName: "", GSTNumber: "" });
  /**
   * What we already know about this customer from their past bookings
   * (lib/saved-details, RLS-scoped). Empty for a first-time or signed-out
   * booker, and the form behaves exactly as before in that case.
   */
  const [savedPax, setSavedPax] = useState<SavedTraveller[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
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
        if (alive)
          setQuote({
            ok: false,
            error: "Could not price this fare. Please search again.",
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [b.traceId, b.searchedAt, b.resultIndex]);

  // Pull the saved travellers + addresses once. The most recently used address is
  // applied straight away — re-typing the same billing address is the friction
  // this exists to remove — while names are always an explicit pick, because a
  // wrong one is a wasted ticket. Both stay fully editable afterwards.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [people, addresses] = await Promise.all([
        loadSavedTravellers(),
        loadSavedAddresses(),
      ]);
      if (!alive) return;
      setSavedPax(people);
      setSavedAddresses(addresses);
      const first = addresses[0];
      if (first) {
        setAddressId(first.id);
        setContact((c) => ({ ...c, ...contactFromAddress(first, c.email) }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const flags = quote?.flags ?? {};
  const isIntl = b.intl === "1";
  const needPassport = Boolean(
    flags.IsPassportRequiredAtBook ||
    flags.IsPassportRequiredAtTicket ||
    isIntl,
  );
  const needFullPassport = Boolean(flags.IsPassportFullDetailRequiredAtBook);
  const needPan = Boolean(
    flags.IsPanRequiredAtBook || flags.IsPanRequiredAtTicket,
  );
  const needGst = Boolean(flags.IsGSTMandatory);

  const set = (i: number, k: keyof PaxForm, v: string | number) =>
    setPax((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  /** Fill one passenger card from a saved traveller. Its own pax type wins — a
   *  saved adult picked into an infant slot must stay an infant. */
  function applySavedTraveller(i: number, t: SavedTraveller) {
    setPax((prev) =>
      prev.map((x, j) => {
        if (j !== i) return x;
        const allowed = TITLES[x.PaxType];
        const title =
          t.title && allowed.includes(t.title) ? t.title : allowed[0];
        return {
          ...x,
          Title: title,
          FirstName: t.first_name ?? "",
          LastName: t.last_name ?? "",
          Gender: t.gender === 2 ? 2 : 1,
          DateOfBirth: t.dob ?? "",
          PAN: t.pan ?? "",
          PassportNo: t.passport_no ?? "",
          PassportExpiry: t.passport_expiry ?? "",
          PassportIssueDate: t.passport_issue_date ?? "",
        };
      }),
    );
  }

  /**
   * Every manual edit to the contact block. It also clears the saved-address
   * selection: once a field is changed by hand, this is no longer that saved
   * address, and the picker must stop claiming it is.
   */
  const updateContact = (patch: Partial<typeof contact>) => {
    setContact((c) => ({ ...c, ...patch }));
    setAddressId(null);
  };

  function applySavedAddress(a: SavedAddress) {
    setAddressId(a.id);
    setContact((c) => ({ ...c, ...contactFromAddress(a, contactEmail) }));
  }

  /** Forget a saved row, and drop it from the picker without a re-fetch. */
  async function forgetTraveller(t: SavedTraveller) {
    if (await forgetSaved("travellers", t.id)) {
      setSavedPax((list) => list.filter((x) => x.id !== t.id));
    }
  }

  async function forgetAddress(a: SavedAddress) {
    if (await forgetSaved("saved_addresses", a.id)) {
      setSavedAddresses((list) => list.filter((x) => x.id !== a.id));
      if (addressId === a.id) setAddressId(null);
    }
  }

  const country = NATIONALITIES.find((n) => n.code === contact.countryCode);
  /** TBO takes one address line 2, so area / state / PIN are joined into it. */
  const addressLine2 = [
    contact.address2.trim(),
    contact.state.trim(),
    contact.pin.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  const fullAddress = [
    contact.address1.trim(),
    addressLine2,
    contact.city.trim(),
    country?.label,
  ]
    .filter(Boolean)
    .join(", ");
  // India posts 6-digit PINs; elsewhere the code is free-form, so only length is checked.
  const pinValid =
    contact.countryCode === "IN"
      ? /^\d{6}$/.test(contact.pin.trim())
      : contact.pin.trim().length >= 3;

  const totalFare =
    quote?.publishedFare ?? Number(b.fare || 0) * (adults + children);

  const canSubmit = useMemo(() => {
    if (!quote?.ok || booking) return false;
    if (!/^\d{10}$/.test(contact.phone.trim())) return false;
    if (!contact.email.trim()) return false;
    if (!contact.address1.trim() || !contact.city.trim() || !pinValid)
      return false;
    if (needGst && (!gst.GSTNumber.trim() || !gst.GSTCompanyName.trim()))
      return false;
    return pax.every((p) => {
      if (!p.FirstName.trim() || p.LastName.trim().length < 2) return false;
      if ((p.PaxType === 2 || p.PaxType === 3) && !p.DateOfBirth) return false;
      if (needPassport && (!p.PassportNo.trim() || !p.PassportExpiry))
        return false;
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
  }, [
    quote,
    booking,
    contact,
    gst,
    pax,
    needPassport,
    needFullPassport,
    needPan,
    needGst,
    pinValid,
  ]);

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
        AddressLine1: contact.address1.trim(),
        AddressLine2: addressLine2,
        City: contact.city.trim(),
        CountryCode: contact.countryCode,
        CountryName: country?.label ?? "India",
        Nationality: contact.nationality,
      };
      if (p.PAN.trim()) out.PAN = p.PAN.trim().toUpperCase();
      if (needPassport) {
        out.PassportNo = p.PassportNo.trim();
        out.PassportExpiry = `${p.PassportExpiry}T00:00:00`;
        if (p.PassportIssueDate)
          out.PassportIssueDate = `${p.PassportIssueDate}T00:00:00`;
        out.PassportIssueCountryCode = contact.nationality;
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
      // Structured for the saved-address book only — TBO gets the folded version
      // on each passenger (see buildPassengers).
      billing: {
        phone: contact.phone.trim(),
        email: contact.email.trim(),
        address1: contact.address1.trim(),
        address2: contact.address2.trim(),
        city: contact.city.trim(),
        state: contact.state.trim(),
        pin: contact.pin.trim(),
        countryCode: contact.countryCode,
        nationality: contact.nationality,
      },
      gst: needGst
        ? {
            GSTCompanyName: gst.GSTCompanyName,
            GSTNumber: gst.GSTNumber,
            GSTCompanyAddress: fullAddress,
            GSTCompanyEmail: contact.email,
            GSTCompanyContactNumber: contact.phone,
          }
        : undefined,
    };
  }

  /**
   * POST /api/book — ticket the fare, passing the Cashfree order the customer paid.
   *
   * Only the order id is sent. Cashfree gives the browser no signed receipt, so the
   * server re-reads the order from Cashfree and refuses to ticket unless it is PAID
   * and bound to this itinerary — nothing the client claims here is trusted.
   */
  async function sendToBook(
    passengers: ReturnType<typeof buildPassengers>,
    orderId: string | null,
  ) {
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commonPayload(passengers),
          payment: orderId ? { orderId } : undefined,
        }),
      });
      const parsed = (await r.json()) as Booked;
      if (parsed.ok) trackEvent("booking_confirmed", { kind: "flight" });
      // A 402 means the customer closed checkout or the payment never went through.
      // Say so plainly rather than surfacing it as a booking failure.
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

  /**
   * Collect payment (Cashfree), then ticket. Money is taken BEFORE we call TBO;
   * the server refunds automatically if ticketing then fails.
   *
   * There is deliberately NO unpaid path. A 503 from the order route means payment is
   * unavailable, so booking stops — it must never degrade into ticketing for free. This
   * previously fell through to sendToBook(passengers, null), which against live TBO
   * credentials would issue a real ticket on agency credit with no money collected.
   */
  async function submit() {
    setBooking(true);
    setBooked(null);
    const passengers = buildPassengers();

    let order: {
      ok: boolean;
      orderId?: string;
      paymentSessionId?: string;
      mode?: CashfreeMode;
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
        setBooked({
          ok: false,
          error:
            "Online payment is temporarily unavailable, so we can't confirm this booking right now. Please call us and we'll ticket it for you.",
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
      // Includes a 422 pre-charge validation failure (order.rule) — nothing was charged.
      setBooked({
        ok: false,
        error: order.error ?? "Could not start payment.",
        rule: order.rule,
      });
      setBooking(false);
      return;
    }

    trackEvent("payment_started", { kind: "flight" });
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

    // Ask the SERVER whether the order is paid, whatever the popup reported. Doing this
    // even on `result.error` matters: a customer who pays and then closes the window
    // still gets their ticket instead of a "cancelled" message and a silent charge.
    await sendToBook(passengers, order.orderId);
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
        <h2 className="h-sm mb-1">
          {nextLeg ? "Outbound ticket confirmed" : "Ticket confirmed"}
        </h2>
        <p className="mb-2 text-muted">
          {b.from} → {b.to} · {b.airline}
          {nextLeg ? " · now book your return to complete the round trip" : ""}
        </p>
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-cream-2 px-4 py-2 text-[0.95rem] font-extrabold text-ink">
          <CalendarDays size={16} className="text-red" aria-hidden />
          {formatDateWithDay(b.depart)}
        </p>
        <dl className="mx-auto mb-6 grid max-w-sm gap-2 text-left text-[0.9rem]">
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">PNR</dt>
            <dd className="font-bold tracking-wide text-navy">{booked.pnr}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Ticket number</dt>
            <dd className="min-w-0 break-words text-right font-semibold text-ink">
              {booked.ticketNumbers?.join(", ") || booked.pnr}
            </dd>
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
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-[0.9rem] text-ink">
            The airline re-priced this fare. The total below is the confirmed
            price.
          </p>
        )}

        {quote.details && <FareEntitlements details={quote.details} />}

        {pax.map((p, i) => (
          <div
            key={i}
            className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm"
          >
            <h3 className="mb-4 text-[0.95rem] font-bold text-ink">
              {TYPE_LABEL[p.PaxType]}{" "}
              {pax.filter((x) => x.PaxType === p.PaxType).indexOf(p) + 1}
              {p.PaxType === 2 && (
                <span className="ml-1 font-normal text-muted">(2–12 yrs)</span>
              )}
              {p.PaxType === 3 && (
                <span className="ml-1 font-normal text-muted">
                  (under 2 yrs)
                </span>
              )}
            </h3>

            <SavedTravellerPicker
              travellers={savedPax.filter((t) => t.pax_type === p.PaxType)}
              onPick={(t) => applySavedTraveller(i, t)}
              onForget={forgetTraveller}
            />

            <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
              <div>
                <label className={label}>Title</label>
                <Select
                  value={p.Title}
                  onChange={(e) => set(i, "Title", e.target.value)}
                >
                  {TITLES[p.PaxType].map((t) => (
                    <option key={t} value={t}>
                      {TITLE_LABEL[t] ?? t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={label}>First name</label>
                <input
                  className={field}
                  value={p.FirstName}
                  maxLength={32}
                  onChange={(e) =>
                    set(
                      i,
                      "FirstName",
                      e.target.value.replace(/[^A-Za-z ]/g, ""),
                    )
                  }
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
                  onChange={(e) =>
                    set(
                      i,
                      "LastName",
                      e.target.value.replace(/[^A-Za-z ]/g, ""),
                    )
                  }
                  placeholder="As on ID (min 2 letters, no title)"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Gender</label>
                <Select
                  value={p.Gender}
                  onChange={(e) =>
                    set(i, "Gender", Number(e.target.value) as 1 | 2)
                  }
                >
                  <option value={1}>Male</option>
                  <option value={2}>Female</option>
                </Select>
              </div>
              <div>
                <label className={label}>
                  Date of birth{" "}
                  {p.PaxType !== 1 && <span className="text-red">*</span>}
                </label>
                <DateField
                  value={p.DateOfBirth}
                  max={TODAY}
                  onChange={(v) => set(i, "DateOfBirth", v)}
                  aria-label={`${TYPE_LABEL[p.PaxType]} date of birth`}
                />
              </div>
            </div>

            {needPassport && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={label}>Passport no.</label>
                  <input
                    className={field}
                    value={p.PassportNo}
                    onChange={(e) => set(i, "PassportNo", e.target.value)}
                  />
                </div>
                <div>
                  <label className={label}>Expiry</label>
                  <DateField
                    value={p.PassportExpiry}
                    min={TODAY}
                    onChange={(v) => set(i, "PassportExpiry", v)}
                    aria-label="Passport expiry date"
                  />
                </div>
                {needFullPassport && (
                  <div>
                    <label className={label}>Issue date</label>
                    <DateField
                      value={p.PassportIssueDate}
                      max={TODAY}
                      onChange={(v) => set(i, "PassportIssueDate", v)}
                      aria-label="Passport issue date"
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
                      onChange={(e) =>
                        set(i, "PAN", e.target.value.toUpperCase())
                      }
                      placeholder="ABCDE1234F"
                      maxLength={10}
                    />
                  </div>
                ) : (
                  <div className="rounded-brand bg-cream-2 p-3">
                    <p className="mb-2 text-[0.88rem] text-muted">
                      Parent/guardian PAN is required for a{" "}
                      {TYPE_LABEL[p.PaxType].toLowerCase()}.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        className={field}
                        value={p.GuardianFirstName}
                        maxLength={32}
                        onChange={(e) =>
                          set(
                            i,
                            "GuardianFirstName",
                            e.target.value.replace(/[^A-Za-z ]/g, ""),
                          )
                        }
                        placeholder="Guardian first name"
                      />
                      <input
                        className={field}
                        value={p.GuardianLastName}
                        maxLength={32}
                        onChange={(e) =>
                          set(
                            i,
                            "GuardianLastName",
                            e.target.value.replace(/[^A-Za-z ]/g, ""),
                          )
                        }
                        placeholder="Guardian last name"
                      />
                      <input
                        className={field}
                        autoCapitalize="characters"
                        value={p.GuardianPAN}
                        onChange={(e) =>
                          set(i, "GuardianPAN", e.target.value.toUpperCase())
                        }
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

        {/* ── contact + billing address ── */}
        <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
          <h3 className="mb-1 text-[0.95rem] font-bold text-ink">
            Contact details
          </h3>
          <p className="mb-4 text-[0.88rem] text-muted">
            Your ticket and invoice go to this email. The airline uses the
            mobile number for schedule changes.
          </p>

          <SavedAddressPicker
            addresses={savedAddresses}
            selectedId={addressId}
            onPick={applySavedAddress}
            onNew={() => {
              setAddressId(null);
              setContact((c) => ({
                ...c,
                phone: "",
                email: contactEmail,
                address1: "",
                address2: "",
                city: "",
                state: "",
                pin: "",
              }));
            }}
            onForget={forgetAddress}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>
                Mobile <span className="text-red">*</span>
              </label>
              <div className="flex gap-2">
                <span className="grid place-items-center rounded-brand border border-line bg-cream-2 px-3 text-[0.9rem] text-muted">
                  +91
                </span>
                <input
                  className={field}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={contact.phone}
                  onChange={(e) =>
                    updateContact({
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                  placeholder="9876543210"
                />
              </div>
            </div>
            <div>
              <label className={label}>
                Email <span className="text-red">*</span>
              </label>
              <input
                className={field}
                type="email"
                value={contact.email}
                onChange={(e) => updateContact({ email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <h4 className="mb-1 mt-6 text-[0.95rem] font-bold text-ink">
            Billing address
          </h4>
          <p className="mb-4 text-[0.88rem] text-muted">
            As on the card you will pay with. This address prints on your GST
            invoice.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>
                Address line 1 <span className="text-red">*</span>
              </label>
              <input
                className={field}
                value={contact.address1}
                maxLength={64}
                onChange={(e) => updateContact({ address1: e.target.value })}
                placeholder="Flat / house no., building, street"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Address line 2</label>
              <input
                className={field}
                value={contact.address2}
                maxLength={64}
                onChange={(e) => updateContact({ address2: e.target.value })}
                placeholder="Area, locality, landmark (optional)"
              />
            </div>
            <div>
              <label className={label}>
                City <span className="text-red">*</span>
              </label>
              <input
                className={field}
                value={contact.city}
                maxLength={32}
                onChange={(e) => updateContact({ city: e.target.value })}
                placeholder="Ahmedabad"
              />
            </div>
            <div>
              <label className={label}>State</label>
              <input
                className={field}
                value={contact.state}
                maxLength={32}
                onChange={(e) => updateContact({ state: e.target.value })}
                placeholder="Gujarat"
              />
            </div>
            <div>
              <label className={label}>
                PIN / postal code <span className="text-red">*</span>
              </label>
              <input
                className={field}
                inputMode={contact.countryCode === "IN" ? "numeric" : "text"}
                maxLength={10}
                value={contact.pin}
                onChange={(e) =>
                  updateContact({
                    pin:
                      contact.countryCode === "IN"
                        ? e.target.value.replace(/\D/g, "").slice(0, 6)
                        : e.target.value,
                  })
                }
                placeholder={
                  contact.countryCode === "IN" ? "380015" : "Postal code"
                }
              />
              {contact.pin.trim() !== "" && !pinValid && (
                <p className="mt-1 text-[0.82rem] font-medium text-red">
                  {contact.countryCode === "IN"
                    ? "An Indian PIN code is exactly 6 digits."
                    : "Enter a valid postal code."}
                </p>
              )}
            </div>
            <div>
              <label className={label}>
                Country <span className="text-red">*</span>
              </label>
              <Select
                value={contact.countryCode}
                onChange={(e) =>
                  updateContact({ countryCode: e.target.value, pin: "" })
                }
              >
                {NATIONALITIES.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </div>
            {needPassport && (
              <div className="sm:col-span-2">
                <label className={label}>Nationality (as on passport)</label>
                <Select
                  value={contact.nationality}
                  onChange={(e) =>
                    updateContact({ nationality: e.target.value })
                  }
                >
                  {NATIONALITIES.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {needGst && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>GST company name</label>
                <input
                  className={field}
                  value={gst.GSTCompanyName}
                  onChange={(e) =>
                    setGst({ ...gst, GSTCompanyName: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={label}>GSTIN</label>
                <input
                  className={field}
                  value={gst.GSTNumber}
                  onChange={(e) =>
                    setGst({ ...gst, GSTNumber: e.target.value.toUpperCase() })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {booked && !booked.ok && (
          <p className="rounded-brand border border-red/30 bg-red/5 px-4 py-3 text-[0.9rem] text-ink">
            <b>Booking not completed.</b> {booked.error}
          </p>
        )}
      </div>

      {/* ── summary ── */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
          <h3 className="mb-3 text-[0.95rem] font-bold text-ink">
            {b.airline}
          </h3>
          <p className="text-[0.9rem] text-muted">
            {b.from} → {b.to}
          </p>
          <p className="text-[0.9rem] font-bold text-ink">
            {formatDateWithDay(b.depart)}
          </p>
          <p className="mb-3 text-[0.88rem] text-muted">{b.flightNo}</p>
          {quote.details?.segments.length ? (
            <BaggageSummary
              className="mb-4"
              checkedIn={weakestAllowance(
                quote.details.segments.map((s) => s.checkedIn),
              )}
              cabin={weakestAllowance(
                quote.details.segments.map((s) => s.cabin),
              )}
            />
          ) : null}
          {quote.details?.fare && (
            <dl className="space-y-1 border-t border-line pt-3 text-[0.88rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Base fare</dt>
                <dd className="tabular-nums text-ink">
                  ₹{inr.format(quote.details.fare.base)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Taxes &amp; surcharges</dt>
                <dd className="tabular-nums text-ink">
                  ₹{inr.format(quote.details.fare.tax)}
                </dd>
              </div>
            </dl>
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-[0.9rem] text-muted">Total</span>
            <span className="text-[1.35rem] font-extrabold text-navy">
              ₹{inr.format(totalFare)}
            </span>
          </div>
          <p className="mb-4 text-[0.82rem] text-muted">
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
                <Loader2 size={15} className="animate-spin" aria-hidden />{" "}
                Processing…
              </>
            ) : (
              <>Pay ₹{inr.format(totalFare)} & issue ticket</>
            )}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.82rem] text-muted">
            <ShieldCheck size={13} aria-hidden /> Secure payment via Cashfree ·
            ticket issued on success
          </p>
        </div>
      </aside>

      {/* Mobile sticky pay bar — the summary card sits below the form on small
          screens, so surface the total + CTA without scrolling past it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-[84px] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="text-[0.76rem] font-bold uppercase tracking-wide text-muted">
            Total
          </p>
          <p className="truncate text-[1.05rem] font-extrabold text-navy">
            ₹{inr.format(totalFare)}
          </p>
        </div>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="grad-red inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-full px-5 text-[0.9rem] font-semibold text-white shadow-brand-red disabled:cursor-not-allowed disabled:opacity-50"
        >
          {booking ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden />{" "}
              Processing…
            </>
          ) : (
            <>Pay &amp; issue ticket</>
          )}
        </button>
      </div>
    </div>
  );
}
