-- Rise & Shine Travels — move the payment columns from Razorpay to Cashfree
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- Razorpay was never enabled in production, so these columns hold no live data and a
-- rename is safe. Renaming (rather than adding new columns) keeps a single money
-- handle per booking — two half-populated pairs would be worse than none.
--
-- `cf_payment_id` is Cashfree's payment id; `cf_order_id` is the order id WE generate
-- and pass to Create Order (see lib/cashfree.ts newOrderId), which is the handle the
-- booking routes verify against and refunds are issued on.
--
-- Idempotent: each rename is guarded, so re-running is a no-op.

-- ── bookings: the per-booking money mirror (0002) ────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings'
               and column_name = 'razorpay_order_id') then
    alter table public.bookings rename column razorpay_order_id to cf_order_id;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings'
               and column_name = 'razorpay_payment_id') then
    alter table public.bookings rename column razorpay_payment_id to cf_payment_id;
  end if;
end $$;

-- Covers a fresh database that never ran 0002.
alter table public.bookings
  add column if not exists cf_order_id     text,
  add column if not exists cf_payment_id   text,
  add column if not exists amount_paid_inr integer;

drop index if exists bookings_rzp_payment_idx;
create index if not exists bookings_cf_payment_idx
  on public.bookings (cf_payment_id);

-- ── payments: the reconciliation ledger (0003) ───────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'payments'
               and column_name = 'razorpay_payment_id') then
    alter table public.payments rename column razorpay_payment_id to cf_payment_id;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'payments'
               and column_name = 'razorpay_order_id') then
    alter table public.payments rename column razorpay_order_id to cf_order_id;
  end if;
end $$;

-- Covers a fresh database that never ran 0003.
create table if not exists public.payments (
  cf_payment_id text primary key,
  cf_order_id   text,
  status        text not null,          -- captured | failed | refunded
  amount_inr    integer,
  method        text,                   -- upi | credit_card | net_banking | …
  email         text,
  contact       text,
  trace_id      text,                   -- TBO TraceId, from the order tags
  refunded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop index if exists payments_order_idx;
create index if not exists payments_cf_order_idx on public.payments (cf_order_id);
create index if not exists payments_status_idx   on public.payments (status);

alter table public.payments enable row level security;
-- Service-role only (webhook writes, reconciliation reads). No client policy granted.
