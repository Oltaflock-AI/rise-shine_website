-- Rise & Shine Travels — voice-dashboard team access list
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- Replaces voice-agent/.data/access.json now that the dashboard deploys to
-- Vercel (admin.riseandshinetravel.in), where the filesystem is ephemeral.
-- This is the AUTHORISATION list ("what may this email do"), not identity —
-- sign-in is Supabase Auth, and a signed-in account that is not on this list
-- gets 401. Emails are stored lower-cased; voice-agent/lib/access.ts
-- normalises before every read and write.
--
-- Written and read only by server code holding the service-role key, so RLS is
-- enabled with NO policies: customers (anon/authenticated) can never see who
-- runs the dashboard, and the service role bypasses RLS by design.

create table if not exists public.dashboard_access (
  email      text primary key,
  role       text not null,
  added_by   text,
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_access_role_check
    check (role in ('viewer', 'editor', 'admin')),
  constraint dashboard_access_email_lower_check
    check (email = lower(email))
);

alter table public.dashboard_access enable row level security;

create or replace function public.touch_dashboard_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dashboard_access_touch on public.dashboard_access;
create trigger dashboard_access_touch
  before update on public.dashboard_access
  for each row execute function public.touch_dashboard_access_updated_at();
