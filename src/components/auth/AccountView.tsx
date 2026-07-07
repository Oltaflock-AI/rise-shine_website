"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, PlaneTakeoff, Ticket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { PlaneLoader } from "@/components/ui/PlaneLoader";

export function AccountView() {
  const { user, ready, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login?redirect=/account");
  }, [ready, user, router]);

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
              <div className="mt-4 flex flex-col items-center rounded-brand border border-dashed border-line bg-cream/50 px-6 py-10 text-center">
                <Ticket className="mb-3 text-red" aria-hidden />
                <p className="font-semibold text-ink">No bookings yet</p>
                <p className="mt-1 max-w-sm text-[0.9rem] text-muted">
                  Once our live booking system is active, the flights and hotels you book will
                  appear here with your tickets and vouchers.
                </p>
                <Button href="/flights" arrow className="mt-5">
                  <PlaneTakeoff size={17} aria-hidden /> Search flights
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
