"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { AuthShell, inputCls, inputWrap } from "./AuthShell";
import { cn } from "@/lib/cn";

/**
 * Choose a new password.
 *
 * Reached only from a reset link: `/auth/confirm` redeems the token, which sets
 * a session cookie, and that session is the proof the visitor controls the
 * mailbox. So this screen checks for a session rather than a token in the URL —
 * there is nothing secret left in the address bar by the time you get here,
 * which also means the link cannot leak through a referrer or a shared screen.
 *
 * No session means the link expired, was already used, or someone navigated
 * here directly. All three get sent back to ask for a fresh link.
 */
export function ResetPasswordScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        setAllowed(Boolean(data.user));
        setReady(true);
      });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // The recovery session is already a real session, so there is no second
    // login step — send them straight to the account they just recovered.
    router.replace("/account");
  };

  if (!ready) {
    return (
      <AuthShell title="Choose a new password" intro="One moment…">
        <div className="mt-7 flex items-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden />
          Checking your link
        </div>
      </AuthShell>
    );
  }

  if (!allowed) {
    return (
      <AuthShell
        title="That link has expired"
        intro="Reset links work once and expire after an hour."
      >
        <p className="mt-7 text-[0.92rem] leading-relaxed text-ink-soft">
          Ask for a fresh one and it&apos;ll be in your inbox in a moment.
        </p>
        <Link
          href="/forgot-password"
          className="grad-red mt-6 flex min-h-12 w-full items-center justify-center rounded-full font-semibold text-white shadow-brand-red transition-all duration-300 hover:-translate-y-[2px]"
        >
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro="Pick something you'll remember — you'll be signed in straight after."
    >
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-ink">New password</span>
          <span className={inputWrap}>
            <Lock size={18} className="flex-none text-muted" aria-hidden />
            <input
              className={inputCls}
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
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

        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-ink">Confirm password</span>
          <span
            className={cn(
              inputWrap,
              confirm.length > 0 && confirm !== password && "border-red/60 focus-within:border-red",
            )}
          >
            <Lock size={18} className="flex-none text-muted" aria-hidden />
            <input
              className={inputCls}
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
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
          Save new password
        </button>
      </form>
    </AuthShell>
  );
}
