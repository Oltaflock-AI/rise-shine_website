"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  MessageCircle,
  Plane,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { PlaneLoader } from "@/components/ui/PlaneLoader";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtTime = (iso: string) => (iso || "").slice(11, 16);
const fmtDate = (iso: string) => {
  const d = (iso || "").slice(0, 10);
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

type Booking = Record<string, string>;

export function CheckoutView() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(window.location.search));
    setB(p);
  }, []);

  // login gate — reachable directly, so guard it here too
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

  const fare = Number(b.fare || 0);
  const stops = Number(b.stops || 0);
  const stopsLabel = stops === 0 ? "Non-stop" : `${stops} stop${stops > 1 ? "s" : ""}`;
  const dur = Number(b.dur || 0);
  const durLabel = dur ? `${Math.floor(dur / 60)}h ${String(dur % 60).padStart(2, "0")}m` : "";
  const wa = b.wa && b.wa.startsWith("http") ? b.wa : undefined;

  return (
    <>
      <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
        <Container>
          <nav className="mb-3 text-[0.85rem] font-medium text-white/70">
            <Link href="/flights" className="hover:text-white">Flights</Link> /{" "}
            <span className="text-white">Checkout</span>
          </nav>
          <h1 className="h-md text-white">{placed ? "Booking request confirmed" : "Review & pay"}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] text-white/75">
            <ShieldCheck size={15} aria-hidden /> Secure checkout · signed in as {user.email}
          </p>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container>
          {placed ? (
            <div className="mx-auto max-w-xl rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
              <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-red" aria-hidden />
              <h2 className="h-sm mb-2">Thanks, {user.name.split(" ")[0]}!</h2>
              <p className="mx-auto mb-6 max-w-md text-muted">
                Your booking request for <b className="text-ink">{b.from} → {b.to}</b> on{" "}
                {fmtDate(b.dep)} has been recorded. Live card payment activates once our TBO
                booking system is certified — until then our team will confirm your seat and
                collect payment directly.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grad-red inline-flex items-center gap-2 rounded-full px-6 py-3 text-[0.9rem] font-semibold text-white shadow-brand-red"
                  >
                    <MessageCircle size={17} aria-hidden /> Finish on WhatsApp
                  </a>
                )}
                <Button href="/account" variant="ghost">View my account</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              {/* Flight summary */}
              <div className="space-y-6">
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Plane size={18} className="text-red" aria-hidden />
                    <h2 className="text-[1.05rem] font-bold text-ink">Your flight</h2>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[1.6rem] font-extrabold tabular-nums text-ink">{fmtTime(b.dep)}</div>
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
                      <div className="text-[1.6rem] font-extrabold tabular-nums text-ink">{fmtTime(b.arr)}</div>
                      <div className="text-[0.85rem] font-medium text-muted">{b.to}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line pt-4 text-[0.85rem]">
                    <span className="font-semibold text-ink">{b.airline}</span>
                    <span className="text-muted">{b.flightNo}</span>
                    <span className="text-muted">{fmtDate(b.dep)}</span>
                  </div>
                </div>

                {/* Traveller */}
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <UserRound size={18} className="text-red" aria-hidden />
                    <h2 className="text-[1.05rem] font-bold text-ink">Lead traveller</h2>
                  </div>
                  <p className="text-[0.95rem] font-semibold text-ink">{user.name}</p>
                  <p className="text-[0.85rem] text-muted">{user.email}</p>
                  <p className="mt-3 text-[0.8rem] text-muted">
                    Passenger and passport details are collected at the final step once live
                    ticketing is enabled.
                  </p>
                </div>
              </div>

              {/* Price */}
              <div className="lg:sticky lg:top-28 lg:self-start">
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand">
                  <h2 className="text-[1.05rem] font-bold text-ink">Price summary</h2>
                  <dl className="mt-4 space-y-2.5 text-[0.9rem]">
                    <div className="flex justify-between">
                      <dt className="text-muted">Fare · 1 adult</dt>
                      <dd className="font-medium text-ink">₹{inr.format(fare)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Taxes & fees</dt>
                      <dd className="font-medium text-ink">Included</dd>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-line pt-3">
                      <dt className="font-bold text-ink">Total</dt>
                      <dd className="text-[1.2rem] font-extrabold text-navy">₹{inr.format(fare)}</dd>
                    </div>
                  </dl>
                  <button
                    onClick={() => {
                      setPlaced(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="grad-red mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full font-semibold text-white shadow-brand-red transition-transform duration-300 hover:-translate-y-[2px]"
                  >
                    <BadgeCheck size={18} aria-hidden /> Pay ₹{inr.format(fare)}
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[0.72rem] text-muted">
                    <ShieldCheck size={12} aria-hidden /> Fares confirmed at payment · demo checkout
                  </p>
                </div>
              </div>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
