"use client";

/**
 * The account holder's own details — name, mobile, date of birth, GSTIN.
 *
 * Read and written in the browser under RLS: `profiles` grants the owner select,
 * insert and update on their own row (0001), so there is nothing a server route
 * would add here.
 *
 * **Two stores, on purpose.** The display name and phone are ALSO in
 * `user_metadata`, because that rides in the JWT and `useAuth()` can show a name
 * in the header with no extra round trip. `profiles` is the queryable copy and
 * the home of everything metadata should not hold. Saving writes both, and this
 * module is the only place that knows that — do not update one without the
 * other, or the header will greet someone by a name their account no longer has.
 *
 * Nothing here touches `travellers`. A profile is who the ACCOUNT belongs to; a
 * traveller row is who actually flew on a given ticket. Editing the former must
 * never rewrite the latter.
 */

import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export type Profile = {
  full_name: string;
  phone: string;
  dob: string | null;
  gstin: string | null;
};

export const EMPTY_PROFILE: Profile = { full_name: "", phone: "", dob: null, gstin: null };

export async function loadProfile(): Promise<Profile> {
  if (!supabaseConfigured) return EMPTY_PROFILE;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_PROFILE;

  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone, dob, gstin")
    .eq("id", user.id)
    .maybeSingle();

  // Fall back to the signup metadata: an account created before 0009, or one
  // whose profile row was never provisioned, still has a name worth showing.
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; phone?: unknown };
  return {
    full_name:
      data?.full_name || (typeof meta.full_name === "string" ? meta.full_name : "") || "",
    phone: data?.phone || (typeof meta.phone === "string" ? meta.phone : "") || "",
    dob: data?.dob ?? null,
    gstin: data?.gstin ?? null,
  };
}

/**
 * Save the profile. Returns null on success, or a message to show the customer.
 *
 * Upserts rather than updates: the row is normally created by the
 * `on_auth_user_created` trigger, but an account that predates it has none, and
 * a bare update would silently affect zero rows and report success.
 */
export async function saveProfile(p: Profile): Promise<string | null> {
  if (!supabaseConfigured) return "Accounts aren't available right now.";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Please log in again.";

  const row = {
    id: user.id,
    full_name: p.full_name.trim(),
    phone: p.phone.trim(),
    dob: p.dob || null,
    gstin: p.gstin?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "id" });
  if (error) {
    // The DOB CHECK (0012) rejects a future date or a mis-keyed year. Say which
    // field is wrong rather than showing the customer a Postgres error.
    if (error.code === "23514") return "That date of birth doesn't look right.";

    // PGRST204: a column this code writes does not exist yet — i.e. the deploy
    // landed before migration 0012 ran. A narrow window, but during it every
    // save fails, and the raw message ("Could not find the 'dob' column of
    // 'profiles' in the schema cache") is not something to show a customer.
    if (error.code === "PGRST204") {
      console.error("[profile] schema is behind the code:", error.message);
      return "We can't save changes just now. Please try again shortly.";
    }
    return error.message;
  }

  // Keep the JWT copy in step — see the note at the top of this file.
  await supabase.auth.updateUser({
    data: { full_name: row.full_name, phone: row.phone },
  });

  return null;
}
