"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { HotelCard, type HotelStub } from "./HotelCard";
import type { HotelOffer } from "@/lib/tbo-hotel";
import { cn } from "@/lib/cn";

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

const SORT_TABS: { key: SortKey; label: string; hint?: string }[] = [
  { key: "reco", label: "Recommended", hint: "Our best balance of price and star class" },
  { key: "reviews", label: "Top reviews", hint: "Highest Google review scores first" },
  { key: "price", label: "Lowest price" },
  { key: "price-desc", label: "Highest price" },
  { key: "stars", label: "Most stars" },
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
}) {
  const [sort, setSort] = useState<SortKey>(
    initialSort === "price-desc" || initialSort === "stars" || initialSort === "price"
      ? initialSort
      : "reco",
  );

  const sorted = useMemo(() => bySort(items, sort), [items, sort]);
  // Hide the reviews tab entirely when no hotel got a Google score (key missing).
  const anyReviews = useMemo(() => items.some((i) => i.review), [items]);
  const tabs = anyReviews ? SORT_TABS : SORT_TABS.filter((t) => t.key !== "reviews");

  return (
    <>
      <div className="mb-6 overflow-x-auto rounded-brand-lg border border-line bg-white shadow-brand-sm">
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
                    <Info
                      size={14}
                      className={active ? "text-red" : "text-muted"}
                      aria-hidden
                    />
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

      <div className="space-y-4">
        {sorted.map((i) => (
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
    </>
  );
}
