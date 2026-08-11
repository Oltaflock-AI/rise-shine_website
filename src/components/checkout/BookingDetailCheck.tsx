"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, TriangleAlert } from "lucide-react";

/**
 * Re-read the booking from TBO 120 seconds after Book.
 *
 * TBO's rule (validation sheet, General Queries #3 under Book API, and portal
 * checkpoint 38): their systems settle on the final status about two minutes
 * after a Book, so the portal must call GetBookingDetail **after** 120 seconds
 * — never immediately — and show the guest that settled status.
 */
const DELAY_MS = 120_000;

type Detail = { ok: boolean; status?: number; hotelBookingStatus?: string; isVoucherBooked?: boolean; error?: string };

export function BookingDetailCheck({ bookingId }: { bookingId: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/hotels/booking-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId }),
        });
        const j = (await r.json()) as Detail;
        if (alive) setDetail(j);
      } catch {
        if (alive) setDetail({ ok: false, error: "network" });
      } finally {
        if (alive) setWaiting(false);
      }
    }, DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [bookingId]);

  if (waiting) {
    return (
      <p className="mb-6 inline-flex items-center gap-2 text-[0.82rem] text-muted">
        <Loader2 size={14} className="animate-spin text-red" aria-hidden />
        Re-confirming with the hotel system (about 2 minutes)…
      </p>
    );
  }

  if (detail?.ok && detail.status === 1) {
    return (
      <p className="mb-6 inline-flex items-center gap-2 text-[0.82rem] font-semibold text-green-700">
        <BadgeCheck size={14} aria-hidden />
        Re-confirmed with the hotel system{detail.isVoucherBooked ? " · voucher issued" : ""} ·{" "}
        <Link href={`/hotels/voucher/${bookingId}`} className="underline">
          View voucher
        </Link>
      </p>
    );
  }

  // Anything else is a "call us" state, never a silent success.
  return (
    <p className="mb-6 inline-flex items-center gap-2 text-[0.82rem] text-amber-700">
      <TriangleAlert size={14} aria-hidden />
      {detail?.hotelBookingStatus
        ? `Hotel system status: ${detail.hotelBookingStatus}.`
        : "We couldn't re-read this booking just now."}{" "}
      <Link href={`/hotels/voucher/${bookingId}`} className="underline">
        Check booking details
      </Link>
    </p>
  );
}
