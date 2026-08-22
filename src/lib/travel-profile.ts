import "server-only";

/**
 * Remember who a customer books for, so the next checkout is a pick rather than
 * a re-type.
 *
 * Called once a ticket is CONFIRMED (never from the form), alongside
 * saveBookingHistory. Everything here is best-effort and must never fail a paid
 * booking: each write is caught and logged. Guests (no session) are not saved.
 *
 * These rows are a prefill convenience only — `bookings` / `passengers` remain
 * the record of who actually flew, and TBO stays canonical. Editing the address
 * book later must not rewrite a past ticket, which is why they are separate
 * tables (see migrations/0008_saved_details.sql).
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import type { BookingPax, BookingRequest } from "@/lib/tbo-book";

/** Coerce to a Postgres `date` (YYYY-MM-DD) or null — never throws. */
function toDate(s?: string): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** Match key for a saved person: name + DOB, exactly what the unique index uses. */
const personKey = (first?: string | null, last?: string | null, dob?: string | null) =>
  `${norm(first)}|${norm(last)}|${dob ?? ""}`;

/** Match key for a saved address: street + city + PIN, as the unique index has it. */
const addressKey = (a1?: string | null, city?: string | null, pin?: string | null) =>
  `${norm(a1)}|${norm(city)}|${(pin ?? "").trim()}`;

type TravellerRow = {
  user_id: string;
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

function travellerFrom(userId: string, p: BookingPax): TravellerRow | null {
  const first = (p.FirstName ?? "").trim();
  const last = (p.LastName ?? "").trim();
  if (!first || !last) return null;
  return {
    user_id: userId,
    title: p.Title || null,
    first_name: first,
    last_name: last,
    pax_type: p.PaxType ?? 1,
    gender: p.Gender ?? null,
    dob: toDate(p.DateOfBirth),
    pan: p.PAN || null,
    passport_no: p.PassportNo || null,
    passport_expiry: toDate(p.PassportExpiry),
    passport_issue_date: toDate(p.PassportIssueDate),
    nationality: p.Nationality || null,
  };
}

/** Keep whatever we already knew when this booking omitted a field. */
function merged(row: TravellerRow, existing: Record<string, unknown>) {
  const out: Record<string, unknown> = { last_used_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(row)) {
    if (k === "user_id") continue;
    if (v !== null && v !== "") out[k] = v;
    else if (existing[k] == null) out[k] = v;
  }
  return out;
}

/**
 * The structured billing address as the checkout collected it. It travels
 * beside the TBO request rather than inside it: TBO's Passenger object has no
 * state or PIN field, so the form folds those into AddressLine2 — good enough
 * for a ticket, useless for prefilling the next one.
 */
export type BillingDetails = {
  phone?: string;
  email?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pin?: string;
  countryCode?: string;
  nationality?: string;
};

export async function saveTravelProfile(
  userId: string,
  req: BookingRequest,
  billing?: BillingDetails,
): Promise<void> {
  if (!supabaseAdminConfigured) return;
  const admin = createAdminClient();
  const nowISO = new Date().toISOString();

  // ── travellers ──
  const rows = req.passengers.map((p) => travellerFrom(userId, p)).filter((r): r is TravellerRow => r !== null);
  if (rows.length) {
    try {
      const { data: existing } = await admin
        .from("travellers")
        .select("id, first_name, last_name, dob, title, gender, pan, passport_no, passport_expiry, passport_issue_date, nationality")
        .eq("user_id", userId);

      const byKey = new Map(
        (existing ?? []).map((t) => [personKey(t.first_name, t.last_name, t.dob), t]),
      );

      for (const row of rows) {
        const hit = byKey.get(personKey(row.first_name, row.last_name, row.dob));
        // An existing traveller is topped up, never blanked: this booking may not
        // have asked for a passport the customer already gave us.
        const { error } = hit
          ? await admin.from("travellers").update(merged(row, hit)).eq("id", hit.id)
          : await admin.from("travellers").insert({ ...row, last_used_at: nowISO });
        if (error) console.error("[travel-profile] traveller write failed:", error.message);
      }
    } catch (e) {
      console.error("[travel-profile] travellers step failed:", e);
    }
  }

  // ── address book ──
  // The address is the booker's; the lead passenger is who carries it on the
  // ticket, but the structured version comes from the form (see BillingDetails).
  const lead = req.passengers.find((p) => p.IsLeadPax) ?? req.passengers[0];
  const address1 = (billing?.address1 ?? lead?.AddressLine1 ?? "").trim();
  if (!lead || !address1) return;

  const addr = {
    user_id: userId,
    phone: (billing?.phone ?? lead.ContactNo ?? "").trim() || null,
    email: (billing?.email ?? lead.Email ?? "").trim() || null,
    address1,
    address2: (billing?.address2 ?? "").trim() || null,
    city: (billing?.city ?? lead.City ?? "").trim() || null,
    state: (billing?.state ?? "").trim() || null,
    pin: (billing?.pin ?? "").trim() || null,
    country_code: billing?.countryCode || lead.CountryCode || "IN",
    nationality: billing?.nationality || lead.Nationality || null,
  };

  try {
    const { data: existing } = await admin
      .from("saved_addresses")
      .select("id, address1, city, pin")
      .eq("user_id", userId);
    const hit = (existing ?? []).find(
      (a) => addressKey(a.address1, a.city, a.pin) === addressKey(addr.address1, addr.city, addr.pin),
    );
    const { error } = hit
      ? await admin.from("saved_addresses").update({ ...addr, last_used_at: nowISO }).eq("id", hit.id)
      : await admin.from("saved_addresses").insert({ ...addr, last_used_at: nowISO });
    if (error) console.error("[travel-profile] address write failed:", error.message);
  } catch (e) {
    console.error("[travel-profile] address step failed:", e);
  }
}
