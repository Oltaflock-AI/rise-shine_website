-- Rise & Shine Travels — voice-dashboard accounts, sessions and sign-in log
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- Supersedes `dashboard_access` (0013). The dashboard no longer signs people in
-- through Supabase Auth: that pool is the CUSTOMER base of the main site, and a
-- customer account must never be one grant away from the CRM. The dashboard now
-- has its own credentials, its own sessions and its own attempt log, all in
-- these three tables. voice-agent/lib/dashboard-auth.ts is the only reader.
--
--   dashboard_users         who may sign in, with a scrypt password hash and role
--   dashboard_sessions      server-side sessions; deleting a row revokes access
--   dashboard_login_events  every attempt, success or failure, with the reason
--
-- Written and read only by server code holding the service-role key, so RLS is
-- enabled with NO policies on all three: anon/authenticated can never touch
-- them, and the service role bypasses RLS by design.

create table if not exists public.dashboard_users (
  email            text primary key,
  password_hash    text not null,              -- scrypt: "scrypt$<salt hex>$<hash hex>"
  role             text not null,
  is_active        boolean not null default true,
  failed_attempts  smallint not null default 0,
  locked_until     timestamptz,                -- set after repeated failures
  added_by         text,
  added_at         timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint dashboard_users_role_check
    check (role in ('viewer', 'editor', 'admin')),
  constraint dashboard_users_email_lower_check
    check (email = lower(email))
);

alter table public.dashboard_users enable row level security;

create table if not exists public.dashboard_sessions (
  token_hash  text primary key,                -- sha256 of the cookie value; the raw token is never stored
  email       text not null references public.dashboard_users(email) on delete cascade,
  expires_at  timestamptz not null,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists dashboard_sessions_email_idx on public.dashboard_sessions (email);
create index if not exists dashboard_sessions_expires_idx on public.dashboard_sessions (expires_at);

alter table public.dashboard_sessions enable row level security;

create table if not exists public.dashboard_login_events (
  id          bigint generated always as identity primary key,
  email       text not null,                   -- as typed (lower-cased), even when unknown
  ok          boolean not null,
  reason      text not null,                   -- ok | unknown_user | wrong_password | locked | inactive
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists dashboard_login_events_created_idx
  on public.dashboard_login_events (created_at desc);

alter table public.dashboard_login_events enable row level security;

create or replace function public.touch_dashboard_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dashboard_users_touch on public.dashboard_users;
create trigger dashboard_users_touch
  before update on public.dashboard_users
  for each row execute function public.touch_dashboard_users_updated_at();

-- The 0013 table held roles only (no credentials) and was live for under a day.
-- Nothing else references it; the seed admin is re-created from
-- DASHBOARD_ADMIN_EMAILS + DASHBOARD_ADMIN_PASSWORD on first use.
drop trigger if exists dashboard_access_touch on public.dashboard_access;
drop function if exists public.touch_dashboard_access_updated_at();
drop table if exists public.dashboard_access;
