/**
 * Services offered + the "how it works" steps.
 * `icon` values map to keys in the Icon registry (src/components/ui/Icon.tsx).
 */
import type { IconName } from "@/components/ui/Icon";

export type Service = {
  icon: IconName;
  title: string;
  description: string;
};

/** Compact set shown on the home page services overview. */
export const homeServices: Service[] = [
  {
    icon: "bed",
    title: "Stays & Resorts",
    description:
      "3★ to 5★ hotels and luxury resorts, booked to suit exactly what you want.",
  },
  {
    icon: "plane",
    title: "Flights",
    description:
      "Domestic & international air tickets at the best fares we can find.",
  },
  {
    icon: "car",
    title: "Car Rentals",
    description: "Chauffeur-driven cars for Ahmedabad city and outstation trips.",
  },
  {
    icon: "ship",
    title: "Cruises",
    description:
      "The right cabin, route and onboard package for your best time at sea.",
  },
  {
    icon: "visa",
    title: "Visa & Passport",
    description:
      "End-to-end paperwork help so the only thing you pack is excitement.",
  },
  {
    icon: "compass",
    title: "Custom Tours",
    description:
      "Tell us your dream — we design a flexible, creative itinerary around it.",
  },
];

/** Full set shown on the Services page. */
export const services: Service[] = [
  {
    icon: "bed",
    title: "Hotel Booking",
    description:
      "Stay in 5★ to 3★ hotels and luxury resorts. Prompt bookings with customised options to suit your requirements.",
  },
  {
    icon: "plane",
    title: "Flight Tickets",
    description:
      "Air ticket booking for domestic and international flights. Call us or fill the inquiry form with your details.",
  },
  {
    icon: "car",
    title: "Car Rentals",
    description:
      "Car hire for Ahmedabad city and outstation travel, exactly as your trip requires.",
  },
  {
    icon: "tours",
    title: "Trips & Tours",
    description:
      "Explore the world with us — guided group tours and independent holidays across 40+ destinations.",
  },
  {
    icon: "ship",
    title: "Cruises",
    description:
      "Enjoy your best cruise experience — the right cabins, routes and onboard packages at great fares.",
  },
  {
    icon: "compass",
    title: "Custom Tours",
    description:
      "Choose your best-fit trip. Fully personalised itineraries built around your interests.",
  },
  {
    icon: "visa",
    title: "Visa Services",
    description:
      "End-to-end visa assistance — documentation, applications and appointment guidance.",
  },
  {
    icon: "passport",
    title: "Passport Services",
    description:
      "Help with new passports and renewals so your travel paperwork is never a worry.",
  },
  {
    icon: "insurance",
    title: "Travel Insurance",
    description:
      "The right coverage for medical, baggage and cancellation peace of mind.",
  },
];

export const howItWorks: { step: number; title: string; description: string }[] =
  [
    {
      step: 1,
      title: "Tell us your dream",
      description: "Share your destination, dates, budget and travel style.",
    },
    {
      step: 2,
      title: "Get a tailored plan",
      description: "We design a flexible itinerary and a transparent quote.",
    },
    {
      step: 3,
      title: "Confirm & relax",
      description: "We book flights, stays, transfers and visas — everything.",
    },
    {
      step: 4,
      title: "Travel with support",
      description: "On-call help throughout your journey, wherever you are.",
    },
  ];
