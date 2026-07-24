"use client";

import { useMemo, useState } from "react";
import { Info, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { HotelCard, type HotelStub } from "./HotelCard";
import { CheckRow, DualRange, Section } from "./filter-controls";
import type { HotelOffer } from "@/lib/tbo-hotel";
import { cn } from "@/lib/cn";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

type SortKey = "reco" | "reviews" | "price" | "price-desc" | "stars";

export type HotelItem = {
  offer: HotelOffer;
  stub: HotelStub;
  stars: number;
  /** Google review score for this property (absent when the lookup missed). */
  review?: { rating: number; count: number };
  image?: string;
  detailHref: string;
};

const DISPLAY_CAP = 25;

const SORT_TABS: { key: SortKey; label: string; hint?: string }[] = [
  { key: "reco", label: "Recommended", hint: "Our best balance of price and star class" },
  { key: "reviews", label: "Top reviews", hint: "Highest Google review scores first" },
  { key: "price", label: "Lowest price" },
  { key: "price-desc", label: "Highest price" },
  { key: "stars", label: "Most stars" },
];

/** 5/4/3 star classes; everything below (incl. unrated) buckets to 0. */
const starBucket = (stars: number): 5 | 4 | 3 | 0 =>
  stars >= 5 ? 5 : stars === 4 ? 4 : stars === 3 ? 3 : 0;

const STAR_OPTIONS: { bucket: 5 | 4 | 3 | 0; label: string }[] = [
  { bucket: 5, label: "5 star" },
  { bucket: 4, label: "4 star" },
  { bucket: 3, label: "3 star" },
  { bucket: 0, label: "2 star & below" },
];

/** Sort the hotel list. "reco" blends price (55%) and star class (45%). */
function bySort(list: HotelItem[], key: SortKey): HotelItem[] {
  if (list.length < 2) return list;
  if (key === "price")
    return [...list].sort((a, b) => a.offer.cheapestFare - b.offer.cheapestFare);
  if (key === "price-desc")
    return [...list].sort((a, b) => b.offer.cheapestFare - a.offer.cheapestFare);
  if (key === "stars")
    return [...list].sort(
      (a, b) => b.stars - a.stars || a.offer.cheapestFare - b.offer.cheapestFare,
    );
  if (key === "reviews")
    // Rating first, review volume as the tiebreak; unrated hotels sink to the end.
    return [...list].sort(
      (a, b) =>
        (b.review?.rating ?? 0) - (a.review?.rating ?? 0) ||
        (b.review?.count ?? 0) - (a.review?.count ?? 0) ||
        a.offer.cheapestFare - b.offer.cheapestFare,
    );
  const fares = list.map((i) => i.offer.cheapestFare);
  const fLo = Math.min(...fares);
  const fHi = Math.max(...fares);
  const norm = (v: number) => (fHi > fLo ? (v - fLo) / (fHi - fLo) : 0);
  const score = (i: HotelItem) => norm(i.offer.cheapestFare) * 0.55 + (1 - i.stars / 5) * 0.45;
  return [...list].sort(
    (a, b) => score(a) - score(b) || a.offer.cheapestFare - b.offer.cheapestFare,
  );
}

export function HotelResultsClient({
  items,
  nights,
  checkIn,
  checkOut,
  rooms,
  adults,
  childAges,
  cityLabel,
  initialSort,
  initialMinStars,
}: {
  items: HotelItem[];
  nights: number;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  childAges: number[];
  cityLabel: string;
  initialSort?: string;
  /** Legacy ?stars=N URLs → pre-check those star classes. */
  initialMinStars?: number;
}) {
  const [sort, setSort] = useState<SortKey>(
    initialSort === "price-desc" || initialSort === "stars" || initialSort === "price"
      ? initialSort
      : "reco",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Filter domain from the raw result set.
  const domain = useMemo(() => {
    const starMin: Partial<Record<5 | 4 | 3 | 0, number>> = {};
    let fLo = Infinity;
    let fHi = 0;
    for (const i of items) {
      const b = starBucket(i.stars);
      starMin[b] = Math.min(starMin[b] ?? Infinity, i.offer.cheapestFare);
      fLo = Math.min(fLo, i.offer.cheapestFare);
      fHi = Math.max(fHi, i.offer.cheapestFare);
    }
    return {
      starMin,
      fareLo: items.length ? Math.floor(fLo / 500) * 500 : 0,
      fareHi: items.length ? Math.ceil(fHi / 500) * 500 : 0,
      anyReviews: items.some((i) => i.review),
    };
  }, [items]);

  const allStars = () =>
    new Set<number>(STAR_OPTIONS.filter((s) => domain.starMin[s.bucket] != null).map((s) => s.bucket));
  const [nameQ, setNameQ] = useState("");
  const [starsSel, setStarsSel] = useState<Set<number>>(() => {
    if (initialMinStars && [3, 4, 5].includes(initialMinStars)) {
      return new Set([5, 4, 3].filter((b) => b >= initialMinStars));
    }
    return allStars();
  });
  const [price, setPrice] = useState<[number, number]>([domain.fareLo, domain.fareHi]);
  const [ratingMin, setRatingMin] = useState<0 | 4 | 4.5>(0);

  const starCount = allStars().size;
  const filtersActive =
    nameQ.trim().length > 0 ||
    starsSel.size < starCount ||
    price[0] > domain.fareLo ||
    price[1] < domain.fareHi ||
    ratingMin > 0;

  const resetAll = () => {
    setNameQ("");
    setStarsSel(allStars());
    setPrice([domain.fareLo, domain.fareHi]);
    setRatingMin(0);
  };

  const sorted = useMemo(() => {
    const q = nameQ.trim().toLowerCase();
    const pass = (i: HotelItem) => {
      if (q && !(i.stub.name ?? "").toLowerCase().includes(q)) return false;
      if (!starsSel.has(starBucket(i.stars))) return false;
      if (i.offer.cheapestFare < price[0] || i.offer.cheapestFare > price[1]) return false;
      if (ratingMin > 0 && (i.review?.rating ?? 0) < ratingMin) return false;
      return true;
    };
    return bySort(items.filter(pass), sort);
  }, [items, sort, nameQ, starsSel, price, ratingMin]);

  const tabs = domain.anyReviews ? SORT_TABS : SORT_TABS.filter((t) => t.key !== "reviews");

  const filtersPanel = (
    <div
      className={cn(
        "rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm",
        filtersOpen ? "block" : "hidden",
        "lg:block",
      )}
    >
      <div className="flex items-center justify-between pb-1">
        <h2 className="text-[1.05rem] font-bold text-ink">Filters</h2>
        {filtersActive && (
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1 text-[0.8rem] font-semibold text-red hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset all
          </button>
        )}
      </div>

      <Section title="Hotel name">
        <label className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2.5 focus-within:border-red/60">
          <Search className="h-4 w-4 flex-none text-muted" aria-hidden />
          <input
            value={nameQ}
            onChange={(e) => setNameQ(e.target.value)}
            placeholder="Search hotel name"
            aria-label="Filter by hotel name"
            className="w-full bg-transparent text-[0.9rem] font-medium text-ink outline-none placeholder:text-muted/70"
          />
        </label>
      </Section>

      {domain.fareHi > domain.fareLo && (
        <Section title={`Price (${nights} night${nights > 1 ? "s" : ""}, per room)`}>
          <DualRange
            min={domain.fareLo}
            max={domain.fareHi}
            step={500}
            value={price}
            onChange={setPrice}
            format={(v) => `₹${inr.format(v)}`}
            ariaLabel="Total price"
          />
        </Section>
      )}

      <Section title="Star class">
        {STAR_OPTIONS.filter((s) => domain.starMin[s.bucket] != null).map((s) => (
          <CheckRow
            key={s.bucket}
            checked={starsSel.has(s.bucket)}
            onChange={(on) =>
              setStarsSel((prev) => {
                const next = new Set(prev);
                if (on) next.add(s.bucket);
                else next.delete(s.bucket);
                return next;
              })
            }
            label={s.label}
            fromINR={domain.starMin[s.bucket]}
          />
        ))}
      </Section>

      {domain.anyReviews && (
        <Section title="Guest rating">
          {([
            [0, "Any"],
            [4, "4.0+ Very good"],
            [4.5, "4.5+ Excellent"],
          ] as const).map(([v, label]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2.5 py-1.5">
              <input
                type="radio"
                name="hotel-rating-min"
                checked={ratingMin === v}
                onChange={() => setRatingMin(v)}
                className="h-4 w-4 cursor-pointer accent-red"
              />
              <span className="text-[0.9rem] font-medium text-ink">{label}</span>
            </label>
          ))}
        </Section>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="lg:w-72 lg:flex-none">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={cn(
            "mb-4 flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-[0.85rem] font-semibold lg:hidden",
            filtersActive ? "border-red bg-red/10 text-red" : "border-line text-ink",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {filtersOpen ? "Hide filters" : "Filters"}
          {filtersActive && !filtersOpen ? " · on" : ""}
        </button>
        {filtersPanel}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 overflow-x-auto rounded-brand-lg border border-line bg-white shadow-brand-sm">
          <div className="flex min-w-max" role="tablist" aria-label="Sort hotels">
            {tabs.map((t) => {
              const active = sort === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={t.hint}
                  onClick={() => setSort(t.key)}
                  className={cn(
                    "relative whitespace-nowrap px-5 py-3.5 text-[0.95rem] font-semibold transition-colors sm:px-6",
                    active ? "text-red" : "text-ink hover:text-red/80",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {t.label}
                    {t.hint && (
                      <Info size={14} className={active ? "text-red" : "text-muted"} aria-hidden />
                    )}
                  </span>
                  {active && (
                    <span
                      className="absolute inset-x-4 bottom-0 h-[3px] rounded-t-full bg-red"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {filtersActive && (
          <p className="mb-4 text-[0.88rem] text-muted">
            Showing <b className="text-ink">{sorted.length}</b> of {items.length} hotels
          </p>
        )}

        {sorted.length === 0 ? (
          <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
            <h3 className="h-sm mb-2">No hotels match these filters</h3>
            <p className="mb-5 text-muted">
              Loosen a filter or reset them all to see every result again.
            </p>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-full bg-red px-5 py-2.5 text-[0.9rem] font-semibold text-white transition-colors hover:bg-red-mid"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {(showAll ? sorted : sorted.slice(0, DISPLAY_CAP)).map((i) => (
                <HotelCard
                  key={i.offer.hotelCode}
                  offer={i.offer}
                  stub={i.stub}
                  nights={nights}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  rooms={rooms}
                  adults={adults}
                  childAges={childAges}
                  cityLabel={cityLabel}
                  review={i.review}
                  image={i.image}
                  detailHref={i.detailHref}
                />
              ))}
            </div>
            {sorted.length > DISPLAY_CAP && !showAll && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-6 w-full rounded-full border border-line py-3 text-[0.9rem] font-semibold text-ink transition-colors hover:border-red/50"
              >
                Show all {sorted.length} hotels
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
