"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { ControlField, controlClass } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/Button";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { Card, Saved } from "./ui";

/**
 * Change password from inside the account.
 *
 * The current password is required, and that is not a formality. Supabase's
 * `updateUser({ password })` will happily change it on the strength of the
 * session cookie alone — so without this check, anyone who reaches an unlocked
 * laptop, or replays a stolen session, changes the password and locks the real
 * owner out of their own bookings. Re-entering the current password is what
 * makes the change require knowledge, not just possession.
 *
 * It is verified by signing in with it, which is the only way to check a
 * password from the browser. That call replaces the current session with an
 * identical fresh one — harmless, since it is the same user — and fails
 * cleanly if the password is wrong.
 */
export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 6) return setError("New password must be at least 6 characters.");
    if (next !== confirm) return setError("The new passwords do not match.");
    if (next === current) return setError("That is already your password.");
    if (!supabaseConfigured) return setError("Accounts aren't available right now.");

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setBusy(false);
      return setError("Please log in again.");
    }

    const { error: wrong } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (wrong) {
      setBusy(false);
      return setError("That current password isn't right.");
    }

    const { error: failed } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (failed) return setError(failed.message);

    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <Card title="Password">
      <p className="mt-1.5 text-body text-muted">
        Choose something you&apos;ll remember. You&apos;ll stay signed in here.
      </p>
      {done && <Saved>Password changed</Saved>}

      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
        <ControlField label="Current password" required htmlFor="pw-current" className="sm:col-span-2">
          <div className="relative">
            <input
              id="pw-current"
              className={controlClass}
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
              aria-label={show ? "Hide passwords" : "Show passwords"}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </ControlField>

        <ControlField label="New password" required htmlFor="pw-new">
          <input
            id="pw-new"
            className={controlClass}
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            required
          />
        </ControlField>

        <ControlField label="Confirm new password" required htmlFor="pw-confirm">
          <input
            id="pw-confirm"
            className={controlClass}
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </ControlField>

        {error && (
          <p className="rounded-lg bg-red/8 px-3.5 py-2.5 text-meta font-medium text-red-deep sm:col-span-2">
            {error}
          </p>
        )}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
