import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, TriangleAlert } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/sections/SearchBar";
import { HotelCard } from "@/components/ui/HotelCard";
import { searchHotels } from "@/lib/tbo-hotel";
import { hotelCodesByCity } from "@/lib/tbo-hotel-static";
import { POPULAR_CITIES } from "@/data/hotel-cities";
import { resolveCity } from "@/lib/hotel-city-search";
import { site } from "@/data/site";
import { formatDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hotel Search",
  description: "Search live hotel availability and rates with Rise & Shine Travels.",
  robots: { index: false },
};

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export default async function HotelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const city = resolveCity(sp.city);
  const rooms = Math.min(6, Math.max(1, parseInt(sp.rooms || "1", 10) || 1));
  const adultsPerRoom = Math.min(8, Math.max(1, parseInt(sp.adults || "2", 10) || 2));
  // Children per room + their ages (uniform per room, ages comma-joined in the URL).
  const childrenPerRoom = Math.min(4, Math.max(0, parseInt(sp.children || "0", 10) || 0));
  const childAges = (sp.ages || "")
    .split(",")
    .map((a) => parseInt(a, 10))
    .filter((a) => Number.isFinite(a) && a >= 1 && a <= 17)
    .slice(0, childrenPerRoom);
  const guestsPerRoom = adultsPerRoom + childAges.length;

  const header = (
    <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
      <Container>
        <nav aria-label="Breadcrumb" className="mb-3 text-[0.85rem] font-medium text-white/70">
          <Link href="/" className="hover:text-white">Home</Link> / <span className="text-white">Hotels</span>
        </nav>
        <h1 className="h-md text-white">Search hotels</h1>
        {city && (
          <p className="mt-2 text-white/80">
            {city.label} · {rooms} room{rooms > 1 ? "s" : ""} · {guestsPerRoom} guest{guestsPerRoom > 1 ? "s" : ""} / room
            {childAges.length > 0 ? ` (${adultsPerRoom} adult${adultsPerRoom > 1 ? "s" : ""} + ${childAges.length} child${childAges.length > 1 ? "ren" : ""})` : ""}
          </p>
        )}
      </Container>
      <div className="mt-6">
        <SearchBar overlap={false} initial={{ product: "hotels" }} />
      </div>
    </section>
  );

  // No / unknown destination → prompt with the enabled cities.
  if (!city || !sp.checkIn || !sp.checkOut) {
    return (
      <>
        {header}
        <section className="py-20">
          <Container>
            <div className="mx-auto max-w-md rounded-brand-lg border border-line bg-white p-10 text-center shadow-brand-sm">
              <BedDouble className="mx-auto mb-4 text-red" aria-hidden />
              <h2 className="h-sm mb-2">Where would you like to stay?</h2>
              <p className="mb-6 text-muted">
                Pick a destination and dates above to see live rates.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {POPULAR_CITIES.map((c) => (
                  <Link
                    key={c.cityCode}
                    href={`/hotels?city=${c.cityCode}`}
                    className="rounded-full border border-line px-4 py-1.5 text-[0.85rem] font-semibold text-ink hover:border-red hover:text-red"
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          </Container>
        </section>
      </>
    );
  }

  const nights = nightsBetween(sp.checkIn, sp.checkOut);

  // Resolve this city's hotels (static data), price the first 100 (TBO's ceiling),
  // then join the priced offers back to their names/ratings for display.
  let stubs: Awaited<ReturnType<typeof hotelCodesByCity>> = [];
  try {
    stubs = await hotelCodesByCity(city.cityCode);
  } catch {
    /* fall through to the unavailable state below */
  }
  const stubByCode = new Map(stubs.map((s) => [s.code, s]));
  const codes = stubs.slice(0, 100).map((s) => s.code);

  const res = codes.length
    ? await searchHotels({
        checkInISO: sp.checkIn,
        checkOutISO: sp.checkOut,
        hotelCodes: codes,
        nationality: "IN",
        rooms: Array.from({ length: rooms }, () => ({
          adults: adultsPerRoom,
          childrenAges: childAges.length ? childAges : undefined,
        })),
      })
    : { ok: false as const, source: "unavailable" as const, checkInISO: sp.checkIn, checkOutISO: sp.checkOut, offers: [], error: "no-hotel-codes" };

  return (
    <>
      {header}
      <section className="py-12 sm:py-16">
        <Container>
          {!res.ok || !res.offers.length ? (
            <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
              <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
              <h2 className="h-sm mb-2">
                {res.ok ? "No hotels match your dates" : "Live rates are unavailable right now"}
              </h2>
              <p className="mb-6 text-muted">
                {res.ok
                  ? `We couldn't find availability in ${city.label} for these dates. Try different dates, or send us your stay and we'll price it by hand.`
                  : `We couldn't reach the hotel system for ${city.label} just now. Send us your stay and our team will get you the best rate.`}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button href={`/plan-my-trip?service=Hotel&destination=${encodeURIComponent(city.label)}`} arrow>
                  Enquire for This Stay
                </Button>
                <Button href={site.phone.whatsappHref} variant="light">
                  WhatsApp Us
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[1.15rem] font-bold text-ink">
                  {res.offers.length} hotel{res.offers.length > 1 ? "s" : ""} · {city.label}
                </h2>
                <span className="text-[0.9rem] text-muted">
                  {formatDate(sp.checkIn)} → {formatDate(sp.checkOut)} · {nights} night{nights > 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-4">
                {res.offers.map((o) => (
                  <HotelCard
                    key={o.hotelCode}
                    offer={o}
                    stub={stubByCode.get(o.hotelCode)}
                    nights={nights}
                    checkIn={sp.checkIn!}
                    checkOut={sp.checkOut!}
                    rooms={rooms}
                    adults={adultsPerRoom}
                    childAges={childAges}
                    cityLabel={city.label}
                  />
                ))}
              </div>

              <p className="mt-8 text-center text-[0.82rem] text-muted">
                Live rates via our booking system · prices are confirmed at the time of
                booking. Tap <b>Book</b> to confirm availability with our team.
              </p>
            </>
          )}
        </Container>
      </section>
    </>
  );
}
