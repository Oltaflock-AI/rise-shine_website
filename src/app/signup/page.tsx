import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a Rise & Shine Travels account to book flights, hotels and holidays.",
  robots: { index: false },
};

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
