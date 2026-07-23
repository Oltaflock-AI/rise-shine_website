"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Loader2, ShieldCheck, CalendarDays } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { HotelBookingForm } from "./HotelBookingForm";
import { formatDate } from "@/lib/format-date";

const fmtDate = formatDate;

type Booking = Record<string, string>;

export function HotelCheckoutView() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);

  useEffect(() => {
    setB(Object.fromEntries(new URLSearchParams(window.location.search)));
  }, []);

  // Login gate — this page is reachable directly, so guard it here too.
  useEffect(() => {
    if (ready && !user) {
      const back = `/hotels/checkout${window.location.search}`;
      router.replace(`/login?redirect=${encodeURIComponent(back)}`);
    }
  }, [ready, user, router]);

  if (!ready || !user || !b) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6 pt-24">
        <span className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="animate-spin text-red" size={18} aria-hidden /> Preparing your booking…
        </span>
      </div>
    );
  }

  // A live booking needs the PreBook BookingCode. Stale links fall back to search.
  const canBook = Boolean(b.bookingCode);
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: b.currency || "INR",
    maximumFractionDigits: 0,
  });
  const nights = Number(b.nights || 1);

  return (
    <>
      <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
        <Container>
          <nav className="mb-3 text-[0.85rem] font-medium text-white/70">
            <Link href="/hotels" className="hover:text-white">
              Hotels
            </Link>{" "}
            / <span className="text-white">Checkout</span>
          </nav>
          <h1 className="h-md text-white">Guest details</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] text-white/75">
            <ShieldCheck size={15} aria-hidden /> Secure checkout · signed in as {user.email}
          </p>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container>
          {/* hotel strip */}
          <div className="mb-8 rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[1.15rem] font-extrabold text-ink">
                  <BedDouble size={18} className="flex-none text-red" aria-hidden />
                  <span className="truncate">{b.hotel}</span>
                </div>
                {b.city && <div className="mt-1 text-[0.85rem] font-medium text-muted">{b.city}</div>}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.85rem] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-red" aria-hidden />
                    {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                  </span>
                  <span>
                    {nights} night{nights > 1 ? "s" : ""} · {b.rooms} room{Number(b.rooms) > 1 ? "s" : ""} ·{" "}
                    {Number(b.adults || 2) + Number(b.children || 0)} guest
                    {Number(b.adults || 2) + Number(b.children || 0) > 1 ? "s" : ""}/room
                  </span>
                  {b.room && <span>{b.room}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[1.4rem] font-extrabold tabular-nums text-navy">{money.format(Number(b.fare || 0))}</div>
                <div className="text-[0.72rem] text-muted">total · at search</div>
              </div>
            </div>
          </div>

          {canBook ? (
            <HotelBookingForm b={b} contactEmail={user.email} />
          ) : (
            <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
              <h2 className="h-sm mb-2">This rate has expired</h2>
              <p className="mb-6 text-muted">
                Hotel rates are held for a short time only. Please search again for live
                availability.
              </p>
              <Button href="/hotels" arrow>
                Search again
              </Button>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
