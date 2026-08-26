"use client";

/**
 * The customer's saved travellers and addresses — read, written and deleted in
 * the browser, for the checkout prefill pickers and the account page.
 *
 * RLS (migrations 0001 + 0008) is what scopes every one of these to the caller,
 * so there is nothing for a server route to add.
 *
 * **This module used to be read-only**, on the principle that a person is
 * remembered by actually flying, never by typing into a form — rows appeared
 * only after a confirmed ticket (lib/travel-profile). That was too strict in
 * practice: a customer with a passport expiring next month, or a name spelt
 * wrong on the first booking, had no way to fix it and would keep prefilling the
 * mistake into every future checkout. Editing is now allowed.
 *
 * What has NOT changed: these rows are a convenience copy for filling a form.
 * `bookings`/`passengers` remain the record of who actually flew, and TBO stays
 * canonical above both. Editing a saved traveller must never reach through to a
 * ticket that has already been issued — nothing here writes to those tables.
 */
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export type SavedTraveller = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  pax_type: number;
  gender: number | null;
  dob: string | null;
  pan: string | null;
  passport_no: string | null;
  passport_expiry: string | null;
  passport_issue_date: string | null;
  nationality: string | null;
};

export type SavedAddress = {
  id: string;
  label: string | null;
  phone: string | null;
  email: string | null;
  address1: string;
  address2: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  country_code: string;
  nationality: string | null;
};

const TRAVELLER_COLUMNS =
  "id, title, first_name, last_name, pax_type, gender, dob, pan, passport_no, passport_expiry, passport_issue_date, nationality";
const ADDRESS_COLUMNS =
  "id, label, phone, email, address1, address2, city, state, pin, country_code, nationality";

/** Most-recently-used first. Returns [] when Supabase is absent or the read fails. */
export async function loadSavedTravellers(): Promise<SavedTraveller[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await createClient()
    .from("travellers")
    .select(TRAVELLER_COLUMNS)
    .order("last_used_at", { ascending: false })
    .limit(20);
  return error ? [] : ((data ?? []) as unknown as SavedTraveller[]);
}

export async function loadSavedAddresses(): Promise<SavedAddress[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await createClient()
    .from("saved_addresses")
    .select(ADDRESS_COLUMNS)
    .order("last_used_at", { ascending: false })
    .limit(10);
  return error ? [] : ((data ?? []) as unknown as SavedAddress[]);
}

/** Forget a saved row. RLS refuses anything that is not the caller's own. */
export async function forgetSaved(table: "travellers" | "saved_addresses", id: string): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { error } = await createClient().from(table).delete().eq("id", id);
  return !error;
}

/** One-line summary of an address, for the picker card. */
export function addressSummary(a: SavedAddress): string {
  return [a.address1, a.address2, a.city, a.state, a.pin].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

// ── writes ───────────────────────────────────────────────────────────────────

/** The editable fields of a traveller. `id` absent means "create". */
export type TravellerDraft = Omit<SavedTraveller, "id"> & { id?: string };
export type AddressDraft = Omit<SavedAddress, "id"> & { id?: string };

/** Empty string → null, so a cleared optional field is stored as absent. */
function blankToNull<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && v.trim() === "") (out as Record<string, unknown>)[k] = null;
  }
  return out;
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user?.id ?? null;
}

/**
 * Create or update a saved traveller. Returns null on success, else a message.
 *
 * `user_id` is taken from the session, never from the caller: RLS would refuse a
 * forged one anyway, but sending it at all invites someone to try.
 *
 * A duplicate — same person, same date of birth — is an UPDATE rather than a
 * second row, enforced by the unique index in 0008. Without that, booking the
 * same family twice stacks duplicate chips in the checkout picker, and the
 * customer has to work out which of two identical names is the current one.
 */
export async function saveTraveller(draft: TravellerDraft): Promise<string | null> {
  if (!supabaseConfigured) return "Saved details aren't available right now.";
  const userId = await currentUserId();
  if (!userId) return "Please log in again.";

  const row = blankToNull({
    ...draft,
    user_id: userId,
    first_name: draft.first_name.trim(),
    last_name: draft.last_name.trim(),
    last_used_at: new Date().toISOString(),
  });

  // INSERT, not upsert. 0008's uniqueness lives in an expression index
  // (lower(first_name), lower(last_name), coalesce(dob, …)) and ON CONFLICT can
  // only target a constraint or a plain-column index — the same mismatch that
  // made the marketing opt-in fail silently (0011). A plain insert still raises
  // 23505 against an expression index, so the duplicate is caught, loudly.
  const { error } = draft.id
    ? await createClient().from("travellers").update(row).eq("id", draft.id)
    : await createClient().from("travellers").insert(row);

  if (error) {
    // 23505: the person already exists under a different row. Say so plainly
    // rather than leaving the customer to guess why Save did nothing.
    if (error.code === "23505") return "You've already saved someone with that name and date of birth.";
    return error.message;
  }
  return null;
}

/** Create or update a saved address. Returns null on success, else a message. */
export async function saveAddress(draft: AddressDraft): Promise<string | null> {
  if (!supabaseConfigured) return "Saved details aren't available right now.";
  const userId = await currentUserId();
  if (!userId) return "Please log in again.";
  if (!draft.address1.trim()) return "Please enter the address.";

  const row = blankToNull({
    ...draft,
    user_id: userId,
    address1: draft.address1.trim(),
    country_code: draft.country_code || "IN",
    last_used_at: new Date().toISOString(),
  });

  const { error } = draft.id
    ? await createClient().from("saved_addresses").update(row).eq("id", draft.id)
    : await createClient().from("saved_addresses").insert(row);

  if (error) {
    if (error.code === "23505") return "You've already saved that address.";
    return error.message;
  }
  return null;
}
