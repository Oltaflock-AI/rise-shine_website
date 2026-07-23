import Image from "next/image";
import { Plane } from "lucide-react";
import { airlineLogo } from "@/data/airlineLogos";
import { BookButton } from "./BookButton";
import type { FlightOffer } from "@/lib/tbo";
import { formatDate } from "@/lib/format-date";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtTime = (iso: string) => (iso || "").slice(11, 16);
const fmtDur = (m: number) =>
  `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const fmtDate = formatDate;

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

export function FlightCard({
  offer,
  enquireHref,
  booking,
}: {
  offer: FlightOffer;
  enquireHref: string;
  booking?: BookingContext;
}) {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const logo = airlineLogo(offer.airlineCode);
  const stopsLabel =
    offer.stops === 0 ? "Non-stop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`;

  return (
    <div className="flex flex-col gap-4 rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm transition-shadow hover:shadow-brand sm:flex-row sm:items-center sm:gap-6">
      {/* Airline */}
      <div className="flex items-center gap-3 sm:w-44 sm:flex-none">
        <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-lg border border-line bg-white">
          {logo ? (
            <Image src={logo} alt={offer.airlineName} width={28} height={28} className="object-contain" unoptimized />
          ) : (
            <span className="text-[0.7rem] font-bold text-navy">{offer.airlineCode}</span>
          )}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[0.95rem] font-semibold text-ink">
            {offer.airlineName}
          </div>
          <div className="truncate text-[0.75rem] text-muted">
            {offer.segments.map((s) => s.flightNumber).join(" · ")}
          </div>
        </div>
      </div>

      {/* Route */}
      <div className="flex flex-1 items-center gap-3">
        <div className="text-left">
          <div className="text-[1.15rem] font-bold tabular-nums text-ink">
            {fmtTime(first?.depTime)}
          </div>
          <div className="text-[0.8rem] font-medium text-muted">{first?.from}</div>
        </div>
        <div className="flex flex-1 flex-col items-center px-1">
          <div className="text-[0.72rem] text-muted">{fmtDur(offer.durationMin)}</div>
          <div className="my-1 flex w-full items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-line" />
            <span className="h-px flex-1 bg-line" />
            <Plane size={13} className="text-red" aria-hidden />
            <span className="h-px flex-1 bg-line" />
            <span className="h-1.5 w-1.5 rounded-full bg-line" />
          </div>
          <div className="text-[0.72rem] font-medium text-muted">{stopsLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-[1.15rem] font-bold tabular-nums text-ink">
            {fmtTime(last?.arrTime)}
          </div>
          <div className="text-[0.8rem] font-medium text-muted">{last?.to}</div>
        </div>
      </div>

      {/* Fare + CTA */}
      <div className="flex items-center justify-between gap-4 border-t border-dashed border-line pt-4 sm:w-52 sm:flex-none sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:border-dashed sm:pl-6 sm:pt-0">
        <div className="sm:text-right">
          <div className="text-[1.35rem] font-extrabold text-navy">
            ₹{inr.format(offer.fareINR)}
          </div>
          <div className="text-[0.72rem] text-muted">
            per adult · {offer.isRefundable ? "Refundable" : "Non-refundable"}
          </div>
          <div className="text-[0.68rem] text-muted">{fmtDate(first?.depTime)}</div>
        </div>
        <BookButton
          query={{
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
          }}
        />
      </div>
    </div>
  );
}
