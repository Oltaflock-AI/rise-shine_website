-- Rise & Shine Travels — saved traveller + billing details for repeat bookings
--
-- Checkout asks for the same names, PANs, passports and billing address every
-- time. `travellers` already existed for "one-tap prefills" but was never
-- written to and lacks the fields the flight form collects; this migration
-- completes it and adds the address book beside it.
--
-- Both tables are CONVENIENCE COPIES for prefilling a form. TBO stays canonical
-- for anything ticketed, and `passengers` stays the record of who actually flew
-- on a given booking — a customer editing their address book must never rewrite
-- history. Rows are written server-side after a confirmed ticket (see
-- lib/travel-profile.ts) and read in the browser under RLS.

-- ── travellers: the fields the flight checkout actually collects ──
alter table public.travellers
  add column if not exists passport_issue_date date,
  add column if not exists nationality text,
  add column if not exists last_used_at timestamptz not null default now();

-- One row per person, so booking the same family twice does not stack duplicate
-- chips in the picker. Name is matched case-insensitively; a null DOB collapses
-- to a sentinel so the index still applies to adults (whose DOB is optional).
create unique index if not exists travellers_person_uniq
  on public.travellers (
    user_id,
    lower(first_name),
    lower(last_name),
    coalesce(dob, date '1900-01-01')
  );

create index if not exists travellers_last_used_idx
  on public.travellers (user_id, last_used_at desc);

-- ── saved_addresses: contact + billing address book ──
-- Kept apart from `travellers` on purpose: an address belongs to the booker,
-- not to each passenger, and one booker legitimately has several (home, office
-- for the GST invoice, a parent's place).
create table if not exists public.saved_addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  label        text,
  phone        text,
  email        text,
  address1     text not null,
  address2     text,
  city         text,
  state        text,
  pin          text,
  country_code text not null default 'IN',
  nationality  text,
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create unique index if not exists saved_addresses_uniq
  on public.saved_addresses (
    user_id,
    lower(address1),
    lower(coalesce(city, '')),
    coalesce(pin, '')
  );

create index if not exists saved_addresses_last_used_idx
  on public.saved_addresses (user_id, last_used_at desc);

alter table public.saved_addresses enable row level security;

create policy "saved_addresses: owner all"
  on public.saved_addresses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
