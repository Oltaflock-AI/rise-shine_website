"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { HotelCard, type HotelStub } from "./HotelCard";
import { CheckRow, DualRange, Section } from "./filter-controls";
import type { HotelOffer } from "@/lib/tbo-hotel";
import type { Amenity } from "@/lib/hotel-amenities";
import {
  pageCount,
  pageSlice,
  pageWindow,
  starBucket,
  STAR_BUCKET_LABEL,
  type StarBucket,
} from "@/lib/hotel-display";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

type SortKey = "reco" | "reviews" | "price" | "price-desc" | "stars";

export type HotelItem = {
  offer: HotelOffer;
  stub: HotelStub;
  stars: number;
  /** Google review score for this property (absent when the lookup missed). */
  review?: { rating: number; count: number };
  image?: string;
  /** A few curated facilities for the card (absent when content failed). */
  amenities?: Amenity[];
  /** Nearest landmark (TBO Attractions) — replaces the postal address. */
  landmark?: string;
  /** Hotel charges a mandatory fee on arrival (TBO HotelFees.Mandatory). */
  payAtHotel?: boolean;
  detailHref: string;
};

/** Hotels per page. A city can return 200 offers; one dump of 200 cards is
 *  ~200 image requests and an unusable scrollbar. */
const PER_PAGE = 20;

const SORT_TABS: { key: SortKey; label: string; hint?: string }[] = [
  {
    key: "reco",
    label: "Recommended",
    hint: "Best balance of price and star class",
  },
  { key: "reviews", label: "Top reviews", hint: "Highest Google scores first" },
  { key: "price", label: "Lowest price" },
  { key: "price-desc", label: "Highest price" },
  { key: "stars", label: "Most stars" },
];

