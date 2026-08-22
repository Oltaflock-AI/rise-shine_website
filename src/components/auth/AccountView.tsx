"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BedDouble,
  ChevronDown,
  FileText,
  LogOut,
  MessageCircle,
  PlaneTakeoff,
  Ticket,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { PlaneLoader } from "@/components/ui/PlaneLoader";
import { formatDate } from "@/lib/format-date";
import { contactHref } from "@/lib/whatsapp";
import { cn } from "@/lib/cn";

/** One row of the customer's booking mirror (see migrations 0001/0002/0004). */
type BookingRow = {
  id: string;
  kind: "flight" | "hotel";
  created_at: string;
  status: number | null;
  booking_id: number | null;
  fare_inr: number | null;
  amount_paid_inr: number | null;
  cf_payment_id: string | null;
  // flight
  pnr: string | null;
  origin: string | null;
  destination: string | null;
  depart_date: string | null;
  airline_code: string | null;
  flight_number: string | null;
  ticket_numbers: string[] | null;
  // hotel
  hotel_name: string | null;
  city: string | null;
  check_in: string | null;
  check_out: string | null;
  rooms: number | null;
  confirmation_no: string | null;
};

type PaxRow = {
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  pax_type: number | null;
  ticket_number: string | null;
  is_lead: boolean | null;
};

const BOOKING_COLUMNS =
  "id, kind, created_at, status, booking_id, fare_inr, amount_paid_inr, cf_payment_id, " +
  "pnr, origin, destination, depart_date, airline_code, flight_number, ticket_numbers, " +
  "hotel_name, city, check_in, check_out, rooms, confirmation_no";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtDate = formatDate;

/** The date that decides upcoming vs past (travel date, not booked-on). */
const travelDate = (bk: BookingRow) =>
  (bk.kind === "hotel" ? bk.check_in : bk.depart_date) ?? null;

/**
 * Human status. Hotels persist 1 = confirmed and flip to 6 on a cancellation
 * request; flights mirror TBO's itinerary Status (5 = ticketed).
 */
function statusOf(bk: BookingRow): {
  label: string;
  tone: "good" | "warn" | "bad";
} {
  if (bk.status === 6) return { label: "Cancellation requested", tone: "bad" };
  if (bk.kind === "hotel") {
    return bk.status === 1
      ? { label: "Confirmed", tone: "good" }
      : { label: "Processing", tone: "warn" };
  }
  return bk.status === 5
    ? { label: "Ticketed", tone: "good" }
    : { label: "Confirmed", tone: "good" };
}

function StatusBadge({ bk }: { bk: BookingRow }) {
  const s = statusOf(bk);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold",
        s.tone === "good" && "bg-emerald-100 text-emerald-800",
        s.tone === "warn" && "bg-amber-100 text-amber-800",
        s.tone === "bad" && "bg-red/10 text-red",
      )}
    >
      {s.label}
    </span>
  );
}

/**
 * Asks the agency to cancel a flight. There is no self-serve TBO air cancel, so this is
 * the customer's only route and it must never vanish: when WhatsApp is unavailable it
 * becomes an email carrying the same details.
 */
function flightCancelHref(bk: BookingRow): {
  href: string;
  via: "whatsapp" | "email";
} {
  const text = `Hi Rise & Shine! I'd like to request cancellation of my flight booking:
${bk.origin ?? ""} → ${bk.destination ?? ""} on ${fmtDate(bk.depart_date)}${bk.pnr ? `\nPNR: ${bk.pnr}` : ""}${bk.booking_id ? `\nBooking id: ${bk.booking_id}` : ""}
Please let me know the cancellation charges and refund.`;
  return contactHref(text, "Flight cancellation request");
}

const PAX_TYPE: Record<number, string> = {
  1: "Adult",
  2: "Child",
  3: "Infant",
};

