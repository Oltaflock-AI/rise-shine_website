import type { Metadata } from "next";
import { MaskedFromReplay } from "@/components/layout/MaskedFromReplay";
import { CheckoutView } from "@/components/checkout/CheckoutView";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <MaskedFromReplay>
      <CheckoutView />
    </MaskedFromReplay>
  );
}