const STAR_ORDER: StarBucket[] = [5, 4, 3, 2, 0];

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
  const score = (i: HotelItem) =>
    norm(i.offer.cheapestFare) * 0.55 + (1 - i.stars / 5) * 0.45;
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
  countryCode,
  nationality,
  initialSort,
  initialMinStars,
  rateFilters,
}: {
  items: HotelItem[];
  nights: number;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  childAges: number[];
  cityLabel: string;
  /** Destination country (ISO-2) — carried to checkout to drive PAN rules. */
  countryCode?: string;
  /** Guest nationality searched with — Book must carry the same value. */
  nationality?: string;
  initialSort?: string;
  /** Legacy ?stars=N URLs → pre-check those star classes. */
  initialMinStars?: number;
  /**
   * Rate-type filters TBO itself applies, so they are links that re-run the
   * search rather than client state. They live in this panel anyway: two
   * filter UIs in two places, with two interaction models, is one more than a
   * guest should have to find.
   */
  rateFilters?: { label: string; href: string; active: boolean }[];
}) {
  const [sort, setSort] = useState<SortKey>(
    initialSort === "price-desc" ||
      initialSort === "stars" ||
      initialSort === "price"
      ? initialSort
      : "reco",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The sheet scrolls; the list behind it must not. Without this a flick that
  // runs past the end of the sheet keeps going and the results move under it.
  useEffect(() => {
    if (!filtersOpen) return;
    const mobile = window.matchMedia("(max-width: 1023px)");
    if (!mobile.matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  // Filter domain from the raw result set.
  const domain = useMemo(() => {
    const starMin: Partial<Record<StarBucket, number>> = {};
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
    new Set<number>(
      STAR_ORDER.filter((b) => domain.starMin[b] != null),
    );
  const [nameQ, setNameQ] = useState("");
  const [starsSel, setStarsSel] = useState<Set<number>>(() => {
    if (initialMinStars && [3, 4, 5].includes(initialMinStars)) {
      // A legacy ?stars=4 URL means "4 star and up" — it never meant to hide
      // the properties TBO simply has no rating for, so keep those checked.
      return new Set([...[5, 4, 3].filter((b) => b >= initialMinStars), 0]);
    }
    return allStars();
  });
  const [price, setPrice] = useState<[number, number]>([
    domain.fareLo,
    domain.fareHi,
  ]);
  const [ratingMin, setRatingMin] = useState<0 | 4 | 4.5>(0);
  const [page, setPage] = useState(1);
  const listTop = useRef<HTMLDivElement>(null);

  const starCount = allStars().size;
  // Split deliberately: "Reset all" can only clear the client-side filters, so
  // it must not appear on the strength of a rate filter it cannot undo. The
  // mobile badge, which just says "something is narrowing this list", counts
  // both.
  const clientFiltersActive =
    nameQ.trim().length > 0 ||
    starsSel.size < starCount ||
    price[0] > domain.fareLo ||
    price[1] < domain.fareHi ||
    ratingMin > 0;
  const anyFiltersActive =
    clientFiltersActive || Boolean(rateFilters?.some((f) => f.active));

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
      if (i.offer.cheapestFare < price[0] || i.offer.cheapestFare > price[1])
        return false;
      if (ratingMin > 0 && (i.review?.rating ?? 0) < ratingMin) return false;
      return true;
    };
    return bySort(items.filter(pass), sort);
  }, [items, sort, nameQ, starsSel, price, ratingMin]);

  // Any change to what is being listed puts the guest back at result 1 —
  // otherwise a narrowed filter leaves them on a page that no longer exists.
  // Adjusted during render rather than in an effect: React re-renders before
  // painting, so the guest never sees the stale page flash past.
  const filterKey = `${nameQ}|${[...starsSel].sort().join(",")}|${price[0]}-${price[1]}|${ratingMin}|${sort}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const pages = pageCount(sorted.length, PER_PAGE);
  const shown = pageSlice(sorted, page, PER_PAGE);
  const firstIndex = (Math.min(page, pages) - 1) * PER_PAGE;

  const goto = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tabs = domain.anyReviews
    ? SORT_TABS
    : SORT_TABS.filter((t) => t.key !== "reviews");
  const activeHint = tabs.find((t) => t.key === sort)?.hint;

  /**
   * On a phone this used to expand inline, injecting ~886px between the button
   * that opened it and the results it filters — you tapped "Filters", the list
   * left the screen, and there was no close control anywhere near your thumb.
   * It is a bottom sheet on mobile and the same sidebar panel from lg: up.
   */
  const filtersPanel = (
    <div
      className={cn(
        "border-line bg-white",
        // Mobile: a sheet pinned to the bottom of the viewport, scrollable,
        // never taller than 85% of the screen, clear of the home indicator.
        filtersOpen
          ? "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-brand-lg border-t p-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-brand-lg"
          : "hidden",
        // Desktop: back to a plain card in the sidebar.
        "lg:static lg:z-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-brand-lg lg:border lg:p-5 lg:pb-5 lg:shadow-brand-sm",
      )}
      role={filtersOpen ? "dialog" : undefined}
      aria-modal={filtersOpen ? true : undefined}
      aria-label="Filters"
    >
      <div className="flex items-center justify-between pb-1">
        <h2 className="text-lead font-bold text-ink">Filters</h2>
        {/* The sheet is dismissible three ways — scrim, this, and the CTA —
            because it covers the list it is filtering. */}
        <button
          type="button"
          onClick={() => setFiltersOpen(false)}
          aria-label="Close filters"
          className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-muted hover:text-ink lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        {clientFiltersActive && (
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1 text-meta font-semibold text-red hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset all
          </button>
        )}
      </div>

      {rateFilters && rateFilters.length > 0 && (
        <Section title="Rate type">
          <div className="flex flex-wrap gap-1.5">
            {rateFilters.map((f) => (
              <Link
                key={f.label}
                href={f.href}
                scroll={false}
                aria-pressed={f.active}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-meta font-semibold transition-colors",
                  f.active
                    ? "border-red bg-red/10 text-red"
                    : "border-line text-ink hover:border-red/50",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Hotel name">
        <label className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2.5 focus-within:border-red/60">
          <Search className="h-4 w-4 flex-none text-muted" aria-hidden />
          <input
            value={nameQ}
            onChange={(e) => setNameQ(e.target.value)}
            placeholder="Search hotel name"
            aria-label="Filter by hotel name"
            /* 16px, not text-body's 15px: iOS zooms the page in when a text
               field under 16px takes focus and never zooms back out, so typing
               a hotel name left the results magnified and half off-screen. */
            className="w-full bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted"
          />
        </label>
      </Section>

      {domain.fareHi > domain.fareLo && (
        <Section
          title={`Price (${nights} night${nights > 1 ? "s" : ""}, per room)`}
        >
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
        {STAR_ORDER.filter((b) => domain.starMin[b] != null).map((b) => (
          <CheckRow
            key={b}
            checked={starsSel.has(b)}
            onChange={(on) =>
              setStarsSel((prev) => {
                const next = new Set(prev);
                if (on) next.add(b);
                else next.delete(b);
                return next;
              })
            }
            label={STAR_BUCKET_LABEL[b]}
            fromINR={domain.starMin[b]}
          />
        ))}
      </Section>

      {domain.anyReviews && (
        <Section title="Guest rating">
          {(
            [
              [0, "Any"],
              [4, "4.0+ Very good"],
              [4.5, "4.5+ Excellent"],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2.5 py-1.5"
            >
              <input
                type="radio"
                name="hotel-rating-min"
                checked={ratingMin === v}
                onChange={() => setRatingMin(v)}
                className="h-4 w-4 cursor-pointer accent-red"
              />
              <span className="text-body font-medium text-ink">{label}</span>
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
            "mb-4 flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-body font-semibold lg:hidden",
            anyFiltersActive
              ? "border-red bg-red/10 text-red"
              : "border-line text-ink",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {filtersOpen ? "Hide filters" : "Filters"}
          {anyFiltersActive && !filtersOpen ? " · on" : ""}
        </button>
        {/* The scrim is the other half of the sheet: it dims the list, catches
            the tap that closes it, and stops the page scrolling underneath. */}
        {filtersOpen && (
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-40 bg-navy/40 lg:hidden"
          />
        )}
        {filtersPanel}
        {filtersOpen && (
          <div className="fixed inset-x-0 bottom-0 z-[51] border-t border-line bg-white px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="grad-red flex min-h-11 w-full items-center justify-center rounded-full text-body font-semibold text-white shadow-brand-red"
            >
              Show {sorted.length} hotel{sorted.length === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1" ref={listTop}>
        {/* A radiogroup, not a tablist: these buttons re-order one list, they
            do not switch panels, and the tablist role promised arrow-key
            navigation that was never wired up. */}
        <div className="mb-4 overflow-x-auto rounded-brand-lg border border-line bg-white shadow-brand-sm">
          <div className="flex min-w-max" role="radiogroup" aria-label="Sort hotels">
            {tabs.map((t) => {
              const active = sort === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSort(t.key)}
                  className={cn(
                    "relative whitespace-nowrap px-5 py-3.5 text-body font-semibold transition-colors sm:px-6",
                    active ? "text-red" : "text-ink hover:text-red/80",
                  )}
                >
                  {t.label}
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

        {/* The hint used to live in a title attribute, which a phone never
            shows. Render the active sort's explanation instead. */}
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-meta text-muted">
          <span>
            {sorted.length > 0 && (
              <>
                Showing{" "}
                <b className="text-ink">
                  {firstIndex + 1}–{firstIndex + shown.length}
                </b>{" "}
                of {sorted.length}
                {clientFiltersActive ? ` (filtered from ${items.length})` : ""}{" "}
                hotels
              </>
            )}
          </span>
          {activeHint && <span>{activeHint}</span>}
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
            <h3 className="h-sm mb-2">No hotels match these filters</h3>
            <p className="mb-5 text-muted">
              Loosen a filter or reset them all to see every result again.
            </p>
            <Button size="sm" onClick={resetAll}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset filters
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {shown.map((i) => (
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
                  countryCode={countryCode}
                  nationality={nationality}
                  review={i.review}
                  image={i.image}
                  amenities={i.amenities}
                  landmark={i.landmark}
                  payAtHotel={i.payAtHotel}
                  detailHref={i.detailHref}
                />
              ))}
            </div>

            {pages > 1 && (
              <nav
                aria-label="Hotel results pages"
                className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => goto(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink disabled:opacity-40"
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
                {pageWindow(page, pages).map((p, i) =>
                  p === null ? (
                    <span key={`gap-${i}`} className="px-1 text-muted">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goto(p)}
                      aria-current={p === page ? "page" : undefined}
                      className={cn(
                        "h-11 min-w-11 rounded-full border px-3 text-body font-semibold",
                        p === page
                          ? "border-red bg-red text-white"
                          : "border-line text-ink hover:border-red/50",
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => goto(page + 1)}
                  disabled={page >= pages}
                  aria-label="Next page"
                  className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink disabled:opacity-40"
                >
                  <ChevronRight size={18} aria-hidden />
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
