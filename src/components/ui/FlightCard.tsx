"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Plane,
} from "lucide-react";
import { airlineLogo } from "@/data/airlineLogos";
import { aircraftName } from "@/data/aircraft";
import { BookButton } from "./BookButton";
import type { FlightOffer } from "@/lib/tbo";
import { formatDate, formatDateWithDay } from "@/lib/format-date";
import {
  BaggageSummary,
  FareInclusions,
  FarePolicyTable,
  weakestAllowance,
} from "./fare-info";
import { FareBadges } from "./FareBadges";
import { cn } from "@/lib/cn";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtTime = (iso: string) => (iso || "").slice(11, 16);
const fmtDur = (m: number) =>
  `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const fmtDate = formatDate;
const fmtDateWithDay = formatDateWithDay;

/** What the checkout needs to actually book this fare with TBO. */
export type BookingContext = {
  traceId: string;
  searchedAt: number;
  departISO: string;
  adults: number;
  children: number;
  infants: number;
  isInternational: boolean;
};

/**
 * The /checkout query for one offer — shared by the card's Book button and the
 * round-trip pairing bar so both open the identical checkout.
 */
export function buildCheckoutQuery(
  offer: FlightOffer,
  enquireHref: string,
  booking?: BookingContext,
): Record<string, string> {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  return {
    airline: offer.airlineName,
    flightNo: offer.segments.map((s) => s.flightNumber).join(" · "),
    from: first?.from ?? "",
    to: last?.to ?? "",
    dep: first?.depTime ?? "",
    arr: last?.arrTime ?? "",
    stops: String(offer.stops),
    dur: String(offer.durationMin),
    fare: String(offer.fareINR),
    refundable: offer.isRefundable ? "1" : "0",
    wa: enquireHref,
    // Everything below is what TBO needs to price and issue the ticket.
    ...(booking
      ? {
          traceId: booking.traceId,
          searchedAt: String(booking.searchedAt),
          resultIndex: offer.id,
          airlineCode: offer.airlineCode,
          lcc: offer.isLCC ? "1" : "0",
          depart: booking.departISO,
          adults: String(booking.adults),
          children: String(booking.children),
          infants: String(booking.infants),
          intl: booking.isInternational ? "1" : "0",
        }
      : {}),
  };
}

/** Minutes between one leg landing and the next taking off. */
function layoverMin(prevArr: string, nextDep: string): number {
  const gap =
    (new Date(nextDep).getTime() - new Date(prevArr).getTime()) / 60000;
  return Number.isFinite(gap) && gap > 0 ? Math.round(gap) : 0;
}

/**
 * The expandable half of the card: leg-by-leg itinerary with the baggage allowance
 * that applies to EACH leg, the fare split, and the airline's cancellation grid.
 *
 * Search already carries all of this (Segments[].Baggage, FareInclusions,
 * MiniFareRules) — it was simply never rendered, so customers reached checkout not
 * knowing what they were buying.
 */
function OfferDetails({ offer }: { offer: FlightOffer }) {
  const legs = offer.segments;
  return (
    <div className="border-t border-dashed border-line pt-4">
      <ol className="space-y-3">
        {legs.map((s, i) => (
          <li key={`${s.flightNumber}-${i}`}>
            {i > 0 && layoverMin(legs[i - 1].arrTime, s.depTime) > 0 && (
              <p className="mb-3 flex items-center gap-1.5 rounded-brand bg-cream-2 px-3 py-1.5 text-[0.82rem] font-medium text-muted">
                <Clock className="h-3.5 w-3.5 flex-none" aria-hidden />
                {fmtDur(layoverMin(legs[i - 1].arrTime, s.depTime))} layover in{" "}
                {s.fromCity || s.from}
              </p>
            )}
            <div className="rounded-brand border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[0.9rem] font-semibold text-ink">
                  {s.fromCity || s.from} → {s.toCity || s.to}
                </span>
                <span className="text-[0.82rem] text-muted">
                  {s.flightNumber}
                  {s.cabinClass ? ` · ${s.cabinClass}` : ""}
                  {s.fareClass ? ` · class ${s.fareClass}` : ""}
                </span>
              </div>
              <div className="mt-1 text-[0.88rem] text-muted">
                {fmtTime(s.depTime)} {s.from}
                {s.fromTerminal ? ` T${s.fromTerminal}` : ""} —{" "}
                {fmtTime(s.arrTime)} {s.to}
                {s.toTerminal ? ` T${s.toTerminal}` : ""} ·{" "}
                {fmtDur(s.durationMin)}
              </div>
              {/* Full airport names and the aircraft type: TBO sends both on
                  every segment, and a code like "7M8" means nothing until it
                  reads "Boeing 737 MAX 8". */}
              {(s.fromAirportName || s.toAirportName) && (
                <div className="mt-1 text-[0.82rem] text-muted">
                  {[s.fromAirportName, s.toAirportName]
                    .filter(Boolean)
                    .join(" → ")}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 text-[0.82rem] text-muted">
                {s.aircraftCode && <span>{aircraftName(s.aircraftCode)}</span>}
                {s.operatedBy && <span>Operated by {s.operatedBy}</span>}
                {s.seatsLeft != null && s.seatsLeft <= 9 && (
                  <span className="font-medium text-red">
                    {s.seatsLeft === 1
                      ? "1 seat left"
                      : `${s.seatsLeft} seats left`}
                  </span>
                )}
              </div>
              {/* A technical stop is not a connection — same flight number, the
                  passenger stays aboard — so a "non-stop" that refuels would
                  otherwise look identical to one that does not. */}
              {s.stopPoint && (
                <div className="mt-1 text-[0.82rem] font-medium text-amber-700">
                  Technical stop at {s.stopPoint} — you stay on the aircraft
                </div>
              )}
              <BaggageSummary
                className="mt-2"
                checkedIn={s.baggage}
                cabin={s.cabinBaggage}
              />
            </div>
          </li>
        ))}
      </ol>

      {offer.fareInclusions.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-[0.88rem] font-bold text-ink">
            Included in this fare
          </h4>
          <FareInclusions items={offer.fareInclusions} />
        </div>
      )}

      <div className="mt-4">
        {/* Two lines, and base is the remainder: taxes and surcharges are their own
            line, everything else is the fare. Our service fee is part of the fare the
            customer is quoted, never itemised as a separate charge. */}
        <h4 className="mb-2 text-[0.88rem] font-bold text-ink">
          Fare breakdown (per adult)
        </h4>
        <dl className="space-y-1 text-[0.88rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Base fare</dt>
            <dd className="tabular-nums text-ink">
              ₹{inr.format(Math.max(0, offer.fareINR - offer.taxINR))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Taxes &amp; surcharges</dt>
            <dd className="tabular-nums text-ink">
              ₹{inr.format(offer.taxINR)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold">
            <dt className="text-ink">Total per adult</dt>
            <dd className="tabular-nums text-navy">
              ₹{inr.format(offer.fareINR)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-[0.88rem] font-bold text-ink">
          Cancellation &amp; date change
        </h4>
        {offer.miniRules.length > 0 ? (
          <FarePolicyTable rules={offer.miniRules} />
        ) : (
          <p className="text-[0.88rem] text-muted">
            {offer.isRefundable
              ? "This fare is refundable, less the airline's cancellation charge. The exact charge is confirmed on the next step, before you pay."
              : "This fare is non-refundable. Government taxes may still be refundable. The exact position is confirmed on the next step, before you pay."}
          </p>
        )}
        <p className="mt-2 text-[0.82rem] text-muted">
          Full airline rules are shown at checkout. See also our{" "}
          <Link
            href="/refund-policy"
            className="font-semibold text-red hover:underline"
          >
            cancellation &amp; refund policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function FlightCard({
  offer,
  enquireHref,
  booking,
  selection,
}: {
  offer: FlightOffer;
  enquireHref: string;
  booking?: BookingContext;
  /** Round-trip pairing: renders a Select toggle next to Book. */
  selection?: { selected: boolean; onSelect: () => void };
}) {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const logo = airlineLogo(offer.airlineCode);
  const stopsLabel =
    offer.stops === 0
      ? "Non-stop"
      : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`;
  // TBO segment times are local airport time with no zone — compare the date
  // parts as strings, never through Date, or an overnight hop shifts a day.
  const landsNextDay =
    Boolean(first?.depTime && last?.arrTime) &&
    last.arrTime.slice(0, 10) !== first.depTime.slice(0, 10);
  const [open, setOpen] = useState(false);
  // Advertise the weakest leg — see weakestAllowance.
  const checkedIn = weakestAllowance(offer.segments.map((s) => s.baggage));
  const cabinBag = weakestAllowance(offer.segments.map((s) => s.cabinBaggage));

  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm transition-shadow hover:shadow-brand">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        {/* Airline */}
        <div className="flex items-center gap-3 lg:w-44 lg:flex-none">
          <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-lg border border-line bg-white">
            {logo ? (
              <Image
                src={logo}
                alt={offer.airlineName}
                width={28}
                height={28}
                className="object-contain"
                unoptimized
              />
            ) : (
              <span className="text-meta font-bold text-navy">
                {offer.airlineCode}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[0.95rem] font-semibold text-ink">
              {offer.airlineName}
            </div>
            <div className="truncate text-[0.82rem] text-muted">
              {offer.segments.map((s) => s.flightNumber).join(" · ")}
            </div>
            <FareBadges offer={offer} className="mt-1.5" />
          </div>
        </div>

        {/* Route. The travel date leads it: it is the detail a customer re-checks
          before booking, and as small print under the fare it was the least
          legible thing on the card. A red-eye landing on the next calendar day
          says so here rather than only inside the expanded itinerary. */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-[0.95rem] font-bold text-ink">
              <CalendarDays
                size={15}
                className="flex-none text-red"
                aria-hidden
              />
              {fmtDateWithDay(first?.depTime)}
            </span>
            {landsNextDay && (
              <span className="rounded-full bg-red/10 px-2.5 py-0.5 text-[0.82rem] font-semibold text-red">
                Arrives {fmtDate(last?.arrTime)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-[1.15rem] font-bold tabular-nums text-ink">
                {fmtTime(first?.depTime)}
              </div>
              <div className="text-[0.88rem] font-medium text-muted">
                {first?.from}
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center px-1">
              <div className="text-[0.82rem] text-muted">
                {fmtDur(offer.durationMin)}
              </div>
              <div className="my-1 flex w-full items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-line" />
                <span className="h-px flex-1 bg-line" />
                <Plane size={13} className="text-red" aria-hidden />
                <span className="h-px flex-1 bg-line" />
                <span className="h-1.5 w-1.5 rounded-full bg-line" />
              </div>
              <div className="text-[0.82rem] font-medium text-muted">
                {stopsLabel}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[1.15rem] font-bold tabular-nums text-ink">
                {fmtTime(last?.arrTime)}
              </div>
              <div className="text-[0.88rem] font-medium text-muted">
                {last?.to}
              </div>
            </div>
          </div>
        </div>

        {/* Fare + CTA */}
        <div className="flex items-center justify-between gap-4 border-t border-dashed border-line pt-4 lg:w-52 lg:flex-none lg:flex-col lg:items-end lg:border-l lg:border-t-0 lg:border-dashed lg:pl-6 lg:pt-0">
          <div className="lg:text-right">
            <div className="text-[1.35rem] font-extrabold text-navy">
              ₹{inr.format(offer.fareINR)}
            </div>
            <div className="text-[0.88rem] text-muted">
              per adult · {offer.isRefundable ? "Refundable" : "Non-refundable"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {selection && (
              <button
                type="button"
                onClick={selection.onSelect}
                aria-pressed={selection.selected}
                className={cn(
                  "inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full border-[1.6px] px-5 py-2.5 text-[0.9rem] font-semibold transition-colors",
                  selection.selected
                    ? "border-red bg-red/10 text-red"
                    : "border-line text-ink hover:border-red/60 hover:text-red",
                )}
              >
                {selection.selected ? (
                  <>
                    <CheckCircle2 size={16} aria-hidden /> Selected
                  </>
                ) : (
                  "Select"
                )}
              </button>
            )}
            <BookButton
              query={buildCheckoutQuery(offer, enquireHref, booking)}
            />
          </div>
        </div>
      </div>

      {/* Baggage + rules strip. Skyscanner-style: the allowance is on the card, not
          three clicks away, because it is what decides between two similar fares. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-3">
        <BaggageSummary checkedIn={checkedIn} cabin={cabinBag} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-my-2 inline-flex min-h-11 items-center gap-1 py-2 text-[0.88rem] font-semibold text-red hover:underline"
        >
          {open ? "Hide details" : "Flight details & baggage"}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <OfferDetails offer={offer} />
        </div>
      )}
    </div>
  );
}
