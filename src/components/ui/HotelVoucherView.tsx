"use client";

import { useEffect, useState } from "react";
import { mealLabel } from "@/lib/hotel-display";
import Link from "next/link";
import {
  BadgeCheck,
  BedDouble,
  CalendarDays,
  Loader2,
  MapPin,
  Printer,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format-date";
import { site } from "@/data/site";
import { whatsappEnabled } from "@/lib/whatsapp";

/**
 * The hotel voucher — everything TBO's portal verification checks on it
 * (checkpoints 39 and 41): stay dates, rooms, guests, the booked amount and the
 * cancellation policy, all read live from GetBookingDetail rather than from our
 * own mirror, so what the guest sees is what TBO holds.
 */
type VoucherRoom = {
  roomTypeName?: string;
  mealType?: string;
  totalFare?: number;
  currency?: string;
  guests: string[];
  cancelPolicies: Array<{
    fromDate: string;
    chargeType?: string | number;
    charge: number;
  }>;
};
type Detail = {
  ok: boolean;
  status?: number;
  hotelBookingStatus?: string;
  bookingId?: number;
  confirmationNo?: string;
  bookingRefNo?: string;
  hotelName?: string;
  address?: string;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  isVoucherBooked?: boolean;
  noOfRooms?: number;
  invoiceAmount?: number;
  currency?: string;
  rooms?: VoucherRoom[];
  error?: string;
};

/** TBO dates arrive as ISO or "DD-MM-YYYY hh:mm:ss" (UTC). */
function toISO(s?: string): string {
  if (!s) return "";
  const dmy = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return s.slice(0, 10);
}

function money(v: number | undefined, currency = "INR"): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function chargeLabel(
  p: { chargeType?: string | number; charge: number },
  currency: string,
): string {
  const t = String(p.chargeType ?? "").toLowerCase();
  if (p.charge <= 0) return "No charge";
  if (t === "2" || t === "percentage") return `${p.charge}% of the fare`;
  if (t === "3" || t === "nights")
    return `${p.charge} night${p.charge > 1 ? "s" : ""}`;
  return money(p.charge, currency);
}

export function HotelVoucherView({ bookingId }: { bookingId: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/hotels/booking-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // voucher:true asks TBO to issue the voucher if the booking is confirmed
      // but not yet vouchered (hold bookings); instant bookings self-voucher.
      body: JSON.stringify({ bookingId, voucher: true }),
    })
      .then((r) => r.json())
      .then((j) => alive && setDetail(j as Detail))
      .catch(
        () =>
          alive &&
          setDetail({ ok: false, error: "Could not load this booking." }),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [bookingId]);

  const currency = detail?.currency || detail?.rooms?.[0]?.currency || "INR";

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <span className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="animate-spin text-red" size={18} aria-hidden />{" "}
          Loading your voucher…
        </span>
      </div>
    );
  }

  if (!detail?.ok) {
    return (
      <Container>
        <div className="mx-auto my-16 max-w-lg rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
          <TriangleAlert className="mx-auto mb-4 text-red" aria-hidden />
          <h1 className="h-sm mb-2">We couldn&apos;t load this voucher</h1>
          <p className="mb-6 text-muted">
            {detail?.error ||
              "Please try again, or contact us and we'll send it over."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="/account" arrow>
              My bookings
            </Button>
            {whatsappEnabled && (
              <Button href={site.phone.whatsappHref} variant="light">
                WhatsApp Us
              </Button>
            )}
          </div>
        </div>
      </Container>
    );
  }

  const confirmed = detail.status === 1;

  return (
    <Container>
      <div className="mx-auto my-12 max-w-3xl rounded-brand-lg border border-line bg-white p-8 shadow-brand-sm print:border-0 print:shadow-none">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-meta font-bold uppercase tracking-[0.14em] text-red">
              Hotel voucher
            </p>
            <h1 className="h-sm mt-1">{detail.hotelName || "Your stay"}</h1>
            {(detail.address || detail.city) && (
              <p className="mt-1 flex items-start gap-1.5 text-body text-muted">
                <MapPin
                  size={14}
                  className="mt-0.5 flex-none text-red"
                  aria-hidden
                />
                {[detail.address, detail.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-meta font-bold ${
              confirmed
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <BadgeCheck size={14} aria-hidden />
            {detail.hotelBookingStatus || (confirmed ? "Confirmed" : "Pending")}
          </span>
        </div>

        <dl className="mb-6 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-meta font-semibold uppercase tracking-wide text-muted">
              Confirmation no.
            </dt>
            <dd className="text-lead font-bold tracking-wide text-navy">
              {detail.confirmationNo || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-meta font-semibold uppercase tracking-wide text-muted">
              Booking reference
            </dt>
            <dd className="text-body font-semibold text-ink">
              {detail.bookingRefNo || detail.bookingId || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-meta font-semibold uppercase tracking-wide text-muted">
              Stay
            </dt>
            <dd className="inline-flex items-center gap-1.5 text-body font-semibold text-ink">
              <CalendarDays size={14} className="text-red" aria-hidden />
              {formatDate(toISO(detail.checkIn))} →{" "}
              {formatDate(toISO(detail.checkOut))}
            </dd>
          </div>
          <div>
            <dt className="text-meta font-semibold uppercase tracking-wide text-muted">
              Rooms
            </dt>
            <dd className="inline-flex items-center gap-1.5 text-body font-semibold text-ink">
              <BedDouble size={14} className="text-red" aria-hidden />
              {detail.noOfRooms ?? detail.rooms?.length ?? 1}
            </dd>
          </div>
          <div>
            <dt className="text-meta font-semibold uppercase tracking-wide text-muted">
              Booking amount
            </dt>
            <dd className="text-lead font-bold text-navy">
              {money(detail.invoiceAmount, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-meta font-semibold uppercase tracking-wide text-muted">
              Voucher
            </dt>
            <dd className="text-body font-semibold text-ink">
              {detail.isVoucherBooked ? "Issued" : "Not issued yet"}
            </dd>
          </div>
        </dl>

        {(detail.rooms ?? []).map((room, i) => (
          <div key={i} className="mb-4 rounded-brand border border-line p-5">
            <h2 className="text-lead font-bold text-ink">
              Room {i + 1}
              {room.roomTypeName ? ` · ${room.roomTypeName}` : ""}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted">
              {room.mealType && <span>{mealLabel(room.mealType, true)}</span>}
              {room.totalFare != null && (
                <span className="font-semibold text-ink">
                  {money(room.totalFare, room.currency || currency)}
                </span>
              )}
            </div>
            {room.guests.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-body text-ink">
                <Users
                  size={14}
                  className="mt-0.5 flex-none text-red"
                  aria-hidden
                />
                {room.guests.join(", ")}
              </p>
            )}
            {room.cancelPolicies.length > 0 && (
              <div className="mt-3 border-t border-line pt-3 text-meta">
                <p className="mb-1 inline-flex items-center gap-1.5 font-semibold text-ink">
                  <ShieldCheck size={14} className="text-red" aria-hidden />{" "}
                  Cancellation policy
                </p>
                <ul className="list-disc pl-5 text-muted">
                  {room.cancelPolicies.map((p, k) => (
                    <li key={k}>
                      From {formatDate(toISO(p.fromDate)) || p.fromDate} (UTC):{" "}
                      {chargeLabel(p, room.currency || currency)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer size={15} aria-hidden /> Print voucher
          </Button>
          <Link
            href="/account"
            className="text-body font-semibold text-red hover:underline"
          >
            My bookings
          </Link>
        </div>
      </div>
    </Container>
  );
}
