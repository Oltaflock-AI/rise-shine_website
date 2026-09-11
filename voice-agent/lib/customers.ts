// The customer directory: every account on the main site, what they bought and
// what they have been doing. SERVER ONLY (service-role reads).
//
// READ-ONLY by design. Nothing in this file writes, and nothing in the
// dashboard should: `profiles` / `bookings` / `passengers` are the customer's
// own record on the main site and TBO stays canonical above them. A team
// member who needs to change a customer's phone does it by asking the
// customer to edit their account.
//
// PAN and passport numbers are masked HERE, before a page ever sees them.
// The full value never leaves this module.

import { serviceClient } from "./supabase";
import { maskPan, maskPassport } from "./mask";

// ── Directory (one row per account; see migration 0018 customer_directory) ──

export interface CustomerRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  dob: string | null;
  gstin: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  booking_count: number;
  total_spent_inr: number;
  last_booked_at: string | null;
  last_trip_date: string | null;
  last_trip_label: string | null;
  last_trip_kind: "flight" | "hotel" | null;
  last_event_at: string | null;
  event_count: number;
  last_active_at: string;
}

export type CustomerSort = "active" | "newest" | "spent" | "name";

const SORTS: Record<CustomerSort, { column: keyof CustomerRow; ascending: boolean }> = {
  active: { column: "last_active_at", ascending: false },
  newest: { column: "signed_up_at", ascending: false },
  spent: { column: "total_spent_inr", ascending: false },
  name: { column: "full_name", ascending: true },
};

export function isCustomerSort(v: unknown): v is CustomerSort {
  return typeof v === "string" && v in SORTS;
}

export const PAGE_SIZE = 50;

