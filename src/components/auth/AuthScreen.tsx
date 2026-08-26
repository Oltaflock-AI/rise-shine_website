"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthShell, inputCls, inputWrap } from "./AuthShell";
import { cn } from "@/lib/cn";

/**
 * Why a link might have failed. `/auth/confirm` redirects here with one of
 * these rather than dropping someone on a blank login form with no explanation
 * — an expired reset link is the ordinary case, not an error worth hiding.
 */
const LINK_ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Ask for a new one below.",
  link: "That link didn't look right. Ask for a new one below.",
  auth: "We couldn't complete that sign-in. Please try again.",
};

function safeRedirect(): string {
  if (typeof window === "undefined") return "/account";
  const r = new URLSearchParams(window.location.search).get("redirect");
  // only allow internal paths
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/account";
}

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const { user, ready, login, signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [offers, setOffers] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface a failed email link once, on arrival.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code && LINK_ERRORS[code]) setError(LINK_ERRORS[code]);
  }, []);

  // Already signed in → skip the form.
  useEffect(() => {
    if (ready && user) router.replace(safeRedirect());
  }, [ready, user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSignup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (isSignup) await signup(name, email, phone, password, offers);
      else await login(email, password);
      router.replace(safeRedirect());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const other = isSignup
    ? { href: "/login", prompt: "Already have an account?", cta: "Log in" }
    : { href: "/signup", prompt: "New to Rise & Shine?", cta: "Create an account" };

  return (
    <AuthShell
      title={isSignup ? "Create your account" : "Log in"}
      intro={
        isSignup
          ? "Sign up to book and manage your trips with Rise & Shine."
          : "Welcome back. Log in to continue your booking."
      }
    >
            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              {isSignup && (
                <label className="block">
                  <span className="mb-1.5 block text-meta font-semibold text-ink">Full name</span>
                  <span className={inputWrap}>
                    <User size={18} className="flex-none text-muted" aria-hidden />
                    <input
                      className={inputCls}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Hardik Patel"
                      autoComplete="name"
                      required
                    />
                  </span>
                </label>
              )}

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

              {isSignup && (
                <label className="block">
                  <span className="mb-1.5 block text-meta font-semibold text-ink">
                    Mobile number
                  </span>
                  <span className={inputWrap}>
                    <Phone size={18} className="flex-none text-muted" aria-hidden />
                    <input
                      className={inputCls}
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="98765 43210"
                      autoComplete="tel"
                      aria-describedby="signup-phone-hint"
                      required
                    />
                  </span>
                  <span id="signup-phone-hint" className="mt-1 block text-meta text-muted">
                    So we can reach you about your booking. Indian mobile, or
                    include your country code.
                  </span>
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-meta font-semibold text-ink">Password</span>
                  {!isSignup && (
                    <Link
                      href="/forgot-password"
                      className="text-meta font-semibold text-red hover:underline"
                    >
                      Forgot password?
                    </Link>
                  )}
                </span>
                <span className={inputWrap}>
                  <Lock size={18} className="flex-none text-muted" aria-hidden />
                  <input
                    className={inputCls}
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? "At least 6 characters" : "Your password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="-m-3.5 flex-none p-3.5 text-muted hover:text-ink"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>

              {isSignup && (
                <label className="block">
                  <span className="mb-1.5 block text-meta font-semibold text-ink">
                    Confirm password
                  </span>
                  <span
                    className={cn(
                      inputWrap,
                      confirm.length > 0 &&
                        confirm !== password &&
                        "border-red/60 focus-within:border-red",
                    )}
                  >
                    <Lock size={18} className="flex-none text-muted" aria-hidden />
                    <input
                      className={inputCls}
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      required
                    />
                  </span>
                  {confirm.length > 0 && confirm !== password && (
                    <span className="mt-1 block text-meta font-medium text-red-deep">
                      Passwords do not match.
                    </span>
                  )}
                </label>
              )}

              {isSignup && (
                <label className="flex cursor-pointer items-start gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={offers}
                    onChange={(e) => setOffers(e.target.checked)}
                    className="mt-0.5 h-5 w-5 flex-none accent-red"
                  />
                  <span className="text-[0.88rem] leading-relaxed text-muted">
                    Email me occasional trip offers. Unticked by default, and one
                    click to stop at any time &mdash; booking confirmations arrive
                    either way.
                  </span>
                </label>
              )}

              {error && (
                <p className="rounded-lg bg-red/8 px-3.5 py-2.5 text-[0.85rem] font-medium text-red-deep">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className={cn(
                  "grad-red flex min-h-12 w-full items-center justify-center gap-2 rounded-full font-semibold text-white shadow-brand-red transition-all duration-300",
                  busy ? "opacity-70" : "hover:-translate-y-[2px]",
                )}
              >
                {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
                {isSignup ? "Create account" : "Log in"}
              </button>
            </form>

            <p className="mt-6 text-center text-[0.9rem] text-muted">
              {other.prompt}{" "}
              <Link href={other.href} className="font-semibold text-red hover:underline">
                {other.cta}
              </Link>
            </p>

            <p className="mt-6 text-center text-meta leading-relaxed text-muted/80">
              Your details are kept private and secure. By continuing you agree to our{" "}
              <Link href="/terms" className="font-medium text-red hover:underline">
                Terms
              </Link>
              .
            </p>
    </AuthShell>
  );
}
