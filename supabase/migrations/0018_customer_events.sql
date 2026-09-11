-- Rise & Shine Travels — customer activity log + the admin dashboard's
-- customer directory
--
-- The admin dashboard (voice-agent/, admin.riseandshinetravel.com) needs one
-- answer per account holder: who they are, what they bought, and what they have
-- been doing on the site. Everything but the last part already exists in
-- auth.users / profiles / bookings; this adds the activity log and a view that
-- rolls the lot up into one row per customer for the list page.
--
-- The `customer_events` half was run by hand in the SQL editor on 2026-09-11
-- before this file existed. Every statement here is idempotent so re-running
-- it against that database is a no-op, and a fresh database gets the same
-- shape.

-- ─────────────────────────────────────────────────────────────────────────────
-- customer_events — key actions by SIGNED-IN customers
-- ─────────────────────────────────────────────────────────────────────────────
-- Written server-side only (lib/activity.ts, service role), from code paths
-- that already hold the verified session: a search page rendering, a checkout
-- re-price, an order opening, a ticket issuing, an enquiry delivering. Guests
-- are never logged, and there is no public write route — a browser-writable
-- log is a CRM anyone can forge into.
--
-- `props` is a small whitelisted bag (route, dates, pax, amount, kind). Never
-- PAN, passport, email or address: those live in their own tables under RLS,
-- and a timeline is read far more casually than a booking record.
create table if not exists public.customer_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists customer_events_user_idx
  on public.customer_events (user_id, occurred_at desc);
create index if not exists customer_events_event_idx
  on public.customer_events (event, occurred_at desc);

alter table public.customer_events enable row level security;
-- No policies on purpose: only the service role (server code, the dashboard)
-- reads or writes this. A customer does not see their own timeline.

-- ─────────────────────────────────────────────────────────────────────────────
-- customer_directory — one row per account, for the dashboard's list page
-- ─────────────────────────────────────────────────────────────────────────────
-- Joins auth.users (email, signup, last sign-in) to profiles and to booking /
-- activity aggregates so the dashboard can search, sort and page in SQL rather
-- than pulling every user through auth.admin.listUsers() and sorting in JS.
--
-- The view runs with its owner's rights (security_invoker is left OFF on
-- purpose) — that is what lets it read auth.users. It is therefore revoked from
-- the customer-facing roles below: only the service role may select it.
--
-- Money: `total_spent_inr` sums what the customer actually paid
-- (amount_paid_inr, the Cashfree payment amount) and falls back to the fare for
-- bookings made before the ledger columns existed. Only confirmed bookings
-- count — flight status 5 (ticketed) and hotel rows, which are only ever
-- persisted when confirmed (lib/booking-history.ts).
create or replace view public.customer_directory as
with confirmed as (
  select
    b.user_id,
    b.kind,
    coalesce(b.amount_paid_inr, b.fare_inr, 0)             as paid_inr,
    coalesce(b.depart_date, b.check_in)                    as trip_date,
    case
      when b.kind = 'hotel' then coalesce(b.hotel_name, b.city)
      else b.origin || ' → ' || b.destination
    end                                                    as trip_label,
    b.created_at
  from public.bookings b
  where (b.kind = 'hotel') or (b.kind = 'flight' and b.status = 5)
),
booking_agg as (
  select
    user_id,
    count(*)::int                                          as booking_count,
    sum(paid_inr)::bigint                                  as total_spent_inr,
    max(created_at)                                        as last_booked_at
  from confirmed
  group by user_id
),
last_trip as (
  select distinct on (user_id)
    user_id, trip_date as last_trip_date, trip_label as last_trip_label, kind as last_trip_kind
  from confirmed
  where trip_date is not null
  order by user_id, trip_date desc
),
activity_agg as (
  select user_id, max(occurred_at) as last_event_at, count(*)::int as event_count
  from public.customer_events
  group by user_id
)
select
  u.id,
  u.email,
  p.full_name,
  p.phone,
  p.dob,
  p.gstin,
  u.created_at                                             as signed_up_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  coalesce(ba.booking_count, 0)                            as booking_count,
  coalesce(ba.total_spent_inr, 0)                          as total_spent_inr,
  ba.last_booked_at,
  lt.last_trip_date,
  lt.last_trip_label,
  lt.last_trip_kind,
  aa.last_event_at,
  coalesce(aa.event_count, 0)                              as event_count,
  -- "Last active" is whichever came latest: a sign-in, a booking, or a logged
  -- action. Sign-in alone would miss customers who stay signed in for weeks.
  greatest(
    coalesce(u.last_sign_in_at, u.created_at),
    coalesce(ba.last_booked_at, u.created_at),
    coalesce(aa.last_event_at, u.created_at)
  )                                                        as last_active_at
from auth.users u
left join public.profiles p    on p.id = u.id
left join booking_agg ba       on ba.user_id = u.id
left join last_trip lt         on lt.user_id = u.id
left join activity_agg aa      on aa.user_id = u.id
where u.deleted_at is null;

revoke all on public.customer_directory from anon, authenticated;
grant select on public.customer_directory to service_role;
