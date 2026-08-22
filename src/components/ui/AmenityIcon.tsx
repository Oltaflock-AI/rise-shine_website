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
import type { AmenityIconName } from "@/lib/hotel-amenities";

/**
 * Amenity icon name → component.
 *
 * `lib/hotel-amenities.ts` carries icon NAMES rather than components so it can
 * stay pure and unit-testable; this is the one place that resolves them, shared
 * by the hotel detail list and the result cards so the same amenity never gets
 * two different glyphs on two pages.
 */
export const AMENITY_ICONS: Record<AmenityIconName, LucideIcon> = {
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

export function AmenityIcon({
  name,
  size = 14,
  className,
}: {
  name: AmenityIconName;
  size?: number;
  className?: string;
}) {
  const Icon = AMENITY_ICONS[name] ?? Check;
  return <Icon size={size} className={className} aria-hidden />;
}
