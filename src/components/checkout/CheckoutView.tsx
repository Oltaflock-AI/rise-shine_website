"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plane, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { PlaneLoader } from "@/components/ui/PlaneLoader";
import { BookingForm } from "./BookingForm";
import { formatDate } from "@/lib/format-date";

const fmtTime = (iso: string) => (iso || "").slice(11, 16);
const fmtDate = formatDate;

type Booking = Record<string, string>;

export function CheckoutView() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);

  useEffect(() => {
    setB(Object.fromEntries(new URLSearchParams(window.location.search)));
  }, []);

  // login gate — this page is reachable directly, so guard it here too
  useEffect(() => {
    if (ready && !user) {
      const back = `/checkout${window.location.search}`;
      router.replace(`/login?redirect=${encodeURIComponent(back)}`);
    }
  }, [ready, user, router]);

  if (!ready || !user || !b) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6 pt-24">
        <PlaneLoader message="Preparing your booking…" />
      </div>
    );
  }

  // A live booking needs TBO's TraceId + ResultIndex. Links without them (an old tab,
  // a shared URL) fall back to the enquiry route rather than a dead end.
  const canBook = Boolean(b.traceId && b.resultIndex);
  const stops = Number(b.stops || 0);
  const stopsLabel = stops === 0 ? "Non-stop" : `${stops} stop${stops > 1 ? "s" : ""}`;
  const dur = Number(b.dur || 0);
  const durLabel = dur ? `${Math.floor(dur / 60)}h ${String(dur % 60).padStart(2, "0")}m` : "";
  const wa = b.wa?.startsWith("http") ? b.wa : undefined;

  return (
    <>
      <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
        <Container>
          <nav className="mb-3 text-[0.85rem] font-medium text-white/70">
            <Link href="/flights" className="hover:text-white">
              Flights
            </Link>{" "}
            / <span className="text-white">Checkout</span>
          </nav>
          <h1 className="h-md text-white">Passenger details</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] text-white/75">
            <ShieldCheck size={15} aria-hidden /> Secure checkout · signed in as {user.email}
          </p>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container>
          {/* flight strip */}
          <div className="mb-8 rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[1.5rem] font-extrabold tabular-nums text-ink">{fmtTime(b.dep)}</div>
                <div className="text-[0.85rem] font-medium text-muted">{b.from}</div>
              </div>
              <div className="flex flex-1 flex-col items-center px-2">
                <div className="text-[0.75rem] text-muted">{durLabel}</div>
                <div className="my-1 flex w-full items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-line" />
                  <span className="h-px flex-1 bg-line" />
                  <Plane size={14} className="text-red" aria-hidden />
                  <span className="h-px flex-1 bg-line" />
                  <span className="h-1.5 w-1.5 rounded-full bg-line" />
                </div>
                <div className="text-[0.72rem] font-medium text-muted">{stopsLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-[1.5rem] font-extrabold tabular-nums text-ink">{fmtTime(b.arr)}</div>
                <div className="text-[0.85rem] font-medium text-muted">{b.to}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line pt-4 text-[0.85rem]">
              <span className="font-semibold text-ink">{b.airline}</span>
              <span className="text-muted">{b.flightNo}</span>
              <span className="text-muted">{fmtDate(b.dep)}</span>
            </div>
          </div>

          {canBook ? (
            <BookingForm b={b} contactEmail={user.email} />
          ) : (
            <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
              <h2 className="h-sm mb-2">This fare has expired</h2>
              <p className="mb-6 text-muted">
                Airline fares are held for a short time only. Please search again for live
                availability, or send us the trip and our team will price it by hand.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button href="/flights" arrow>
                  Search again
                </Button>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 text-[0.9rem] font-semibold text-ink transition hover:border-red hover:text-red"
                  >
                    <MessageCircle size={17} aria-hidden /> WhatsApp us
                  </a>
                )}
              </div>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
