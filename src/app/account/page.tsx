import type { Metadata } from "next";
import { AccountView } from "@/components/auth/AccountView";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false },
};

export default function AccountPage() {
  return <AccountView />;
}
