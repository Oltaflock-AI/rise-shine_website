"use client";

import { useState } from "react";
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
  ChevronDown,
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
 *
 * Fourteen rows is ~590px — most of a phone screen spent on a list whose top
 * few entries decide the booking and whose tail ("Lift", "Front desk") is true
 * of nearly every hotel on the feed. Six show; the rest are one tap away, in
 * decision-weight order so the six are the six that matter.
 */
export function HotelAmenities({
  facilities,
}: {
  facilities: string[] | undefined;
}) {
  const amenities = curateAmenities(facilities, 14);
  const [expanded, setExpanded] = useState(false);
  if (!amenities.length) return null;

  const shown = expanded ? amenities : amenities.slice(0, 6);
  const hidden = amenities.length - shown.length;

  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
      <h3 className="mb-3.5 text-[1rem] font-bold text-ink">
        What this place offers
      </h3>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {shown.map((a) => {
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

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-meta font-semibold text-red hover:underline"
        >
          {expanded ? "Show fewer" : `Show all ${amenities.length}`}
          <ChevronDown
            size={15}
            aria-hidden
            className={expanded ? "rotate-180" : ""}
          />
        </button>
      )}
    </div>
  );
}
