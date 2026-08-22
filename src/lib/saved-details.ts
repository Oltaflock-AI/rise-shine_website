"use client";

/**
 * Read the customer's saved travellers and addresses in the browser, for the
 * checkout prefill pickers.
 *
 * These are the rows lib/travel-profile wrote after a previous confirmed
 * ticket. Reads and deletes go straight through the Supabase browser client:
 * RLS (migrations/0001 + 0008) is what scopes them to the caller, so there is
 * nothing for a server route to add. Nothing here writes — a person is only
 * ever remembered by actually flying, never by typing into a form.
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
