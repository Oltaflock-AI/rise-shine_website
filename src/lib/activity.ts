import "server-only";

/**
 * Customer activity log — the "what has this person been doing" half of the
 * admin dashboard's customer view (voice-agent/, migration 0018).
 *
 * One row per key action by a SIGNED-IN customer: a search rendering, a
 * checkout re-pricing, an order opening, a booking confirming or failing, an
 * enquiry delivering. Guests are never logged. There is deliberately no public
 * write route: every call sits in server code that already holds the verified
 * session, so nothing a browser sends can forge a row.
 *
 * Every write is best-effort and swallowed — the same contract as
 * saveBookingHistory. A CRM timeline must never fail a paid ticket.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

export const ACTIVITY_EVENTS = [
  "search_flights",
  "search_hotels",
  "view_hotel",
  "checkout_started",
  "payment_opened",
  "booking_confirmed",
  "booking_failed",
  "enquiry_sent",
  "callback_requested",
] as const;
export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

/**
 * The only prop keys a row may carry. A closed list, not a blocklist: the
 * timeline is read casually by the whole team, so nothing identifying beyond
 * what the event itself implies may ride along — no PAN, passport, email,
 * address or passenger names.
 */
export const ACTIVITY_PROP_KEYS = [
  "kind", // "flight" | "hotel"
  "from",
  "to",
  "city",
  "hotel",
  "depart",
  "return",
  "checkIn",
  "checkOut",
  "adults",
  "children",
  "infants",
  "rooms",
  "results",
  "amountInr",
  "orderId",
  "pnr",
  "ref",
  "context", // which form an enquiry came from
  "reason", // why a booking failed (rule name, never free text from TBO)
] as const;
export type ActivityPropKey = (typeof ACTIVITY_PROP_KEYS)[number];
export type ActivityProps = Partial<Record<ActivityPropKey, string | number | boolean | null | undefined>>;

const MAX_STRING = 120;

/**
 * Keep only whitelisted keys with scalar values; trim strings. Pure, so the
 * whitelist is testable without a database.
 */
export function sanitizeActivityProps(props: ActivityProps | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  for (const key of ACTIVITY_PROP_KEYS) {
    const v = props[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      const s = v.trim();
      if (s) out[key] = s.length > MAX_STRING ? s.slice(0, MAX_STRING) : s;
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) out[key] = v;
    } else if (typeof v === "boolean") {
      out[key] = v;
    }
  }
  return out;
}

export function isActivityEvent(value: unknown): value is ActivityEvent {
  return typeof value === "string" && (ACTIVITY_EVENTS as readonly string[]).includes(value);
}

/**
 * Log one event for a known user id. No-op for guests (null) and when the
 * service key is absent. Never throws.
 */
export async function logActivity(
  userId: string | null | undefined,
  event: ActivityEvent,
  props?: ActivityProps,
): Promise<void> {
  if (!userId || !supabaseAdminConfigured) return;
  try {
    const { error } = await createAdminClient()
      .from("customer_events")
      .insert({ user_id: userId, event, props: sanitizeActivityProps(props) });
    if (error) console.warn(`[activity] ${event} not logged: ${error.message}`);
  } catch (e) {
    console.warn(`[activity] ${event} not logged:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Log one event for whoever is signed in on the current request. Resolves the
 * user from the session cookie, so it works from route handlers, server
 * components and server actions; from anywhere without a request scope (a
 * cron) it quietly logs nothing.
 */
export async function logViewerActivity(event: ActivityEvent, props?: ActivityProps): Promise<void> {
  let userId: string | null = null;
  try {
    userId = (await getUser())?.id ?? null;
  } catch {
    return;
  }
  await logActivity(userId, event, props);
}

/** Retention promised in the privacy policy: 18 months. */
export const ACTIVITY_RETENTION_DAYS = 548;

/**
 * Delete events older than the retention window. Called from the settle cron
 * beside the booking-intents purge; failures are logged, never thrown.
 */
export async function purgeOldActivity(): Promise<void> {
  if (!supabaseAdminConfigured) return;
  const before = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await createAdminClient().from("customer_events").delete().lt("occurred_at", before);
    if (error) console.error("[activity] purge failed:", error.message);
  } catch (e) {
    console.error("[activity] purge failed:", e instanceof Error ? e.message : e);
  }
}
