-- Rise & Shine Travels — hotel bookings in the account mirror
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- The bookings table was flight-shaped (0001). Hotel bookings share the same
-- mirror (TBO stays canonical): a `kind` discriminator plus hotel columns.
-- origin/destination only make sense for flights, so their NOT NULLs are
-- relaxed. Existing rows are flights (kind defaults to 'flight').
-- RLS: the owner-read policy from 0001 already covers these rows; writes stay
-- server-side via the service-role key.

alter table public.bookings
  add column if not exists kind             text not null default 'flight',
  add column if not exists hotel_code       text,
  add column if not exists hotel_name       text,
  add column if not exists city             text,
  add column if not exists check_in         date,
  add column if not exists check_out        date,
  add column if not exists rooms            smallint,
  add column if not exists confirmation_no  text,
  add column if not exists booking_ref_no   text;

alter table public.bookings
  alter column origin drop not null,
  alter column destination drop not null;

create index if not exists bookings_kind_idx on public.bookings (kind);
