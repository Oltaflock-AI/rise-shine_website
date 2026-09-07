"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Two forms, one shell: sign in, and "forgot password" which asks for a reset
// link. They share a panel rather than living on separate pages so the person
// who mistyped their password is one click from the fix, not one navigation.
type Mode = "signin" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setSent(null);
    setPassword("");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setError(json?.error ?? "Could not sign you in. Try again.");
    setBusy(false);
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(null);
    const res = await fetch("/api/auth/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    // The answer is the same whether or not the address has an account, so
    // there is nothing here to branch on beyond a genuine failure.
    if (res?.ok) setSent(json?.message ?? "If that address has an account, a reset link is on its way.");
    else setError(json?.error ?? "Could not send that just now. Try again.");
    setBusy(false);
  }

  const forgot = mode === "forgot";

  return (
    <main className="login-shell">
      <form className="panel login-panel" onSubmit={forgot ? requestReset : signIn}>
        <div className="brand login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, fixed size */}
          <img src="/brand/logo.png" alt="Rise & Shine Travels" className="brand-logo" />
          <span className="brand-sub">Admin Dashboard</span>
        </div>
        {forgot && (
          <p className="hint" style={{ marginTop: 0 }}>
            Enter your dashboard email and we will send you a link to choose a new password.
          </p>
        )}
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {!forgot && (
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        {sent && <p className="hint" role="status">{sent}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? (forgot ? "Sending…" : "Signing in…") : forgot ? "Send reset link" : "Sign in"}
        </button>
        <button
          className="panel-link as-btn"
          type="button"
          onClick={() => switchTo(forgot ? "signin" : "forgot")}
        >
          {forgot ? "Back to sign in" : "Forgot password?"}
        </button>
        <p className="hint">Team accounts are managed on the Team Access page by an admin.</p>
      </form>
    </main>
  );
}
