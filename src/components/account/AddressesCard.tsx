"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { ControlField, Select, controlClass } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/Button";
import {
  addressSummary,
  forgetSaved,
  loadSavedAddresses,
  saveAddress,
  type AddressDraft,
  type SavedAddress,
} from "@/lib/saved-details";
import { NATIONALITIES } from "@/data/nationalities";
import { Card, Empty, Saved } from "./ui";

/**
 * The booker's address book — billing address and contact details.
 *
 * Separate from travellers because an address belongs to whoever is paying, not
 * to each passenger, and one person legitimately has several: home, the office
 * one for a GST invoice, a parent's place.
 *
 * State and PIN are stored as their own fields even though TBO's Passenger
 * object has neither — the checkout folds them into AddressLine2 on the way out.
 * Storing the folded string instead would mean parsing it back apart to prefill,
 * which is guesswork on an address someone will be invoiced at.
 */

const BLANK: AddressDraft = {
  label: "Home",
  phone: null,
  email: null,
  address1: "",
  address2: null,
  city: null,
  state: null,
  pin: null,
  country_code: "IN",
  nationality: "IN",
};

export function AddressesCard() {
  const [rows, setRows] = useState<SavedAddress[] | null>(null);
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const refresh = () => loadSavedAddresses().then(setRows);
  useEffect(() => {
    refresh();
  }, []);

  async function onSave() {
    if (!draft) return;
    setError(null);
    setBusy(true);
    const err = await saveAddress(draft);
    setBusy(false);
    if (err) return setError(err);
    setDraft(null);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
    refresh();
  }

  async function onDelete(a: SavedAddress) {
    if (!window.confirm(`Remove this address?\n\n${addressSummary(a)}`)) return;
    await forgetSaved("saved_addresses", a.id);
    refresh();
  }

  return (
    <Card
      title="Saved addresses"
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
        Used for your billing address and invoice at checkout.
      </p>
      {justSaved && <Saved />}

      {draft && (
        <div className="mt-4 rounded-brand border border-line bg-cream/50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ControlField label="Label" htmlFor="ad-label">
              <input
                id="ad-label"
                className={controlClass}
                value={draft.label ?? ""}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Home, Office…"
              />
            </ControlField>

            <ControlField label="Mobile number" htmlFor="ad-phone">
              <input
                id="ad-phone"
                className={controlClass}
                type="tel"
                inputMode="tel"
                value={draft.phone ?? ""}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                autoComplete="tel"
              />
            </ControlField>

            <ControlField label="Address" required htmlFor="ad-1" className="sm:col-span-2">
              <input
                id="ad-1"
                className={controlClass}
                value={draft.address1}
                onChange={(e) => setDraft({ ...draft, address1: e.target.value })}
                autoComplete="address-line1"
                placeholder="Flat / building / street"
              />
            </ControlField>

            <ControlField label="Area, landmark" htmlFor="ad-2" className="sm:col-span-2">
              <input
                id="ad-2"
                className={controlClass}
                value={draft.address2 ?? ""}
                onChange={(e) => setDraft({ ...draft, address2: e.target.value })}
                autoComplete="address-line2"
              />
            </ControlField>

            <ControlField label="City" htmlFor="ad-city">
              <input
                id="ad-city"
                className={controlClass}
                value={draft.city ?? ""}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                autoComplete="address-level2"
              />
            </ControlField>

            <ControlField label="State" htmlFor="ad-state">
              <input
                id="ad-state"
                className={controlClass}
                value={draft.state ?? ""}
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                autoComplete="address-level1"
              />
            </ControlField>

            <ControlField label="PIN code" htmlFor="ad-pin">
              <input
                id="ad-pin"
                className={controlClass}
                inputMode="numeric"
                value={draft.pin ?? ""}
                onChange={(e) => setDraft({ ...draft, pin: e.target.value })}
                autoComplete="postal-code"
              />
            </ControlField>

            <ControlField label="Nationality" htmlFor="ad-nat">
              <Select
                id="ad-nat"
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

            {error && (
              <p className="rounded-lg bg-red/8 px-3.5 py-2.5 text-meta font-medium text-red-deep sm:col-span-2">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button onClick={onSave} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                {draft.id ? "Save changes" : "Add address"}
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
        <Empty>No addresses saved yet. Add one and checkout fills itself in.</Empty>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-brand border border-line px-4 py-3"
            >
              <MapPin size={18} className="flex-none text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{a.label || "Address"}</p>
                <p className="text-meta text-muted">{addressSummary(a)}</p>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setDraft({ ...a });
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink"
                aria-label={`Edit ${a.label || "address"}`}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(a)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-red/8 hover:text-red"
                aria-label={`Remove ${a.label || "address"}`}
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
