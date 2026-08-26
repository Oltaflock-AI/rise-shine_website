import "server-only";

/**
 * The offers list: who has consented, and how they get out.
 *
 * Service-role only — `marketing_contacts` has RLS on with no policies, because
 * the table is the customer list and a client-readable copy of it is a breach.
 *
 * The rule this file exists to enforce: a send is only ever addressed to rows
 * where `subscribed` is true, and every message carries that contact's own
 * token. Nothing here takes an address from a request body.
 */

import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

export interface Contact {
  email: string;
  name: string | null;
  token: string;
}

export const marketingConfigured = supabaseAdminConfigured;

/**
 * Record consent. Idempotent on the address.
 *
 * A returning contact who previously opted out is RE-subscribed only because
 * they have just asked again — that is what `subscribed: true` on conflict
 * means, and it is why this must never be called from anywhere the customer did
 * not actively tick something. Do not call it from the booking path: buying a
 * ticket is not consent to be marketed at.
 */
export async function subscribeContact(args: {
  email: string;
  name?: string;
  source: string;
}): Promise<void> {
  if (!marketingConfigured) return;
  const email = args.email.trim().toLowerCase();
  if (!email.includes("@")) return;

  // The error is READ, not discarded. This exact write failed silently once:
  // 0010's uniqueness lived in an index on lower(email), which ON CONFLICT
  // (email) cannot match, so every opt-in errored with 42P10 and a customer who
  // ticked the box was simply never added. Nothing in the logs, nothing in the
  // UI. Migration 0011 fixed the constraint; throwing here is what makes the
  // next such failure visible on the first attempt instead of the hundredth.
  const { error } = await createAdminClient()
    .from("marketing_contacts")
    .upsert(
      {
        email,
        name: args.name?.trim() || null,
        source: args.source,
        subscribed: true,
        unsubscribed_at: null,
      },
      { onConflict: "email" },
    );

  if (error) throw new Error(`marketing opt-in failed for ${email}: ${error.message}`);
}

/**
 * Honour an unsubscribe. Returns false only when the token is unknown.
 *
 * Never deletes the row. A deleted contact is one that a later import or an
 * accidental re-subscribe can bring back; a row marked `subscribed = false` is
 * a standing instruction that survives.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!marketingConfigured) return false;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;

  const { data, error } = await createAdminClient()
    .from("marketing_contacts")
    .update({ subscribed: false, unsubscribed_at: new Date().toISOString() })
    .eq("token", token)
    .select("id");

  return !error && (data?.length ?? 0) > 0;
}

/** Everyone currently consenting. */
export async function subscribedContacts(): Promise<Contact[]> {
  if (!marketingConfigured) return [];
  const { data, error } = await createAdminClient()
    .from("marketing_contacts")
    .select("email, name, token")
    .eq("subscribed", true);
  if (error) throw new Error(`marketing_contacts read failed: ${error.message}`);
  return (data ?? []) as Contact[];
}

/** The link that goes in the footer and in the List-Unsubscribe header. */
export function unsubscribeUrl(token: string, origin: string): string {
  return `${origin}/unsubscribe?t=${encodeURIComponent(token)}`;
}
