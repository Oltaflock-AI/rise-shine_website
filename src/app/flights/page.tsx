import type { Metadata } from "next";
import Link from "next/link";
import { Search, TriangleAlert } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/sections/SearchBar";
import { FlightCard } from "@/components/ui/FlightCard";
import { searchFlights, defaultDates, type FlightOffer } from "@/lib/tbo";
import { resolveAirport } from "@/data/airports";
import { site } from "@/data/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flight Search",
  description:
    "Search real-time flight fares from Ahmedabad and across India with Rise & Shine Travels.",
  robots: { index: false },
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function waHref(offer: FlightOffer, adults: number): string {
  const s0 = offer.segments[0];
  const sL = offer.segments[offer.segments.length - 1];
  const text = `Hi Rise & Shine! I'd like to book this flight:
${offer.airlineName} (${offer.segments.map((s) => s.flightNumber).join(" / ")})
${s0?.from} ${(s0?.depTime || "").slice(11, 16)} → ${sL?.to} ${(sL?.arrTime || "").slice(11, 16)} · ${offer.stops === 0 ? "non-stop" : `${offer.stops} stop`}
Fare ₹${inr.format(offer.fareINR)} per adult × ${adults}.
Please confirm availability and proceed to book.`;
  return `https://wa.me/${site.phone.whatsapp}?text=${encodeURIComponent(text)}`;
}

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const trip = sp.trip === "round" ? "round" : sp.return ? "round" : "oneway";
  const initial = {
    from: sp.from,
    to: sp.to,
    depart: sp.depart,
    return: sp.return,
    adults: sp.adults,
    children: sp.children,
    infants: sp.infants,
    cabin: sp.cabin,
    fare: sp.fare,
    airline: sp.airline,
    nonstop: sp.nonstop,
    trip: trip as "oneway" | "round",
  };

  const fromA = resolveAirport(sp.from || "AMD");
  const toA = sp.to ? resolveAirport(sp.to) : undefined;
  const adults = Math.min(9, Math.max(1, parseInt(sp.adults || "1", 10) || 1));
  const childCount = Math.min(9, Math.max(0, parseInt(sp.children || "0", 10) || 0));
  const infantCount = Math.min(adults, Math.max(0, parseInt(sp.infants || "0", 10) || 0));
  const cabin = ["Economy", "Premium Economy", "Business", "First"].includes(sp.cabin || "")
    ? (sp.cabin as string)
    : "Economy";
  const directOnly = sp.nonstop === "1";
  const preferredAirlines = sp.airline ? [sp.airline.toUpperCase()] : undefined;

  const paxSummary = [
    `${adults} adult${adults > 1 ? "s" : ""}`,
    childCount ? `${childCount} child${childCount > 1 ? "ren" : ""}` : "",
    infantCount ? `${infantCount} infant${infantCount > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const header = (
    <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
      <Container>
        <nav aria-label="Breadcrumb" className="mb-3 text-[0.85rem] font-medium text-white/70">
          <Link href="/" className="hover:text-white">Home</Link> / <span className="text-white">Flights</span>
        </nav>
        <h1 className="h-md text-white">Search flights</h1>
        {toA && fromA && (
          <p className="mt-2 text-white/80">
            {fromA.city} ({fromA.code}) → {toA.city} ({toA.code}) · {paxSummary} · {cabin} · {trip === "round" ? "Round-trip" : "One-way"}
            {directOnly ? " · Non-stop" : ""}
          </p>
        )}
      </Container>
      <div className="mt-6">
        <SearchBar overlap={false} initial={initial} />
      </div>
    </section>
  );

  // No destination yet → prompt.
  if (!toA) {
    return (
      <>
        {header}
        <section className="py-20">
          <Container>
            <div className="mx-auto max-w-md rounded-brand-lg border border-line bg-white p-10 text-center shadow-brand-sm">
              <Search className="mx-auto mb-4 text-red" aria-hidden />
              <h2 className="h-sm mb-2">Where would you like to fly?</h2>
              <p className="text-muted">
                Enter a destination above to see live fares from {fromA?.city ?? "Ahmedabad"}.
              </p>
            </div>
          </Container>
        </section>
      </>
    );
  }

  const from = fromA?.code || "AMD";
  const to = toA.code;
  const departISO = sp.depart || defaultDates().departISO;
  let returnISO: string | undefined;
  if (trip === "round") {
    returnISO =
      sp.return ||
      (() => {
        const d = new Date(departISO);
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })();
  }

  const res = await searchFlights({
    from,
    to,
    departISO,
    returnISO,
    adults,
    children: childCount,
    infants: infantCount,
    cabin,
    directOnly,
    preferredAirlines,
  });

  // Sort (URL-driven; TBO returns cheapest-first, which stays the default).
  const sort = sp.sort === "dur" || sp.sort === "dep" ? sp.sort : "price";
  const bySort = (list: FlightOffer[]) =>
    sort === "dur"
      ? [...list].sort((a, b) => a.durationMin - b.durationMin || a.fareINR - b.fareINR)
      : sort === "dep"
        ? [...list].sort((a, b) => (a.segments[0]?.depTime || "").localeCompare(b.segments[0]?.depTime || "") || a.fareINR - b.fareINR)
        : list;
  const sortHref = (s: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
    if (s === "price") p.delete("sort");
    else p.set("sort", s);
    return `/flights?${p.toString()}`;
  };
  const sortChip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors ${
      active ? "border-red bg-red/10 text-red" : "border-line text-ink hover:border-red/50"
    }`;

  const outbound = bySort(res.outbound).slice(0, 20);
  const inbound = res.inbound ? bySort(res.inbound).slice(0, 20) : undefined;

  // Everything the checkout needs to price + issue the ticket with TBO. Both the
  // TraceId and its timestamp must be present — the 15-minute expiry is measured off it.
  const bookingCtx =
    res.traceId && res.searchedAt
      ? {
          traceId: res.traceId,
          searchedAt: res.searchedAt,
          departISO,
          adults,
          children: childCount,
          infants: infantCount,
          isInternational: fromA?.country !== "IN" || toA.country !== "IN",
        }
      : undefined;
  const noResults = !res.ok && /no result|not found|no flight|no fare/i.test(res.error || "");
  const hasFilters = directOnly || cabin !== "Economy" || Boolean(preferredAirlines);

  return (
    <>
      {header}
      <section className="py-12 sm:py-16">
        <Container>
          {!res.ok ? (
            <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
              <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
              <h2 className="h-sm mb-2">
                {noResults ? "No flights match your search" : "Live fares are unavailable right now"}
              </h2>
              <p className="mb-6 text-muted">
                {noResults ? (
                  <>
                    We couldn&apos;t find {cabin} {directOnly ? "non-stop " : ""}flights for{" "}
                    {fromA?.city} → {toA.city} on these dates.
                    {hasFilters
                      ? " Try a different cabin, remove the non-stop filter, or change your dates —"
                      : " Try different dates —"}{" "}
                    or send us the trip and we&apos;ll price it by hand.
                  </>
                ) : (
                  <>
                    We couldn&apos;t reach the flight system for {fromA?.city} → {toA.city} just now.
                    Send us the trip and our team will get you the best fare by hand.
                  </>
                )}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button href={`/plan-my-trip?destination=${encodeURIComponent(toA.city)}&journey=${to.length === 3 && fromA?.country === "IN" && toA.country === "IN" ? "Domestic" : "International"}`} arrow>
                  Enquire for This Route
                </Button>
                <Button href={site.phone.whatsappHref} variant="light">
                  WhatsApp Us
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-1.5">
                <span className="mr-1 text-[0.75rem] font-bold uppercase tracking-wide text-muted">Sort</span>
                <Link href={sortHref("price")} className={sortChip(sort === "price")}>Cheapest</Link>
                <Link href={sortHref("dur")} className={sortChip(sort === "dur")}>Fastest</Link>
                <Link href={sortHref("dep")} className={sortChip(sort === "dep")}>Departure</Link>
              </div>

              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[1.15rem] font-bold text-ink">
                  {outbound.length} flight{outbound.length > 1 ? "s" : ""}{" "}
                  {trip === "round" ? "(outbound)" : ""} · {fromA?.city} → {toA.city}
                </h2>
                {res.cheapestINR != null && (
                  <span className="text-[0.9rem] text-muted">
                    from{" "}
                    <b className="text-navy">
                      ₹{inr.format(res.cheapestINR)}
                    </b>{" "}
                    {trip === "round" ? "round-trip / adult" : "/ adult"}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {outbound.map((o) => (
                  <FlightCard key={o.id} offer={o} enquireHref={waHref(o, adults)} booking={bookingCtx} />
                ))}
              </div>

              {trip === "round" && inbound && inbound.length > 0 && (
                <>
                  <h2 className="mb-6 mt-12 text-[1.15rem] font-bold text-ink">
                    Return · {toA.city} → {fromA?.city}
                  </h2>
                  <div className="space-y-4">
                    {inbound.map((o) => (
                      <FlightCard
                        key={o.id}
                        offer={o}
                        enquireHref={waHref(o, adults)}
                        booking={
                          bookingCtx && returnISO
                            ? { ...bookingCtx, departISO: returnISO }
                            : bookingCtx
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-[0.82rem] text-muted">
                    Fares are shown per direction. Your round-trip total combines the
                    outbound and return you choose.
                  </p>
                </>
              )}

              <p className="mt-8 text-center text-[0.82rem] text-muted">
                Live fares via our booking system · prices are confirmed at the time of
                booking. Tap <b>Book</b> to confirm availability with our team.
              </p>
            </>
          )}
        </Container>
      </section>
    </>
  );
}