/**
 * Escape the characters PostgREST's `ilike` treats specially. A search typed
 * by a team member is data, never a pattern.
 */
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_,()]/g, (c) => `\\${c}`)}%`;
}

export async function listCustomers(opts: { q?: string; page?: number; sort?: CustomerSort }): Promise<{
  rows: CustomerRow[];
  total: number;
  page: number;
  error: string | null;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const sort = SORTS[opts.sort ?? "active"];
  const from = (page - 1) * PAGE_SIZE;

  let query = serviceClient()
    .from("customer_directory")
    .select("*", { count: "exact" })
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const q = (opts.q ?? "").trim();
  if (q) {
    const term = likeTerm(q);
    query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
  }

  const { data, count, error } = await query;
  if (error) return { rows: [], total: 0, page, error: error.message };
  return { rows: (data ?? []) as CustomerRow[], total: count ?? 0, page, error: null };
}

/** Headline numbers for the list page's KPI strip. */
export async function customerStats(): Promise<{
  accounts: number;
  buyers: number;
  bookingsThisMonth: number;
  revenueThisMonthInr: number;
  error: string | null;
}> {
  const sb = serviceClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [accounts, buyers, month] = await Promise.all([
    sb.from("customer_directory").select("id", { count: "exact", head: true }),
    sb.from("customer_directory").select("id", { count: "exact", head: true }).gt("booking_count", 0),
    sb
      .from("bookings")
      .select("kind, status, amount_paid_inr, fare_inr")
      .gte("created_at", monthStart.toISOString()),
  ]);

  const err = accounts.error ?? buyers.error ?? month.error;
  const confirmed = (month.data ?? []).filter((b) => b.kind === "hotel" || b.status === 5);
  return {
    accounts: accounts.count ?? 0,
    buyers: buyers.count ?? 0,
    bookingsThisMonth: confirmed.length,
    revenueThisMonthInr: confirmed.reduce((s, b) => s + (b.amount_paid_inr ?? b.fare_inr ?? 0), 0),
    error: err ? err.message : null,
  };
}

// ── One customer, everything ──────────────────────────────────────────────

export interface CustomerBooking {
  id: string;
  kind: "flight" | "hotel";
  created_at: string;
  status: number | null;
  label: string; // "AMD → DXB" or the hotel name
  sub: string | null; // airline + flight no, or city
  start: string | null; // depart / check-in
  end: string | null; // return / check-out
  ref: string | null; // PNR or confirmation no
  ticket_numbers: string[] | null;
  fare_inr: number | null;
  amount_paid_inr: number | null;
  cf_order_id: string | null;
  passengers: {
    name: string;
    pax_type: number | null;
    is_lead: boolean;
    ticket_number: string | null;
    pan: string | null; // masked
    passport_no: string | null; // masked
  }[];
}

export interface CustomerPayment {
  cf_payment_id: string;
  cf_order_id: string | null;
  status: string;
  amount_inr: number | null;
  method: string | null;
  created_at: string;
  refunded_at: string | null;
}

export interface CustomerTraveller {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  pax_type: number;
  dob: string | null;
  nationality: string | null;
  pan: string | null; // masked
  passport_no: string | null; // masked
  passport_expiry: string | null;
  last_used_at: string;
}

export interface CustomerAddress {
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
  last_used_at: string;
}

export interface CustomerEnquiry {
  id: string;
  package_key: string | null;
  destination: string | null;
  message: string | null;
  created_at: string;
}

export interface CustomerEvent {
  id: number;
  event: string;
  props: Record<string, string | number | boolean>;
  occurred_at: string;
}

export interface CustomerCall {
  conversation_id: string;
  summary: string | null;
  qualified: boolean | null;
  destination: string | null;
  started_at: string | null;
  call_successful: string | null;
}

export interface CustomerCallback {
  id: string;
  status: string;
  source: string | null;
  attempts: number;
  created_at: string;
}

export interface CustomerDetail {
  customer: CustomerRow;
  marketing: { subscribed: boolean; source: string | null } | null;
  bookings: CustomerBooking[];
  payments: CustomerPayment[];
  travellers: CustomerTraveller[];
  addresses: CustomerAddress[];
  enquiries: CustomerEnquiry[];
  events: CustomerEvent[];
  calls: CustomerCall[];
  callbacks: CustomerCallback[];
  /** Per-section read failures, so one broken table degrades one panel, not the page. */
  warnings: string[];
}

type RawBooking = {
  id: string;
  kind: string | null;
  created_at: string;
  status: number | null;
  origin: string | null;
  destination: string | null;
  depart_date: string | null;
  return_date: string | null;
  airline_code: string | null;
  flight_number: string | null;
  pnr: string | null;
  ticket_numbers: string[] | null;
  fare_inr: number | null;
  amount_paid_inr: number | null;
  cf_order_id: string | null;
  hotel_name: string | null;
  city: string | null;
  check_in: string | null;
  check_out: string | null;
  confirmation_no: string | null;
  passengers:
    | {
        title: string | null;
        first_name: string | null;
        last_name: string | null;
        pax_type: number | null;
        is_lead: boolean | null;
        ticket_number: string | null;
        pan: string | null;
        passport_no: string | null;
      }[]
    | null;
};

function shapeBooking(b: RawBooking): CustomerBooking {
  const hotel = b.kind === "hotel";
  return {
    id: b.id,
    kind: hotel ? "hotel" : "flight",
    created_at: b.created_at,
    status: b.status,
    label: hotel ? b.hotel_name ?? b.city ?? "Hotel" : `${b.origin ?? "?"} → ${b.destination ?? "?"}`,
    sub: hotel ? b.city : [b.airline_code, b.flight_number].filter(Boolean).join(" ") || null,
    start: hotel ? b.check_in : b.depart_date,
    end: hotel ? b.check_out : b.return_date,
    ref: hotel ? b.confirmation_no : b.pnr,
    ticket_numbers: b.ticket_numbers,
    fare_inr: b.fare_inr,
    amount_paid_inr: b.amount_paid_inr,
    cf_order_id: b.cf_order_id,
    passengers: (b.passengers ?? []).map((p) => ({
      name: [p.title, p.first_name, p.last_name].filter(Boolean).join(" "),
      pax_type: p.pax_type,
      is_lead: p.is_lead === true,
      ticket_number: p.ticket_number,
      pan: maskPan(p.pan),
      passport_no: maskPassport(p.passport_no),
    })),
  };
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const sb = serviceClient();
  const warnings: string[] = [];
  const warn = (what: string, e: { message: string } | null) => {
    if (e) warnings.push(`${what}: ${e.message}`);
  };

  const head = await sb.from("customer_directory").select("*").eq("id", id).maybeSingle();
  if (head.error) throw new Error(`customer_directory read failed: ${head.error.message}`);
  if (!head.data) return null;
  const customer = head.data as CustomerRow;

  const [bookings, travellers, addresses, enquiries, events, marketing] = await Promise.all([
    sb
      .from("bookings")
      .select(
        "id, kind, created_at, status, origin, destination, depart_date, return_date, airline_code, flight_number, pnr, ticket_numbers, fare_inr, amount_paid_inr, cf_order_id, hotel_name, city, check_in, check_out, confirmation_no, passengers (title, first_name, last_name, pax_type, is_lead, ticket_number, pan, passport_no)",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("travellers")
      .select("id, title, first_name, last_name, pax_type, dob, nationality, pan, passport_no, passport_expiry, last_used_at")
      .eq("user_id", id)
      .order("last_used_at", { ascending: false }),
    sb
      .from("saved_addresses")
      .select("id, label, phone, email, address1, address2, city, state, pin, country_code, last_used_at")
      .eq("user_id", id)
      .order("last_used_at", { ascending: false }),
    sb
      .from("enquiries")
      .select("id, package_key, destination, message, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("customer_events")
      .select("id, event, props, occurred_at")
      .eq("user_id", id)
      .order("occurred_at", { ascending: false })
      .limit(300),
    customer.email
      ? sb.from("marketing_contacts").select("subscribed, source").ilike("email", customer.email).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  warn("bookings", bookings.error);
  warn("travellers", travellers.error);
  warn("addresses", addresses.error);
  warn("enquiries", enquiries.error);
  warn("activity", events.error);
  warn("marketing", marketing.error);

  const shapedBookings = ((bookings.data ?? []) as RawBooking[]).map(shapeBooking);

  // Payments have no user_id — they hang off the booking's Cashfree order.
  const orderIds = shapedBookings.map((b) => b.cf_order_id).filter((x): x is string => !!x);
  const payments = orderIds.length
    ? await sb
        .from("payments")
        .select("cf_payment_id, cf_order_id, status, amount_inr, method, created_at, refunded_at")
        .in("cf_order_id", orderIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  warn("payments", payments.error);

  // Voice: both halves join on the profile phone (E.164 on every side).
  const phone = customer.phone?.trim();
  const [calls, callbacks] = phone
    ? await Promise.all([
        sb
          .from("voice_calls")
          .select("conversation_id, summary, qualified, destination, started_at, call_successful")
          .eq("lead_phone", phone)
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(50),
        sb
          .from("callback_queue")
          .select("id, status, source, attempts, created_at")
          .eq("phone", phone)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  warn("voice calls", calls.error);
  warn("callbacks", callbacks.error);

  return {
    customer,
    marketing: marketing.data
      ? { subscribed: Boolean(marketing.data.subscribed), source: marketing.data.source ?? null }
      : null,
    bookings: shapedBookings,
    payments: (payments.data ?? []) as CustomerPayment[],
    travellers: ((travellers.data ?? []) as CustomerTraveller[]).map((t) => ({
      ...t,
      pan: maskPan(t.pan),
      passport_no: maskPassport(t.passport_no),
    })),
    addresses: (addresses.data ?? []) as CustomerAddress[],
    enquiries: (enquiries.data ?? []) as CustomerEnquiry[],
    events: (events.data ?? []) as CustomerEvent[],
    calls: (calls.data ?? []) as CustomerCall[],
    callbacks: (callbacks.data ?? []) as CustomerCallback[],
    warnings,
  };
}
