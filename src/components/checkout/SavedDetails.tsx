"use client";

/**
 * Prefill pickers for a returning customer: the travellers they have flown with
 * and the addresses they have billed to before (lib/saved-details).
 *
 * A pick only FILLS the form — it never books and never edits the saved row.
 * The customer still sees, and can correct, every field before paying, which
 * matters because a name has to match the ID at the airport.
 */
import { Check, UserRound, X } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { addressSummary, type SavedAddress, type SavedTraveller } from "@/lib/saved-details";

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-ink transition hover:border-red hover:text-red";

export function SavedTravellerPicker({
  travellers,
  onPick,
  onForget,
}: {
  travellers: SavedTraveller[];
  onPick: (t: SavedTraveller) => void;
  onForget: (t: SavedTraveller) => void;
}) {
  if (!travellers.length) return null;
  return (
    <div className="mb-4 rounded-brand bg-cream-2 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-muted">
        <UserRound size={13} aria-hidden /> Use a saved traveller
      </p>
      <ul className="flex flex-wrap gap-2">
        {travellers.map((t) => (
          <li key={t.id} className="flex items-center">
            <button type="button" className={chip} onClick={() => onPick(t)}>
              {[t.title, t.first_name, t.last_name].filter(Boolean).join(" ")}
              {t.dob && <span className="font-normal text-muted">{formatDate(t.dob)}</span>}
            </button>
            <button
              type="button"
              onClick={() => onForget(t)}
              aria-label={`Forget ${t.first_name} ${t.last_name}`}
              className="-ml-1 grid h-6 w-6 place-items-center rounded-full text-muted transition hover:text-red"
            >
              <X size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SavedAddressPicker({
  addresses,
  selectedId,
  onPick,
  onNew,
  onForget,
}: {
  addresses: SavedAddress[];
  selectedId: string | null;
  onPick: (a: SavedAddress) => void;
  onNew: () => void;
  onForget: (a: SavedAddress) => void;
}) {
  if (!addresses.length) return null;
  return (
    <div className="mb-4 rounded-brand bg-cream-2 p-3">
      <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-muted">
        Saved addresses
      </p>
      <ul className="grid gap-2">
        {addresses.map((a) => {
          const on = a.id === selectedId;
          return (
            <li key={a.id} className="flex items-start gap-1">
              <button
                type="button"
                onClick={() => onPick(a)}
                aria-pressed={on}
                className={`flex-1 rounded-brand border px-3 py-2 text-left text-[0.82rem] transition ${
                  on ? "border-red bg-white text-ink" : "border-line bg-white text-muted hover:border-red"
                }`}
              >
                <span className="flex items-start gap-2">
                  {on && <Check size={14} className="mt-0.5 flex-none text-red" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{addressSummary(a)}</span>
                    {(a.phone || a.email) && (
                      <span className="block text-[0.75rem] text-muted">
                        {[a.phone, a.email].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onForget(a)}
                aria-label="Forget this address"
                className="mt-2 grid h-6 w-6 flex-none place-items-center rounded-full text-muted transition hover:text-red"
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onNew}
        className={`${chip} mt-2 ${selectedId ? "" : "border-red text-red"}`}
      >
        Enter a new address
      </button>
    </div>
  );
}
