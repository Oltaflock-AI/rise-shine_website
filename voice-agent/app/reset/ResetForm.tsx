"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Choosing a new password from an emailed link.
//
// The link is checked before the form is shown, so an expired or already-spent
// link says so up front rather than after someone types a password twice.
const DEAD_LINK = "This reset link is no longer valid. Ask for a new one on the sign-in page.";

export default function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  // A link with no token at all is dead on arrival — decided while the state is
  // created, not in an effect, so the page never renders a "checking…" step it
  // has already ruled out.
  const [state, setState] = useState<"checking" | "ready" | "dead">(token ? "checking" : "dead");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(token ? null : DEAD_LINK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    (async () => {
      const res = await fetch(`/api/auth/reset/confirm?token=${encodeURIComponent(token)}`).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (!live) return;
      if (res?.ok) {
        setState("ready");
      } else {
        setError(json?.error ?? DEAD_LINK);
        setState("dead");
      }
    })();
    return () => {
      live = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) {
      // The route hands this browser a fresh session, so a reset lands inside
      // the dashboard instead of back on the sign-in form.
      router.push("/");
      router.refresh();
      return;
    }
    setError(json?.error ?? "Could not set that password. Try again.");
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

        {state === "checking" && <p className="hint" style={{ marginTop: 0 }}>Checking your link…</p>}

        {state === "dead" && (
          <>
            {error && <p className="err" role="alert">{error}</p>}
            <a className="btn" href="/login" style={{ textDecoration: "none" }}>Back to sign in</a>
          </>
        )}

        {state === "ready" && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>Choose a new password. At least 10 characters.</p>
            <div className="field">
              <label className="label" htmlFor="password">New password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="confirm">Repeat it</label>
              <input
                id="confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Set password and sign in"}
            </button>
            <p className="hint">Setting a new password signs out every other device.</p>
          </>
        )}
      </form>
    </main>
  );
}
