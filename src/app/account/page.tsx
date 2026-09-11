import type { Metadata } from "next";
import { MaskedFromReplay } from "@/components/layout/MaskedFromReplay";
import { AccountView } from "@/components/auth/AccountView";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <MaskedFromReplay>
      <AccountView />
    </MaskedFromReplay>
  );
}
