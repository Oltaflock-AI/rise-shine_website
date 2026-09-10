"use client";

import { useEffect, useRef } from "react";
import { NATIONALITIES } from "@/data/nationalities";
import { INDIAN_STATES } from "@/data/indian-states";
import { canonicalState, type PincodePlace } from "@/lib/pincode";
import { controlClass, controlLabelClass, Select } from "@/components/ui/form-controls";
import type { SavedAddress } from "@/lib/saved-details";

/**
 * The structured billing address both checkouts collect. It is what the GST
 * invoice and the customer's address book need; TBO itself only ever sees a
 * flattened version (flights) or nothing at all (hotels — HotelPassenger has no
 * address field), so the shape is ours to keep stable.
 */
export type BillingAddress = {
  address1: string;
  address2: string;
  city: string;
  state: string;
  pin: string;
  countryCode: string;
};

/** Ahmedabad is where most guests book from; a PIN lookup replaces it anyway. */
export const DEFAULT_CITY = "Ahmedabad";

export function blankBillingAddress(): BillingAddress {
  return {
    address1: "",
    address2: "",
    city: DEFAULT_CITY,
    state: "",
    pin: "",
    countryCode: "IN",
  };
}

/** A saved row as the form holds it. Blank fields stay blank, not "null". */
export function billingFromSaved(a: SavedAddress): BillingAddress {
  return {
    address1: a.address1 ?? "",
    address2: a.address2 ?? "",
    city: a.city ?? "",
    // Saved rows predate the dropdown; "gujarat" must still select Gujarat.
    state: canonicalState(a.state) || (a.state ?? ""),
    pin: a.pin ?? "",
    countryCode: a.country_code || "IN",
  };
}

/** India posts 6-digit PINs; elsewhere the code is free-form, so only length is checked. */
export function pinIsValid(a: Pick<BillingAddress, "pin" | "countryCode">): boolean {
  return a.countryCode === "IN"
    ? /^\d{6}$/.test(a.pin.trim())
    : a.pin.trim().length >= 3;
}

/** First problem with the address, or null when it is complete. */
export function billingAddressError(a: BillingAddress): string | null {
  if (!a.address1.trim()) return "Enter the billing address (line 1).";
  if (!a.city.trim()) return "Enter the billing city.";
  if (!pinIsValid(a))
    return a.countryCode === "IN"
      ? "Enter a 6-digit PIN code for the billing address."
      : "Enter a postal code for the billing address.";
  return null;
}

/**
 * Address line 1 → country as grid cells. Renders INSIDE the host's
 * `grid sm:grid-cols-2`, so each host can put its own phone / email /
 * nationality cells around it.
 *
 * A 6-digit Indian PIN identifies the city and state, so both are looked up and
 * filled. State is always overwritten — it is a function of the PIN. City is only
 * overwritten while it still holds a value WE put there (the default or an
 * earlier lookup): a city the guest typed is never clobbered, because a PIN can
 * straddle districts and the guest knows where they live.
 */
export function BillingAddressFields({
  value,
  onChange,
}: {
  value: BillingAddress;
  onChange: (patch: Partial<BillingAddress>) => void;
}) {
  const autoCity = useRef<string>(value.city);
  // The lookup resolves later than the render it started in; apply it against
  // the value and onChange of THAT moment, not the ones the fetch captured.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  const { pin, countryCode } = value;
  useEffect(() => {
    if (countryCode !== "IN" || !/^\d{6}$/.test(pin)) return;
    const ctrl = new AbortController();
    fetch(`/api/pincode?pin=${pin}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { ok?: boolean; place?: PincodePlace | null } | null) => {
        const place = body?.place;
        if (!place || ctrl.signal.aborted) return;
        const current = latest.current.value;
        if (current.pin !== pin) return; // the guest kept typing
        const cityIsOurs =
          current.city.trim() === "" || current.city === autoCity.current;
        const patch: Partial<BillingAddress> = { state: place.state };
        if (cityIsOurs && place.city) {
          autoCity.current = place.city;
          patch.city = place.city;
        }
        latest.current.onChange(patch);
      })
      .catch(() => {
        /* directory down or slow — the guest types it, nothing else changes */
      });
    return () => ctrl.abort();
  }, [pin, countryCode]);

  const label = controlLabelClass;
  const field = controlClass;
  const isIndia = countryCode === "IN";
  const valid = pinIsValid(value);

  return (
    <>
      <div className="sm:col-span-2">
        <label className={label}>
          Address line 1 <span className="text-red">*</span>
        </label>
        <input
          className={field}
          value={value.address1}
          autoComplete="address-line1"
          autoCapitalize="words"
          maxLength={64}
          onChange={(e) => onChange({ address1: e.target.value })}
          placeholder="Flat / house no., building, street"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Address line 2</label>
        <input
          className={field}
          value={value.address2}
          autoComplete="address-line2"
          autoCapitalize="words"
          maxLength={64}
          onChange={(e) => onChange({ address2: e.target.value })}
          placeholder="Area, locality, landmark (optional)"
        />
      </div>
      <div>
        <label className={label}>
          PIN / postal code <span className="text-red">*</span>
        </label>
        <input
          className={field}
          inputMode={isIndia ? "numeric" : "text"}
          autoComplete="postal-code"
          maxLength={10}
          value={value.pin}
          onChange={(e) =>
            onChange({
              pin: isIndia
                ? e.target.value.replace(/\D/g, "").slice(0, 6)
                : e.target.value,
            })
          }
          placeholder={isIndia ? "380015" : "Postal code"}
        />
        {value.pin.trim() !== "" && !valid && (
          <p className="mt-1 text-[0.82rem] font-medium text-red">
            {isIndia
              ? "An Indian PIN code is exactly 6 digits."
              : "Enter a valid postal code."}
          </p>
        )}
      </div>
      <div>
        <label className={label}>
          City <span className="text-red">*</span>
        </label>
        <input
          className={field}
          value={value.city}
          autoComplete="address-level2"
          autoCapitalize="words"
          maxLength={32}
          onChange={(e) => onChange({ city: e.target.value })}
          placeholder="Ahmedabad"
        />
      </div>
      <div>
        <label className={label}>State</label>
        {isIndia ? (
          <Select
            value={value.state}
            autoComplete="address-level1"
            onChange={(e) => onChange({ state: e.target.value })}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : (
          <input
            className={field}
            value={value.state}
            autoComplete="address-level1"
            autoCapitalize="words"
            maxLength={32}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="State / province"
          />
        )}
      </div>
      <div>
        <label className={label}>
          Country <span className="text-red">*</span>
        </label>
        <Select
          value={countryCode}
          autoComplete="country"
          onChange={(e) =>
            // A PIN and a state belong to one country; neither carries across.
            onChange({ countryCode: e.target.value, pin: "", state: "" })
          }
        >
          {NATIONALITIES.map((n) => (
            <option key={n.code} value={n.code}>
              {n.label}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}
