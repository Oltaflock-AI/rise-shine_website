import {
  Accessibility,
  ArrowUpDown,
  Baby,
  Banknote,
  BellRing,
  Briefcase,
  Check,
  CigaretteOff,
  CircleParking,
  Clock,
  Coffee,
  ConciergeBell,
  Dumbbell,
  Flower2,
  HeartPulse,
  Lock,
  Luggage,
  Martini,
  PawPrint,
  Plane,
  Scissors,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Store,
  Trees,
  Tv,
  Utensils,
  WashingMachine,
  Waves,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { curateAmenities, type AmenityIconName } from "@/lib/hotel-amenities";

/** Name → component. Kept here so `lib/hotel-amenities.ts` stays pure data. */
const ICONS: Record<AmenityIconName, LucideIcon> = {
  Wifi,
  Waves,
  Utensils,
  Coffee,
  Tv,
  WashingMachine,
  Dumbbell,
  CircleParking,
  Plane,
  Martini,
  PawPrint,
  Baby,
  Accessibility,
  Lock,
  ShieldCheck,
  Briefcase,
  Banknote,
  Luggage,
  ConciergeBell,
  BellRing,
  Sparkles,
  Trees,
  CigaretteOff,
  Snowflake,
  ArrowUpDown,
  Flower2,
  Scissors,
  Store,
  Clock,
  HeartPulse,
  Check,
};

/**
 * What the hotel actually offers, one line per fact.
 *
 * The raw TBO feed says "pool" four different ways and buries the useful
 * entries under pandemic-era boilerplate; `curateAmenities` collapses that, and
 * each surviving category brings its own icon so the list can be scanned rather
 * than read. See `lib/hotel-amenities.ts` for why a plain de-dupe is not enough.
 */
export function HotelAmenities({
  facilities,
}: {
  facilities: string[] | undefined;
}) {
  const amenities = curateAmenities(facilities, 14);
  if (!amenities.length) return null;

  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
      <h3 className="mb-3.5 text-[1rem] font-bold text-ink">
        What this place offers
      </h3>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {amenities.map((a) => {
          const Icon = ICONS[a.icon] ?? Check;
          return (
            <li
              key={a.key}
              className="flex items-center gap-2.5 text-[0.88rem] text-ink"
            >
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-cream-2 text-navy">
                <Icon size={15} strokeWidth={2} aria-hidden />
              </span>
              {a.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
