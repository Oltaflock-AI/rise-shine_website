"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { ControlField, DateField, Select, controlClass } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/Button";
import {
  forgetSaved,
  loadSavedTravellers,
  saveTraveller,
  type SavedTraveller,
  type TravellerDraft,
} from "@/lib/saved-details";
import { formatDate } from "@/lib/format-date";
import { todayInIndiaISO } from "@/lib/stay-dates";
import { NATIONALITIES } from "@/data/nationalities";
import { Card, Empty, Saved } from "./ui";

/**
 * The people this customer books for.
 *
 * These rows prefill checkout, so what is stored has to match a passport
 * exactly. TBO only accepts MR/MRS/MS/MSTR, and titles are stored upper-case and
 * shown cased — the option VALUE stays the code (see the site-wide rule); do not
 * "fix" the display by changing it.
 *
 * Deleting a traveller removes a prefill and nothing else. The passenger rows on
 * an issued ticket live in `passengers` and are the record of who actually flew;
 * they are untouched by anything on this page.
 */

const TITLES = [
  { value: "MR", label: "Mr" },
  { value: "MRS", label: "Mrs" },
  { value: "MS", label: "Ms" },
  { value: "MSTR", label: "Mstr" },
];

const BLANK: TravellerDraft = {
  title: "MR",
  first_name: "",
  last_name: "",
  pax_type: 1,
  gender: 1,
  dob: null,
  pan: null,
  passport_no: null,
  passport_expiry: null,
  passport_issue_date: null,
  nationality: "IN",
};

export function TravellersCard() {
  const [rows, setRows] = useState<SavedTraveller[] | null>(null);
  const [draft, setDraft] = useState<TravellerDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const refresh = () => loadSavedTravellers().then(setRows);
  useEffect(() => {
    refresh();
  }, []);

  async function onSave() {
    if (!draft) return;
    setError(null);
    if (!draft.first_name.trim() || !draft.last_name.trim())
      return setError("Please enter both names, exactly as printed on the passport or ID.");

    setBusy(true);
    const err = await saveTraveller(draft);
    setBusy(false);
    if (err) return setError(err);
    setDraft(null);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
    refresh();
  }

  async function onDelete(t: SavedTraveller) {
    if (!window.confirm(`Remove ${t.first_name} ${t.last_name} from your saved travellers?`)) return;
    await forgetSaved("travellers", t.id);
    refresh();
  }

  return (
    <Card
      title="Saved travellers"
      action={
        !draft && (
          <button
            onClick={() => {
              setError(null);
              setDraft({ ...BLANK });
            }}
            className="inline-flex min-h-11 items-center gap-1.5 text-body font-semibold text-red hover:underline"
          >
            <Plus size={16} aria-hidden /> Add
          </button>
        )
      }
    >
      <p className="mt-1.5 text-body text-muted">
        Saved once, filled in for you at every checkout. Names must match the passport
        or photo ID exactly.
      </p>
      {justSaved && <Saved />}

      {draft && (
        <div className="mt-4 rounded-brand border border-line bg-cream/50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ControlField label="Title" htmlFor="tv-title">
              <Select
                id="tv-title"
                value={draft.title ?? "MR"}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              >
                {TITLES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </ControlField>

            <ControlField label="Traveller type" htmlFor="tv-type">
              <Select
                id="tv-type"
                value={String(draft.pax_type)}
                onChange={(e) => setDraft({ ...draft, pax_type: Number(e.target.value) })}
              >
                <option value="1">Adult (12+)</option>
                <option value="2">Child (2–11)</option>
                <option value="3">Infant (under 2)</option>
              </Select>
            </ControlField>

            <ControlField label="First name" required htmlFor="tv-first">
              <input
                id="tv-first"
                className={controlClass}
                value={draft.first_name}
                onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
                autoComplete="given-name"
              />
            </ControlField>

            <ControlField label="Last name" required htmlFor="tv-last">
              <input
                id="tv-last"
                className={controlClass}
                value={draft.last_name}
                onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
                autoComplete="family-name"
              />
            </ControlField>

            <ControlField label="Gender" htmlFor="tv-gender">
              <Select
                id="tv-gender"
                value={String(draft.gender ?? 1)}
                onChange={(e) => setDraft({ ...draft, gender: Number(e.target.value) })}
              >
                <option value="1">Male</option>
                <option value="2">Female</option>
              </Select>
            </ControlField>

            <ControlField label="Date of birth" htmlFor="tv-dob">
              <DateField
                id="tv-dob"
                value={draft.dob ?? ""}
                onChange={(v) => setDraft({ ...draft, dob: v || null })}
                max={todayInIndiaISO()}
              />
            </ControlField>

            <ControlField label="Nationality" htmlFor="tv-nat">
              <Select
                id="tv-nat"
                value={draft.nationality ?? "IN"}
                onChange={(e) => setDraft({ ...draft, nationality: e.target.value })}
              >
                {NATIONALITIES.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </ControlField>

            <ControlField
              label="PAN"
              htmlFor="tv-pan"
              hint={<span className="mt-1 block text-meta text-muted">Needed on some international fares.</span>}
            >
              <input
                id="tv-pan"
                className={controlClass}
                value={draft.pan ?? ""}
                onChange={(e) => setDraft({ ...draft, pan: e.target.value.toUpperCase() })}
                placeholder="Optional"
              />
            </ControlField>

            <ControlField label="Passport number" htmlFor="tv-pp">
              <input
                id="tv-pp"
                className={controlClass}
                value={draft.passport_no ?? ""}
                onChange={(e) => setDraft({ ...draft, passport_no: e.target.value.toUpperCase() })}
                placeholder="Optional"
              />
            </ControlField>

            <ControlField label="Passport expiry" htmlFor="tv-ppx">
              <DateField
                id="tv-ppx"
                value={draft.passport_expiry ?? ""}
                onChange={(v) => setDraft({ ...draft, passport_expiry: v || null })}
                min={todayInIndiaISO()}
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
                {draft.id ? "Save changes" : "Add traveller"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {rows === null ? (
        <Empty>Loading…</Empty>
      ) : rows.length === 0 && !draft ? (
        <Empty>
          Nobody saved yet. Anyone you book for gets added automatically after their first
          trip — or add them now.
        </Empty>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-brand border border-line px-4 py-3"
            >
              <UserRound size={18} className="flex-none text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">
                  {[TITLES.find((x) => x.value === t.title)?.label, t.first_name, t.last_name]
                    .filter(Boolean)
                    .join(" ")}
                </p>
                <p className="text-meta text-muted">
                  {[
                    t.dob ? formatDate(t.dob) : null,
                    t.passport_no ? `Passport ${t.passport_no}` : null,
                    t.pan ? `PAN ${t.pan}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No documents saved"}
                </p>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setDraft({ ...t });
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink"
                aria-label={`Edit ${t.first_name} ${t.last_name}`}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(t)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-red/8 hover:text-red"
                aria-label={`Remove ${t.first_name} ${t.last_name}`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
