import { Flame, UtensilsCrossed } from "lucide-react";
import type { FlightOffer } from "@/lib/tbo";
import { cn } from "@/lib/cn";

/**
 * Scarcity threshold. TBO reports real remaining inventory per leg (1-135 on a
 * live DEL-BOM sweep), so this is the airline's own count, not an invention —
 * but it is only worth saying when it is genuinely tight. Shouting "9 left" on
 * every card is the pattern that trained everyone to ignore the message.
 */
const SCARCE = 4;

/**
 * The airline's own fare name, plus anything about this fare a traveller would
 * otherwise have to open the card to learn.
 *
 * `fareType` is why two seats on the same aircraft cost different amounts —
 * "Corporate Value" against "Flexi Plus", 21 distinct names on one search — and
 * TBO ships a colour with each. That colour is used as a tint only: at full
 * strength several of them fail contrast against white.
 */
export function FareBadges({
  offer,
  className,
}: {
  offer: FlightOffer;
  className?: string;
}) {
  const scarce = offer.seatsLeft != null && offer.seatsLeft <= SCARCE;
  if (!offer.fareType && !scarce && !offer.freeMeal) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {offer.fareType && (
        <span
          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.76rem] font-semibold text-ink"
          style={
            offer.fareType.color
              ? {
                  borderColor: offer.fareType.color,
                  background: `${offer.fareType.color}22`,
                }
              : undefined
          }
        >
          {offer.fareType.label}
        </span>
      )}
      {offer.freeMeal && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.76rem] font-semibold text-emerald-700">
          <UtensilsCrossed size={11} aria-hidden /> Meal included
        </span>
      )}
      {scarce && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red/10 px-2.5 py-0.5 text-[0.76rem] font-semibold text-red">
          <Flame size={11} aria-hidden />
          {offer.seatsLeft === 1
            ? "1 seat left"
            : `${offer.seatsLeft} seats left`}
        </span>
      )}
    </div>
  );
}
