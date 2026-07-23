"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, LogOut, PlaneTakeoff, Ticket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { PlaneLoader } from "@/components/ui/PlaneLoader";
import { formatDate } from "@/lib/format-date";

/** One row of the customer's booking mirror (see migrations 0001/0002/0004). */
type BookingRow = {
  id: string;
  kind: "flight" | "hotel";
  created_at: string;
  status: number | null;
  booking_id: number | null;
  fare_inr: number | null;
  amount_paid_inr: number | null;
  // flight
  pnr: string | null;
  origin: string | null;
  destination: string | null;
  depart_date: string | null;
  airline_code: string | null;
  ticket_numbers: string[] | null;
  // hotel
  hotel_name: string | null;
  city: string | null;
  check_in: string | null;
  check_out: string | null;
  rooms: number | null;
  confirmation_no: string | null;
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtDate = formatDate;

export function AccountView() {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  /** Request a TBO cancellation; the server enforces ownership. */
  async function cancelHotel(bk: BookingRow) {
    if (!window.confirm(`Cancel ${bk.hotel_name ?? "this hotel booking"}? Cancellation charges may apply per the rate's policy.`)) return;
    setCancelling(bk.id);
    try {
      const r = await fetch("/api/hotels/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: bk.booking_id }),
      });
      const j = await r.json();
      if (j.ok) {
        setBookings((rows) => rows?.map((x) => (x.id === bk.id ? { ...x, status: 6 } : x)) ?? rows);
      } else {
        window.alert(j.error || "Cancellation failed — please contact us and we'll handle it.");
      }
    } catch {
      window.alert("Network error — please try again or contact us.");
    } finally {
      setCancelling(null);
    }
  }

  useEffect(() => {
    if (ready && !user) router.replace("/login?redirect=/account");
  }, [ready, user, router]);

  // RLS limits the select to the caller's own rows (policy in 0001).
  useEffect(() => {
    if (!ready || !user || !supabaseConfigured) {
      if (ready) setBookings([]);
      return;
    }
    let alive = true;
    createClient()
      .from("bookings")
      .select(
        "id, kind, created_at, status, booking_id, fare_inr, amount_paid_inr, pnr, origin, destination, depart_date, airline_code, ticket_numbers, hotel_name, city, check_in, check_out, rooms, confirmation_no",
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (alive) setBookings(error ? [] : ((data ?? []) as BookingRow[]));
      });
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
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            {/* Profile */}
            <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
              <h2 className="text-[1.05rem] font-bold text-ink">Profile</h2>
              <dl className="mt-4 space-y-3 text-[0.95rem]">
                <div>
                  <dt className="text-[0.78rem] font-semibold uppercase tracking-wide text-muted">Name</dt>
                  <dd className="text-ink">{user.name}</dd>
                </div>
                <div>
                  <dt className="text-[0.78rem] font-semibold uppercase tracking-wide text-muted">Email</dt>
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
                <p className="mt-4 text-[0.9rem] text-muted">Loading your bookings…</p>
              ) : bookings.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-brand border border-dashed border-line bg-cream/50 px-6 py-10 text-center">
                  <Ticket className="mb-3 text-red" aria-hidden />
                  <p className="font-semibold text-ink">No bookings yet</p>
                  <p className="mt-1 max-w-sm text-[0.9rem] text-muted">
                    Flights and hotels you book will appear here with your tickets and
                    confirmation numbers.
                  </p>
                  <Button href="/flights" arrow className="mt-5">
                    <PlaneTakeoff size={17} aria-hidden /> Search flights
                  </Button>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {bookings.map((bk) => (
                    <li
                      key={bk.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-line px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {bk.kind === "hotel" ? (
                          <BedDouble size={18} className="flex-none text-red" aria-hidden />
                        ) : (
                          <PlaneTakeoff size={18} className="flex-none text-red" aria-hidden />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {bk.kind === "hotel"
                              ? bk.hotel_name || "Hotel booking"
                              : `${bk.origin ?? ""} → ${bk.destination ?? ""}${bk.airline_code ? ` · ${bk.airline_code}` : ""}`}
                          </p>
                          <p className="text-[0.82rem] text-muted">
                            {bk.kind === "hotel" ? (
                              <>
                                {bk.city ? `${bk.city} · ` : ""}
                                {fmtDate(bk.check_in)} → {fmtDate(bk.check_out)}
                                {bk.rooms ? ` · ${bk.rooms} room${bk.rooms > 1 ? "s" : ""}` : ""}
                              </>
                            ) : (
                              <>{fmtDate(bk.depart_date)}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[0.82rem] font-bold tracking-wide text-navy">
                          {bk.kind === "hotel" ? bk.confirmation_no || "—" : bk.pnr || "—"}
                        </p>
                        <p className="text-[0.78rem] text-muted">
                          {bk.amount_paid_inr != null || bk.fare_inr != null
                            ? `₹${inr.format(bk.amount_paid_inr ?? bk.fare_inr ?? 0)}`
                            : ""}
                        </p>
                        {bk.kind === "hotel" && bk.status !== 6 && bk.booking_id != null && (
                          <button
                            onClick={() => cancelHotel(bk)}
                            disabled={cancelling === bk.id}
                            className="mt-1 text-[0.75rem] font-semibold text-red underline-offset-2 hover:underline disabled:opacity-60"
                          >
                            {cancelling === bk.id ? "Cancelling…" : "Cancel booking"}
                          </button>
                        )}
                        {bk.status === 6 && (
                          <p className="mt-1 text-[0.75rem] font-semibold text-muted">Cancellation requested</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
