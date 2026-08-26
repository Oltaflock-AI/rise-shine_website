"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
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

  return (
    <main className="login-shell">
      <form className="panel login-panel" onSubmit={submit}>
        <div className="brand login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, fixed size */}
          <img src="/brand/logo.png" alt="Rise & Shine Travels" className="brand-logo" />
          <span className="brand-sub">Admin Dashboard</span>
        </div>
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
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="hint">Team accounts are managed on the Team Access page by an admin.</p>
      </form>
    </main>
  );
}
