import type { Metadata } from "next";
import { MaskedFromReplay } from "@/components/layout/MaskedFromReplay";
import { HotelCheckoutView } from "@/components/checkout/HotelCheckoutView";

export const metadata: Metadata = {
  title: "Hotel Checkout",
  robots: { index: false },
};

export default function HotelCheckoutPage() {
  return (
    <MaskedFromReplay>
      <HotelCheckoutView />
    </MaskedFromReplay>
  );
}
