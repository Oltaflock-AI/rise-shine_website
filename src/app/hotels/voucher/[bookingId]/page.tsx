import type { Metadata } from "next";
import { HotelVoucherView } from "@/components/ui/HotelVoucherView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hotel Voucher",
  robots: { index: false },
};

/**
 * The guest's voucher for one hotel booking. The page is a thin shell — the
 * view reads the booking live from TBO (GetBookingDetail) through
 * /api/hotels/booking-detail, which enforces that the booking belongs to the
 * signed-in customer.
 */
export default async function HotelVoucherPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const id = Number(bookingId);

  return (
    <main className="pt-28 sm:pt-32">
      {Number.isFinite(id) && id > 0 ? (
        <HotelVoucherView bookingId={id} />
      ) : (
        <p className="py-24 text-center text-muted">That booking reference isn&apos;t valid.</p>
      )}
    </main>
  );
}