export function AccountView() {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paxByBooking, setPaxByBooking] = useState<
    Record<string, PaxRow[] | "loading">
  >({});

  /** Request a TBO cancellation; the server enforces ownership. */
  async function cancelHotel(bk: BookingRow) {
    if (
      !window.confirm(
        `Cancel ${bk.hotel_name ?? "this hotel booking"}? Cancellation charges may apply per the rate's policy.`,
      )
    )
      return;
    setCancelling(bk.id);
    try {
      const r = await fetch("/api/hotels/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: bk.booking_id }),
      });
      const j = await r.json();
      if (j.ok) {
        setBookings(
          (rows) =>
            rows?.map((x) => (x.id === bk.id ? { ...x, status: 6 } : x)) ??
            rows,
        );
      } else {
        window.alert(
          j.error ||
            "Cancellation failed — please contact us and we'll handle it.",
        );
      }
    } catch {
      window.alert("Network error — please try again or contact us.");
    } finally {
      setCancelling(null);
    }
  }

  /** Expand a booking; lazily pull its passengers (RLS: via owned booking). */
  function toggleExpand(bk: BookingRow) {
    setExpanded((e) => (e === bk.id ? null : bk.id));
    if (!paxByBooking[bk.id] && supabaseConfigured) {
      setPaxByBooking((m) => ({ ...m, [bk.id]: "loading" }));
      createClient()
        .from("passengers")
        .select(
          "title, first_name, last_name, pax_type, ticket_number, is_lead",
        )
        .eq("booking_id", bk.id)
        .order("is_lead", { ascending: false })
        .then(({ data, error }) => {
          setPaxByBooking((m) => ({
            ...m,
            [bk.id]: error ? [] : ((data ?? []) as PaxRow[]),
          }));
        });
    }
  }

  useEffect(() => {
    if (ready && !user) router.replace("/login?redirect=/account");
  }, [ready, user, router]);

  // RLS limits the select to the caller's own rows (policy in 0001).
  useEffect(() => {
    if (!ready || !user) return;
    let alive = true;
    (async () => {
      if (!supabaseConfigured) {
        if (alive) setBookings([]);
        return;
      }
      const { data, error } = await createClient()
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(50);
      if (alive)
        setBookings(error ? [] : ((data ?? []) as unknown as BookingRow[]));
    })();
    return () => {
      alive = false;
    };
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6 pt-24">
        <PlaneLoader message="Loading your account…" />
      </div>
    );
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  // A booking with no travel date (defensive) stays visible under Upcoming.
  const upcoming = (bookings ?? []).filter(
    (b) => (travelDate(b) ?? "9999") >= todayISO,
  );
  const past = (bookings ?? []).filter(
    (b) => (travelDate(b) ?? "9999") < todayISO,
  );

  const renderBooking = (bk: BookingRow) => {
    const open = expanded === bk.id;
    const pax = paxByBooking[bk.id];
    return (
      <li key={bk.id} className="rounded-brand border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => toggleExpand(bk)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {bk.kind === "hotel" ? (
              <BedDouble size={18} className="flex-none text-red" aria-hidden />
            ) : (
              <PlaneTakeoff
                size={18}
                className="flex-none text-red"
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">
                {bk.kind === "hotel"
                  ? bk.hotel_name || "Hotel booking"
                  : `${bk.origin ?? ""} → ${bk.destination ?? ""}${bk.airline_code ? ` · ${bk.airline_code}` : ""}`}
                <span className="ml-2 inline-block align-middle">
                  <StatusBadge bk={bk} />
                </span>
              </p>
              <p className="text-[0.82rem] text-muted">
                {bk.kind === "hotel" ? (
                  <>
                    {bk.city ? `${bk.city} · ` : ""}
                    {fmtDate(bk.check_in)} → {fmtDate(bk.check_out)}
                    {bk.rooms
                      ? ` · ${bk.rooms} room${bk.rooms > 1 ? "s" : ""}`
                      : ""}
                  </>
                ) : (
                  <>{fmtDate(bk.depart_date)}</>
                )}
              </p>
            </div>
            <ChevronDown
              size={16}
              className={cn(
                "ml-1 flex-none text-muted transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          <div className="text-right">
            <p className="text-[0.82rem] font-bold tracking-wide text-navy">
              {bk.kind === "hotel" ? bk.confirmation_no || "—" : bk.pnr || "—"}
            </p>
            <p className="text-[0.78rem] text-muted">
              {bk.amount_paid_inr != null || bk.fare_inr != null
                ? `₹${inr.format(bk.amount_paid_inr ?? bk.fare_inr ?? 0)}`
                : ""}
            </p>
          </div>
        </div>

        {open && (
          <div className="border-t border-line bg-cream/40 px-4 py-3 text-[0.85rem]">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                  Booked on
                </dt>
                <dd className="text-ink">{fmtDate(bk.created_at)}</dd>
              </div>
              {bk.kind === "flight" && bk.flight_number && (
                <div>
                  <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                    Flight
                  </dt>
                  <dd className="text-ink">{bk.flight_number}</dd>
                </div>
              )}
              {bk.booking_id != null && (
                <div>
                  <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                    Booking id
                  </dt>
                  <dd className="text-ink">{bk.booking_id}</dd>
                </div>
              )}
              {bk.amount_paid_inr != null && (
                <div>
                  <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                    Payment
                  </dt>
                  <dd className="text-ink">
                    ₹{inr.format(bk.amount_paid_inr)} paid online
                    {bk.cf_payment_id ? ` · ${bk.cf_payment_id}` : ""}
                  </dd>
                </div>
              )}
            </dl>

            {/* Travellers / guests on this booking */}
            <div className="mt-3">
              <p className="flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                <Users size={13} aria-hidden />{" "}
                {bk.kind === "hotel" ? "Guests" : "Passengers"}
              </p>
              {pax === "loading" || pax === undefined ? (
                <p className="mt-1 text-muted">Loading…</p>
              ) : pax.length === 0 ? (
                <p className="mt-1 text-muted">
                  Traveller details are with our team.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {pax.map((p, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-2 text-ink"
                    >
                      <span className="font-semibold">
                        {[p.title, p.first_name, p.last_name]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                      <span className="text-[0.78rem] text-muted">
                        {PAX_TYPE[p.pax_type ?? 0] ?? ""}
                        {p.is_lead ? " · Lead" : ""}
                        {p.ticket_number ? ` · Ticket ${p.ticket_number}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Manage */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {bk.kind === "hotel" && bk.booking_id != null && (
                <Link
                  href={`/hotels/voucher/${bk.booking_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border-[1.6px] border-navy/50 px-4 py-2 text-[0.8rem] font-semibold text-navy transition-colors hover:bg-navy/5"
                >
                  <FileText size={14} aria-hidden /> View voucher
                </Link>
              )}
              {bk.status !== 6 &&
                (bk.kind === "hotel" ? (
                  bk.booking_id != null && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => cancelHotel(bk)}
                      disabled={cancelling === bk.id}
                    >
                      {cancelling === bk.id ? "Cancelling…" : "Cancel booking"}
                    </Button>
                  )
                ) : (
                  <a
                    href={flightCancelHref(bk).href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border-[1.6px] border-red/60 px-4 py-2 text-[0.8rem] font-semibold text-red transition-colors hover:bg-red/5"
                  >
                    <MessageCircle size={14} aria-hidden /> Request cancellation
                  </a>
                ))}
              <a
                href={
                  contactHref(
                    `Hi! I have a question about my ${bk.kind} booking ${
                      bk.kind === "hotel"
                        ? (bk.confirmation_no ?? "")
                        : (bk.pnr ?? "")
                    }`.trim(),
                    "Question about my booking",
                  ).href
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.8rem] font-semibold text-ink underline underline-offset-4 hover:text-red"
              >
                Get help with this booking
              </a>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className="bg-navy pb-10 pt-28 text-white sm:pt-32">
        <Container>
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-red text-xl font-bold text-white">
              {(user.name.trim()[0] || "?").toUpperCase()}
            </span>
            <div>
              <p className="text-white/70">Welcome back,</p>
              <h1 className="h-md text-white">{user.name}</h1>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
            {/* Profile */}
            <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
              <h2 className="text-[1.05rem] font-bold text-ink">Profile</h2>
              <dl className="mt-4 space-y-3 text-[0.95rem]">
                <div>
                  <dt className="text-[0.78rem] font-semibold uppercase tracking-wide text-muted">
                    Name
                  </dt>
                  <dd className="text-ink">{user.name}</dd>
                </div>
                <div>
                  <dt className="text-[0.78rem] font-semibold uppercase tracking-wide text-muted">
                    Email
                  </dt>
                  <dd className="text-ink">{user.email}</dd>
                </div>
              </dl>
              <button
                onClick={() => {
                  logout();
                  router.push("/");
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-full border-[1.6px] border-line px-5 py-2.5 text-[0.9rem] font-semibold text-ink transition-colors hover:border-red hover:text-red"
              >
                <LogOut size={17} aria-hidden /> Log out
              </button>
            </div>

            {/* Bookings */}
            <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
              <h2 className="text-[1.05rem] font-bold text-ink">My bookings</h2>

              {bookings === null ? (
                <p className="mt-4 text-[0.9rem] text-muted">
                  Loading your bookings…
                </p>
              ) : bookings.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-brand border border-dashed border-line bg-cream/50 px-6 py-10 text-center">
                  <Ticket className="mb-3 text-red" aria-hidden />
                  <p className="font-semibold text-ink">No bookings yet</p>
                  <p className="mt-1 max-w-sm text-[0.9rem] text-muted">
                    Flights and hotels you book will appear here with your
                    tickets and confirmation numbers.
                  </p>
                  <Button href="/flights" arrow className="mt-5">
                    <PlaneTakeoff size={17} aria-hidden /> Search flights
                  </Button>
                </div>
              ) : (
                <>
                  {upcoming.length > 0 && (
                    <>
                      <h3 className="mt-4 text-[0.78rem] font-bold uppercase tracking-wide text-muted">
                        Upcoming
                      </h3>
                      <ul className="mt-2 space-y-3">
                        {upcoming.map(renderBooking)}
                      </ul>
                    </>
                  )}
                  {past.length > 0 && (
                    <>
                      <h3 className="mt-6 text-[0.78rem] font-bold uppercase tracking-wide text-muted">
                        Past
                      </h3>
                      <ul className="mt-2 space-y-3">
                        {past.map(renderBooking)}
                      </ul>
                    </>
                  )}
                  <p className="mt-5 text-[0.78rem] text-muted">
                    Tap a booking for its travellers, tickets and payment
                    details. Need a change? Every booking has a help link — we
                    handle changes personally.
                  </p>
                </>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
