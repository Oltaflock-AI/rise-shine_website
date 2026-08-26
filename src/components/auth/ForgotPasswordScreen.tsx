"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { AuthShell, inputCls, inputWrap } from "./AuthShell";
import { cn } from "@/lib/cn";

/**
 * Ask for a reset link.
 *
 * The success state is shown for ANY well-formed address, including ones with
 * no account. That is not a white lie for the customer's benefit — a form that
 * says "no account with that email" lets anyone test a list of addresses against
 * the customer database. The server behaves the same way; this screen just has
 * to not undo it.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Deliberately swallowed — see the note above. A network error here would
      // otherwise be the one signal that distinguishes outcomes.
    }
    setSent(true);
    setBusy(false);
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        intro="If that address has an account with us, a reset link is on its way."
      >
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-line bg-cream/60 p-4">
          <CheckCircle2 size={20} className="mt-0.5 flex-none text-red" aria-hidden />
          <div className="text-[0.92rem] leading-relaxed text-ink-soft">
            We&apos;ve sent a link to <b className="text-ink">{email}</b>. It works once and
            expires in an hour. If it hasn&apos;t arrived in a few minutes, check your spam
            folder.
          </div>
        </div>
        <p className="mt-6 text-center text-[0.9rem] text-muted">
          <Link href="/login" className="font-semibold text-red hover:underline">
            Back to log in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      intro="Enter your email and we'll send you a link to choose a new one."
    >
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-ink">Email</span>
          <span className={inputWrap}>
            <Mail size={18} className="flex-none text-muted" aria-hidden />
            <input
              className={inputCls}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              required
            />
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className={cn(
            "grad-red flex min-h-12 w-full items-center justify-center gap-2 rounded-full font-semibold text-white shadow-brand-red transition-all duration-300",
            busy ? "opacity-70" : "hover:-translate-y-[2px]",
          )}
        >
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
          Send reset link
        </button>
      </form>

      <p className="mt-6 text-center text-[0.9rem] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-red hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
