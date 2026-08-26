import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordScreen } from "@/components/auth/ResetPasswordScreen";
import { AUTH_DISABLED } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Rise & Shine Travels account.",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  if (AUTH_DISABLED) redirect("/");
  return <ResetPasswordScreen />;
}
