"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

/**
 * Booking CTA that enforces the login gate: a signed-out user is sent to
 * /login (with a redirect back to checkout); a signed-in user goes straight
 * to the checkout demo. This is the "must sign up to process booking" flow.
 */
export function BookButton({
  query,
  label = "Book",
  className,
}: {
  query: Record<string, string>;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const { user, ready } = useAuth();

  const checkout = `/checkout?${new URLSearchParams(query).toString()}`;

  const onClick = () => {
    if (user) router.push(checkout);
    else router.push(`/login?redirect=${encodeURIComponent(checkout)}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grad-red inline-flex flex-none items-center gap-1.5 rounded-full px-5 py-2.5 text-[0.85rem] font-semibold text-white shadow-brand-red transition-transform duration-300 hover:-translate-y-[2px]",
        className,
      )}
      title={ready && !user ? "Log in or sign up to book" : undefined}
    >
      {ready && !user && <Lock size={13} aria-hidden />}
      {label} <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
    </button>
  );
}
