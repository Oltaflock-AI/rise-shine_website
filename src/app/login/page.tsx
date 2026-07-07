import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Rise & Shine Travels account to book and manage your trips.",
  robots: { index: false },
};

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
