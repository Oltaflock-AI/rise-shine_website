-- Durable copy of TBO's static hotel lists (TBOHotelCodeList, per city).
--
-- TBO's static-data API answers intermittently with Status 500 "No Hotels Found"
-- after ~5.3 s for cities that have thousands of hotels — the same request, from
-- any IP, succeeds a moment later (measured 29-Sep-2026). The list was held only
-- in each function's memory, so a cold instance that hit one bad answer showed
-- "Live rates are unavailable" for the whole city. This table lets a search use
-- the last good list instead, and matches what we told TBO: static data is
-- refreshed every 15 days, not fetched live per visitor.
--
-- Service-role only (no RLS policies): written and read by lib/tbo-hotel-static.

create table if not exists public.tbo_static_cache (
  key         text primary key,          -- e.g. 'codes:115936'
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.tbo_static_cache enable row level security;

comment on table public.tbo_static_cache is
  'Last good TBO static-data answer per key (hotel code lists). Served when TBO''s static API fails; refreshed nightly for popular cities.';
