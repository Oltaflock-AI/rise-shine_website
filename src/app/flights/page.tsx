import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Search, TriangleAlert } from "lucide-react";
import { FlightResultsFallback } from "@/components/ui/SearchFallbacks";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/sections/SearchBar";
import { FlightResultsClient } from "@/components/ui/FlightResultsClient";
import { searchFlights, defaultDates } from "@/lib/tbo";
import { resolveAirport } from "@/data/airports";
import { site } from "@/data/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flight Search",
  description:
    "Search real-time flight fares from Ahmedabad and across India with Rise & Shine Travels.",
  robots: { index: false },
};

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

  // Re-suspend (show the searching fallback) whenever the search itself changes.
  // Sorting and result filters are client-side now — they never re-trigger this.
  const searchKey = [
    from, to, departISO, returnISO ?? "", adults, childCount, infantCount,
    cabin, directOnly ? 1 : 0, sp.airline ?? "",
  ].join("|");

  return (
    <>
      {header}
      <section className="py-12 sm:py-16">
        <Container>
          <Suspense key={searchKey} fallback={<FlightResultsFallback />}>
            <FlightResults
              sp={sp}
              from={from}
              to={to}
              departISO={departISO}
              returnISO={returnISO}
              adults={adults}
              childCount={childCount}
              infantCount={infantCount}
              cabin={cabin}
              directOnly={directOnly}
              preferredAirlines={preferredAirlines}
              trip={trip}
              fromCity={fromA?.city}
              fromCountry={fromA?.country}
              toCity={toA.city}
              toCountry={toA.country}
            />
          </Suspense>
        </Container>
      </section>
    </>
  );
}

/**
 * The slow half of the page: the live TBO search + results. Rendering it behind
 * a keyed Suspense boundary lets the header + search bar paint instantly while
 * this streams in — the user sees the branded searching state, not a dead page.
 */
async function FlightResults({
  sp,
  from,
  to,
  departISO,
  returnISO,
  adults,
  childCount,
  infantCount,
  cabin,
  directOnly,
  preferredAirlines,
  trip,
  fromCity,
  fromCountry,
  toCity,
  toCountry,
}: {
  sp: Record<string, string | undefined>;
  from: string;
  to: string;
  departISO: string;
  returnISO?: string;
  adults: number;
  childCount: number;
  infantCount: number;
  cabin: string;
  directOnly: boolean;
  preferredAirlines?: string[];
  trip: "oneway" | "round";
  fromCity?: string;
  fromCountry?: string;
  toCity: string;
  toCountry?: string;
}) {
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
          isInternational: fromCountry !== "IN" || toCountry !== "IN",
        }
      : undefined;
  const noResults = !res.ok && /no result|not found|no flight|no fare/i.test(res.error || "");
  const hasFilters = directOnly || cabin !== "Economy" || Boolean(preferredAirlines);

  return (
    <>
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
                    {fromCity} → {toCity} on these dates.
                    {hasFilters
                      ? " Try a different cabin, remove the non-stop filter, or change your dates —"
                      : " Try different dates —"}{" "}
                    or send us the trip and we&apos;ll price it by hand.
                  </>
                ) : (
                  <>
                    We couldn&apos;t reach the flight system for {fromCity} → {toCity} just now.
                    Send us the trip and our team will get you the best fare by hand.
                  </>
                )}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button href={`/plan-my-trip?destination=${encodeURIComponent(toCity)}&journey=${to.length === 3 && fromCountry === "IN" && toCountry === "IN" ? "Domestic" : "International"}`} arrow>
                  Enquire for This Route
                </Button>
                <Button href={site.phone.whatsappHref} variant="light">
                  WhatsApp Us
                </Button>
              </div>
            </div>
          ) : (
            <FlightResultsClient
              outbound={res.outbound}
              inbound={res.inbound}
              adults={adults}
              trip={trip}
              fromCity={fromCity}
              toCity={toCity}
              booking={bookingCtx}
              returnISO={returnISO}
              initialSort={sp.sort}
            />
          )}
    </>
  );
}
