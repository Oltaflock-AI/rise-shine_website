"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { ControlField, DateField, controlClass } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/Button";
import { EMPTY_PROFILE, loadProfile, saveProfile, type Profile } from "@/lib/profile";
import { isDiallableIndianNumber, normalisePhone } from "@/lib/phone";
import { formatDate } from "@/lib/format-date";
import { todayInIndiaISO } from "@/lib/stay-dates";
import { Card, Empty, Saved } from "./ui";

/**
 * The account holder's own details.
 *
 * Read-only until "Edit" is pressed. These fields prefill a booking, so an
 * accidental keystroke while scrolling would show up later as a wrong name on a
 * ticket — which is a wasted fare, not a corrected field.
 *
 * Email is shown but not editable. Changing it means proving control of the new
 * address AND telling the old one, or an attacker with a borrowed session walks
 * off with the account. That is its own flow, not a text input.
 */
export function ProfileCard({ email }: { email: string }) {
  const [saved, setSaved] = useState<Profile>(EMPTY_PROFILE);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setSaved(p);
      setDraft(p);
      setReady(true);
    });
  }, []);

  async function onSave() {
    setError(null);
    if (!draft.full_name.trim()) return setError("Please enter your name.");
    const phone = normalisePhone(draft.phone);
    if (draft.phone && !isDiallableIndianNumber(phone))
      return setError("That mobile number doesn't look right.");

    setBusy(true);
    const next = { ...draft, phone: draft.phone ? phone : "" };
    const err = await saveProfile(next);
    setBusy(false);
    if (err) return setError(err);
    setSaved(next);
    setDraft(next);
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  }

  if (!ready) return <Card title="Your details"><Empty>Loading…</Empty></Card>;

  return (
    <Card
      title="Your details"
      action={
        !editing && (
          <button
            onClick={() => {
              setDraft(saved);
              setError(null);
              setEditing(true);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 text-body font-semibold text-red hover:underline"
          >
            <Pencil size={15} aria-hidden /> Edit
          </button>
        )
      }
    >
      {justSaved && <Saved />}

      {!editing ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Row label="Name" value={saved.full_name} />
          <Row label="Email" value={email} />
          <Row label="Mobile" value={saved.phone} />
          <Row label="Date of birth" value={saved.dob ? formatDate(saved.dob) : ""} />
          <Row label="GSTIN" value={saved.gstin ?? ""} hint="For a business invoice" />
        </dl>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ControlField label="Full name" required htmlFor="pf-name">
            <input
              id="pf-name"
              className={controlClass}
              value={draft.full_name}
              onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
              autoComplete="name"
            />
          </ControlField>

          <ControlField
            label="Email"
            htmlFor="pf-email"
            hint={
              <span className="mt-1 block text-meta text-muted">
                Contact us to change this.
              </span>
            }
          >
            <input id="pf-email" className={controlClass} value={email} disabled />
          </ControlField>

          <ControlField label="Mobile number" htmlFor="pf-phone">
            <input
              id="pf-phone"
              className={controlClass}
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              autoComplete="tel"
              placeholder="98765 43210"
            />
          </ControlField>

          <ControlField
            label="Date of birth"
            htmlFor="pf-dob"
            hint={
              <span className="mt-1 block text-meta text-muted">
                Airlines ask for this on most fares.
              </span>
            }
          >
            <DateField
              id="pf-dob"
              value={draft.dob ?? ""}
              onChange={(v) => setDraft({ ...draft, dob: v || null })}
              max={todayInIndiaISO()}
            />
          </ControlField>

          <ControlField label="GSTIN" htmlFor="pf-gstin">
            <input
              id="pf-gstin"
              className={controlClass}
              value={draft.gstin ?? ""}
              onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })}
              placeholder="Optional — for a business invoice"
            />
          </ControlField>

          {error && (
            <p className="rounded-lg bg-red/8 px-3.5 py-2.5 text-meta font-medium text-red-deep sm:col-span-2">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button onClick={onSave} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
              Save changes
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(saved);
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-meta font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-body text-ink">
        {value || <span className="text-muted">Not added{hint ? ` — ${hint.toLowerCase()}` : ""}</span>}
      </dd>
    </div>
  );
}
