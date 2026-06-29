/**
 * Editorial content blocks used across pages: why-choose-us, brand values,
 * and headline stats. `icon` values map to the Icon registry.
 */
import type { IconName } from "@/components/ui/Icon";

export type Feature = {
  icon: IconName;
  title: string;
  description: string;
};

/** "Why Rise & Shine" — shown on the home about split. */
export const whyUs: Feature[] = [
  {
    icon: "target",
    title: "Made for you",
    description: "Itineraries shaped around how you like to travel.",
  },
  {
    icon: "headset",
    title: "Real humans, 24/7",
    description: "Someone who knows your trip is always a call away.",
  },
  {
    icon: "wallet",
    title: "Honest pricing",
    description: "Best value, clearly explained — no nasty surprises.",
  },
  {
    icon: "shield",
    title: "Accredited & trusted",
    description: "An IATA, ADTOI & TAG-recognised agency.",
  },
];

/** Brand values — shown on the About page. */
export const values: Feature[] = [
  {
    icon: "compass",
    title: "Flexible & creative",
    description:
      "No two travellers are alike. We design around your pace, interests and budget — never off a shelf.",
  },
  {
    icon: "users",
    title: "People we trust",
    description:
      "Hand-picked transport teams, guides and on-ground partners at every destination.",
  },
  {
    icon: "search",
    title: "Attention to detail",
    description:
      "It's the little things that make a trip exceptional — and we happily obsess over them.",
  },
  {
    icon: "gem",
    title: "Honest value",
    description:
      "Transparent pricing and best-fit options that respect your time and money.",
  },
];

export type Stat = { value: number; suffix?: string; label: string };

export const homeStats: Stat[] = [
  { value: 15, suffix: "+", label: "Years guiding journeys" },
  { value: 12000, suffix: "+", label: "Happy travellers" },
  { value: 40, suffix: "+", label: "Destinations covered" },
  { value: 98, suffix: "%", label: "Would travel with us again" },
];

export const aboutStats: Stat[] = [
  { value: 15, suffix: "+", label: "Years of experience" },
  { value: 12000, suffix: "+", label: "Travellers served" },
  { value: 40, suffix: "+", label: "Destinations" },
  { value: 6, label: "Industry accreditations" },
];

/** Destinations for the home marquee. */
export const marqueeDestinations = [
  "Kerala",
  "Maldives",
  "Dubai",
  "Bali",
  "Kashmir",
  "Mauritius",
  "Thailand",
  "Switzerland",
  "Singapore",
  "Andaman",
];
