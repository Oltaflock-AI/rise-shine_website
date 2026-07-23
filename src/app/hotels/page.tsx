import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, TriangleAlert } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/sections/SearchBar";
import { HotelCard } from "@/components/ui/HotelCard";
import { searchHotels } from "@/lib/tbo-hotel";
import { hotelCodesByCity, hotelInfoBatch } from "@/lib/tbo-hotel-static";
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

  // ── filters & sort (URL-driven, server-rendered) ──
  // Meal + refundable pass through to TBO's Search Filters (verified: MealType
  // genuinely narrows results; Refundable picks refundable rooms). Stars and
  // sorting are OURS — TBO ignores its documented StarRating filter.
  const minStars = [3, 4, 5].includes(Number(sp.stars)) ? Number(sp.stars) : 0;
  const refundableOnly = sp.refundable === "1";
  const meal = sp.meal === "WithMeal" || sp.meal === "RoomOnly" ? sp.meal : undefined;
  const sort = sp.sort === "price-desc" || sp.sort === "stars" ? sp.sort : "price";

  /** Current search URL with some params changed (empty string removes one). */
  const qs = (overrides: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/hotels?${p.toString()}`;
  };

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
        refundableOnly,
        mealType: meal,
      })
    : { ok: false as const, source: "unavailable" as const, checkInISO: sp.checkIn, checkOutISO: sp.checkOut, offers: [], error: "no-hotel-codes" };

  // Photos + authoritative star ratings for the returned hotels — one batched,
  // cached static call. Cosmetic: failure just means no images on cards.
  const infoMap = res.ok && res.offers.length
    ? await hotelInfoBatch(res.offers.map((o) => o.hotelCode))
    : new Map<string, never>();

  // Stars filter + sort are applied here, after TBO's own meal/refundable pass.
  const starsOf = (code: string) =>
    infoMap.get(code)?.rating ||
    ({ onestar: 1, twostar: 2, threestar: 3, fourstar: 4, fivestar: 5 }[
      (stubByCode.get(code)?.rating ?? "").toLowerCase().replace(/[^a-z]/g, "")
    ] ?? 0);
  let offers = res.ok ? res.offers.filter((o) => !minStars || starsOf(o.hotelCode) >= minStars) : [];
  if (sort === "price-desc") offers = [...offers].sort((a, b) => b.cheapestFare - a.cheapestFare);
  else if (sort === "stars") offers = [...offers].sort((a, b) => starsOf(b.hotelCode) - starsOf(a.hotelCode) || a.cheapestFare - b.cheapestFare);

  const occupancyQS = [
    `checkIn=${sp.checkIn}`,
    `checkOut=${sp.checkOut}`,
    `rooms=${rooms}`,
    `adults=${adultsPerRoom}`,
    ...(childAges.length ? [`children=${childAges.length}`, `ages=${childAges.join(",")}`] : []),
    `city=${encodeURIComponent(city.cityCode)}`,
  ].join("&");

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors ${
      active ? "border-red bg-red/10 text-red" : "border-line text-ink hover:border-red/50"
    }`;

  return (
    <>
      {header}
      <section className="py-12 sm:py-16">
        <Container>
          {!res.ok ? (
            <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
              <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
              <h2 className="h-sm mb-2">Live rates are unavailable right now</h2>
              <p className="mb-6 text-muted">
                We couldn&apos;t reach the hotel system for {city.label} just now. Send us your
                stay and our team will get you the best rate.
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
              {/* filter / sort rail */}
              <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="mr-1 text-[0.75rem] font-bold uppercase tracking-wide text-muted">Stars</span>
                  {[0, 3, 4, 5].map((s) => (
                    <Link key={s} href={qs({ stars: s ? String(s) : "" })} className={chip(minStars === s)}>
                      {s === 0 ? "Any" : `${s}★+`}
                    </Link>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Link href={qs({ refundable: refundableOnly ? "" : "1" })} className={chip(refundableOnly)}>
                    Free cancellation
                  </Link>
                  <Link href={qs({ meal: meal === "WithMeal" ? "" : "WithMeal" })} className={chip(meal === "WithMeal")}>
                    With breakfast
                  </Link>
                  <Link href={qs({ meal: meal === "RoomOnly" ? "" : "RoomOnly" })} className={chip(meal === "RoomOnly")}>
                    Room only
                  </Link>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="mr-1 text-[0.75rem] font-bold uppercase tracking-wide text-muted">Sort</span>
                  <Link href={qs({ sort: "" })} className={chip(sort === "price")}>
                    Price ↑
                  </Link>
                  <Link href={qs({ sort: "price-desc" })} className={chip(sort === "price-desc")}>
                    Price ↓
                  </Link>
                  <Link href={qs({ sort: "stars" })} className={chip(sort === "stars")}>
                    Stars
                  </Link>
                </div>
              </div>

              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[1.15rem] font-bold text-ink">
                  {offers.length} hotel{offers.length !== 1 ? "s" : ""} · {city.label}
                </h2>
                <span className="text-[0.9rem] text-muted">
                  {formatDate(sp.checkIn)} → {formatDate(sp.checkOut)} · {nights} night{nights > 1 ? "s" : ""}
                </span>
              </div>

              {!offers.length ? (
                <div className="mx-auto max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
                  <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
                  <h2 className="h-sm mb-2">No hotels match</h2>
                  <p className="mb-6 text-muted">
                    {minStars || refundableOnly || meal
                      ? "No hotels match these filters for your dates — try relaxing a filter."
                      : `We couldn't find availability in ${city.label} for these dates. Try different dates, or send us your stay and we'll price it by hand.`}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {(minStars || refundableOnly || meal) ? (
                      <Button href={qs({ stars: "", refundable: "", meal: "" })} arrow>
                        Clear filters
                      </Button>
                    ) : (
                      <Button href={`/plan-my-trip?service=Hotel&destination=${encodeURIComponent(city.label)}`} arrow>
                        Enquire for This Stay
                      </Button>
                    )}
                    <Button href={site.phone.whatsappHref} variant="light">
                      WhatsApp Us
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {offers.map((o) => (
                    <HotelCard
                      key={o.hotelCode}
                      offer={o}
                      stub={{ ...stubByCode.get(o.hotelCode), rating: String(starsOf(o.hotelCode) || "") }}
                      nights={nights}
                      checkIn={sp.checkIn!}
                      checkOut={sp.checkOut!}
                      rooms={rooms}
                      adults={adultsPerRoom}
                      childAges={childAges}
                      cityLabel={city.label}
                      image={infoMap.get(o.hotelCode)?.images?.[0]}
                      detailHref={`/hotels/${o.hotelCode}?${occupancyQS}`}
                    />
                  ))}
                </div>
              )}

              <p className="mt-8 text-center text-[0.82rem] text-muted">
                Live rates via our booking system · prices are confirmed at the time of
                booking. Tap a hotel to see all room options.
              </p>
            </>
          )}
        </Container>
      </section>
    </>
  );
}
