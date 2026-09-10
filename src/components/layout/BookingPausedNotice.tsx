import { PhoneCall } from "lucide-react";
import { site } from "@/data/site";
import { pausedProducts, pausedMessage } from "@/lib/booking-pause";

/**
 * Site-wide strip shown while BOOKING_PAUSED is set (lib/booking-pause). A
 * server component: it reads the environment, so it costs nothing per request
 * and renders nothing at all when the switch is off. Below the header so it is
 * the first thing on every page during an outage — a customer should never
 * discover the pause at the payment button.
 */
export function BookingPausedNotice() {
  const paused = pausedProducts();
  if (!paused.size) return null;
  const message =
    paused.size === 2
      ? "Online booking is paused for a short while. Call us and we will book it for you."
      : pausedMessage(paused.has("flight") ? "flight" : "hotel");
  return (
    <div role="status" className="border-b border-amber-300 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
        <span>{message}</span>
        <a href={site.phone.mobileHref} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          <PhoneCall size={14} aria-hidden />
          {site.phone.mobileDisplay}
        </a>
      </div>
    </div>
  );
}
