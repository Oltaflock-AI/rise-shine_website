"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

const inputWrap =
  "flex items-center gap-2.5 rounded-xl border border-line bg-cream/60 px-4 focus-within:border-red focus-within:bg-white transition-colors";
const inputCls =
  "w-full bg-transparent py-3.5 text-[0.95rem] text-ink outline-none placeholder:text-muted/70";

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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (isSignup) await signup(name, email, password);
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
    <section className="bg-cream pb-16 pt-28 sm:pt-32">
      <Container>
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand lg:grid-cols-2">
          {/* Brand panel */}
          <div className="grad-navy relative hidden flex-col justify-between p-10 lg:flex">
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 12%, rgba(226,30,38,0.5), transparent 45%)",
              }}
              aria-hidden
            />
            <Image
              src="/brand/logo-white.png"
              alt="Rise & Shine Travels"
              width={200}
              height={75}
              className="relative h-11 w-auto"
            />
            <div className="relative">
              <p className="text-script text-3xl text-white/90">Welcome aboard</p>
              <h2 className="mt-2 text-[1.9rem] font-extrabold leading-tight text-white">
                Your journeys, all in one account.
              </h2>
              <ul className="mt-6 space-y-3 text-[0.95rem] text-white/85">
                {[
                  "Book flights & hotels with saved traveller details",
                  "Track your enquiries and trips in one place",
                  "Faster checkout when you're ready to pay",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <ShieldCheck size={18} className="mt-0.5 flex-none text-white" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-[0.8rem] text-white/60">
              Ahmedabad&apos;s trusted travel house · Est. 2011
            </p>
          </div>

          {/* Form */}
          <div className="p-8 sm:p-10">
            <h1 className="h-md">{isSignup ? "Create your account" : "Log in"}</h1>
            <p className="mt-2 text-[0.95rem] text-muted">
              {isSignup
                ? "Sign up to book and manage your trips with Rise & Shine."
                : "Welcome back. Log in to continue your booking."}
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              {isSignup && (
                <label className="block">
                  <span className="mb-1.5 block text-[0.8rem] font-semibold text-ink">Full name</span>
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
                <span className="mb-1.5 block text-[0.8rem] font-semibold text-ink">Email</span>
                <span className={inputWrap}>
                  <Mail size={18} className="flex-none text-muted" aria-hidden />
                  <input
                    className={inputCls}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[0.8rem] font-semibold text-ink">Password</span>
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
                    className="flex-none text-muted hover:text-ink"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>

              {isSignup && (
                <label className="block">
                  <span className="mb-1.5 block text-[0.8rem] font-semibold text-ink">
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
                    <span className="mt-1 block text-[0.75rem] font-medium text-red-deep">
                      Passwords do not match.
                    </span>
                  )}
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

            <p className="mt-6 text-center text-[0.75rem] leading-relaxed text-muted/80">
              Demo account system for preview. Details are stored on this device only.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
