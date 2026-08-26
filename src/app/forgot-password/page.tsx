import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordScreen } from "@/components/auth/ForgotPasswordScreen";
import { AUTH_DISABLED } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Forgot your password",
  description: "Reset the password on your Rise & Shine Travels account.",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  if (AUTH_DISABLED) redirect("/");
  return <ForgotPasswordScreen />;
}
