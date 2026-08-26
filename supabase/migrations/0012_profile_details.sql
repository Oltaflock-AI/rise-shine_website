-- Rise & Shine Travels — the account holder's own details
--
-- `profiles` has existed since 0001 and, until 0009 added the signup phone,
-- nothing ever wrote to it. The account page now edits it directly, so it needs
-- the one field a travel booking always asks for and the table never had.
--
-- Date of birth lives HERE and not in `travellers`, even though that table has a
-- `dob` too. They answer different questions: `travellers.dob` is "who flew on
-- this ticket", a record tied to a booking, while `profiles.dob` is "who this
-- account belongs to", used to prefill the booker's own passenger row. Merging
-- them would mean editing your profile silently rewrote the passenger details on
-- a ticket already issued.

alter table public.profiles
  add column if not exists dob date;

-- A DOB in the future is a typo, and one before 1900 is a mis-keyed year. Both
-- reach TBO as a passenger date of birth, where they fail the booking rather
-- than the form — so reject them at the edge instead.
alter table public.profiles
  drop constraint if exists profiles_dob_sane_ck;
alter table public.profiles
  add constraint profiles_dob_sane_ck
  check (dob is null or (dob > date '1900-01-01' and dob < now()::date));

-- The account page writes `updated_at`; make sure it is always meaningful.
alter table public.profiles
  alter column updated_at set default now();
