import Image from "next/image";
import Link from "next/link";
import {
  Star,
  Utensils,
  ShieldCheck,
  MapPin,
  ImageOff,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { BookButton } from "@/components/ui/BookButton";
import { AmenityIcon } from "@/components/ui/AmenityIcon";
import { cn } from "@/lib/cn";
import type { HotelOffer } from "@/lib/tbo-hotel";
import type { Amenity } from "@/lib/hotel-amenities";
import {
  cancellationHeadline,
  cancellationWindows,
} from "@/lib/hotel-cancellation";
import { formatDeadline, mealLabel, perNightFare } from "@/lib/hotel-display";

/** TBO ratings arrive as words ("FourStar") or ints — normalize to 0–5. */
function starCount(rating?: string): number {
  if (!rating) return 0;
  const words: Record<string, number> = {
    onestar: 1,
    twostar: 2,
    threestar: 3,
    fourstar: 4,
    fivestar: 5,
  };
  const key = rating.toLowerCase().replace(/[^a-z]/g, "");
  if (words[key]) return words[key];
  const n = parseInt(rating, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
}

export type HotelStub = {
  name?: string;
  rating?: string;
  address?: string;
  cityName?: string;
};

export function HotelCard({
  offer,
  stub,
  nights,
  checkIn,
  checkOut,
  rooms,
  adults,
  childAges,
  cityLabel,
  countryCode,
  nationality,
  review,
  image,
  amenities,
  landmark,
  payAtHotel,
  detailHref,
}: {
  offer: HotelOffer;
  stub?: HotelStub;
  nights: number;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  /** Ages of children per room (uniform occupancy), empty = adults only. */
  childAges?: number[];
  cityLabel: string;
  /** Destination country (ISO-2) — carried to checkout to drive PAN rules. */
  countryCode?: string;
  /** Guest nationality searched with — Book must carry the same value. */
  nationality?: string;
  /** Google review score (absent → no badge). */
  review?: { rating: number; count: number };
  /** Lead photo from TBO HotelDetails (absent → placeholder block). */
  image?: string;
  /**
   * A few curated facilities for the card. Optional: the search page joins
   * these from HotelDetails, which is cosmetic content that can fail.
   */
  amenities?: Amenity[];
  /**
   * Nearest landmark from TBO's `Attractions`. This is what the OTAs put on a
   * card and what a guest can actually act on; the postal address it replaces
   * cost two lines and answered a question nobody asks from a results list.
   */
  landmark?: string;
  /**
   * True when the hotel charges a mandatory fee on arrival (`HotelFees`
   * Mandatory). The headline price does not include it, so a card that stays
   * silent is quietly under-quoting the stay.
   */
  payAtHotel?: boolean;
  /** /hotels/[code]?dates… — the room-options page for this hotel. */
  detailHref: string;
}) {
  const cheapest = offer.rooms[0];
  const stars = starCount(stub?.rating);
  const name = stub?.name || `Hotel ${offer.hotelCode}`;
  // TBO portal checkpoint 12: show the EXACT TotalFare — no rounding.
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: offer.currency || "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Per night is the number guests compare across stays of different lengths.
  // It is display arithmetic on TotalFare, not a second price: the exact total
  // is still printed underneath it, unrounded.
  const perNight = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: offer.currency || "INR",
    maximumFractionDigits: 0,
  });

  // "Free cancellation until <date>" beats a bare "Refundable" — it is the
  // same fact with the deadline the guest actually needs, and the windows
  // helper drops any free window that has already closed.
  const windows = cancellationWindows(cheapest?.cancelPolicies);
  const cancelLine =
    cancellationHeadline(windows, formatDeadline) ||
    (cheapest?.isRefundable ? "Refundable" : "Non-refundable");
  const cancelFree = cancelLine.startsWith("Free");

  // Everything the hotel checkout needs to PreBook + Book this room.
  const query: Record<string, string> = {
    bookingCode: cheapest?.bookingCode ?? "",
    hotel: name,
    city: cityLabel,
    checkIn,
    checkOut,
    nights: String(nights),
    rooms: String(rooms),
    adults: String(adults),
    ...(childAges?.length
      ? { children: String(childAges.length), ages: childAges.join(",") }
      : {}),
    fare: String(offer.cheapestFare),
    currency: offer.currency || "INR",
    room: cheapest?.name ?? "Room",
    meal: cheapest?.mealType ?? "",
    refundable: cheapest?.isRefundable ? "1" : "0",
    ...(countryCode ? { cc: countryCode } : {}),
    nat: nationality || "IN",
  };

  return (
    <div className="flex flex-col gap-4 rounded-brand-lg border border-line bg-white p-4 shadow-brand-sm sm:flex-row sm:items-stretch">
      {/* Photo beside the facts, not above them. A full-width 160px photo cost
          a fifth of a phone screen per card and pushed the results per screen
          below 1.5; alongside, the same card reads in a single glance.
          `sm:contents` dissolves this wrapper on wider screens so the photo and
          the body rejoin the card's own row. */}
      <div className="flex min-w-0 gap-3 sm:contents">
        {/* Photo → room options. Hidden from assistive tech and from the tab
          order: the heading link below goes to the same place, and three
          identical links per card is three times the noise for no gain. */}
        <Link
          href={detailHref}
          tabIndex={-1}
          aria-hidden
          className="relative block h-28 w-28 flex-none overflow-hidden rounded-brand bg-cream sm:h-auto sm:min-h-36 sm:w-44"
        >
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 640px) 11rem, 7rem"
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted">
              <ImageOff size={26} aria-hidden />
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Two lines, then ellipsis. A single truncated line cut names like
              "Pearl Marina Hotel Apartments" mid-word on every phone. */}
            <h3 className="text-lead font-bold text-ink">
              <Link href={detailHref} className="line-clamp-2 hover:text-red">
                {name}
              </Link>
            </h3>
            {stars > 0 && (
              <span
                className="flex flex-none items-center gap-0.5 text-red"
                aria-label={`${stars} star`}
              >
                {Array.from({ length: stars }).map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    fill="currentColor"
                    strokeWidth={0}
                    aria-hidden
                  />
                ))}
              </span>
            )}
          </div>

          {review && (
            <p className="mt-1 flex items-center gap-1.5 text-meta">
              <span className="inline-flex flex-none items-center gap-1 rounded-md bg-navy px-1.5 py-0.5 font-bold text-white">
                {review.rating.toFixed(1)}
                <Star
                  size={11}
                  fill="currentColor"
                  strokeWidth={0}
                  aria-hidden
                />
              </span>
              <span className="text-muted">
                {review.count > 0
                  ? `${new Intl.NumberFormat("en-IN").format(review.count)} Google review${review.count > 1 ? "s" : ""}`
                  : "Google rating"}
              </span>
            </p>
          )}

          {landmark && (
            <p className="mt-1 flex items-start gap-1.5 text-meta text-muted">
              <MapPin
                size={13}
                className="mt-0.5 flex-none text-red"
                aria-hidden
              />
              <span className="line-clamp-1">Near {landmark}</span>
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted">
            {mealLabel(cheapest?.mealType) && (
              <span className="inline-flex items-center gap-1">
                <Utensils size={14} className="text-red" aria-hidden />
                {mealLabel(cheapest?.mealType)}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1",
                cancelFree ? "font-medium text-green-700" : "text-muted",
              )}
            >
              <ShieldCheck size={14} aria-hidden />
              {cancelLine}
            </span>
          </div>

          {/* What the hotel offers, at a glance. Without this the guest had to
            open every property just to find out which ones have a pool. */}
          {amenities && amenities.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <li
                  key={a.key}
                  className="inline-flex items-center gap-1 rounded-full bg-cream-2 px-2.5 py-1 text-meta font-medium text-ink"
                >
                  <AmenityIcon name={a.icon} size={12} className="text-red" />
                  {a.label}
                </li>
              ))}
            </ul>
          )}

          {payAtHotel && (
            <p className="mt-1.5 flex items-start gap-1.5 text-meta text-muted">
              <Wallet
                size={13}
                className="mt-0.5 flex-none text-red"
                aria-hidden
              />
              <span>Extra charges payable at the hotel</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-none items-end justify-between gap-4 sm:flex-col sm:items-end sm:justify-end">
        <div className="text-right">
          <div className="text-[1.25rem] font-extrabold leading-tight text-navy">
            {perNight.format(perNightFare(offer.cheapestFare, nights))}
          </div>
          <div className="text-meta text-muted">per night</div>
          <div className="mt-1 text-meta text-ink">
            {money.format(offer.cheapestFare)}{" "}
            <span className="text-muted">
              total · {nights} night{nights > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={detailHref}
            className="inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-red hover:underline"
          >
            View rooms <ArrowRight size={13} strokeWidth={2.2} aria-hidden />
          </Link>
          <BookButton query={query} path="/hotels/checkout" label="Book" />
        </div>
      </div>
    </div>
  );
}
