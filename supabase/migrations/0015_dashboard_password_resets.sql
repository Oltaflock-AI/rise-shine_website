-- Rise & Shine Travels — dashboard password resets ("Forgot password?")
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- One row per reset link handed out by voice-agent/lib/dashboard-reset.ts.
-- Only the SHA-256 of the token is stored: the raw token exists in the emailed
-- link and nowhere else, so a leaked database dump cannot be used to take an
-- account over — exactly the rule dashboard_sessions already follows.
--
-- A row is consumed by setting `used_at`; rows are never deleted on use, so the
-- audit trail survives. `dashboard_login_events` records the request and the
-- completion alongside every sign-in attempt.
--
-- Written and read only by server code holding the service-role key, so RLS is
-- enabled with NO policies: anon/authenticated can never touch it, and the
-- service role bypasses RLS by design.

create table if not exists public.dashboard_password_resets (
  token_hash   text primary key,                 -- sha256 of the emailed token
  email        text not null references public.dashboard_users(email) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,                      -- non-null once redeemed
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists dashboard_password_resets_email_idx
  on public.dashboard_password_resets (email, created_at desc);

create index if not exists dashboard_password_resets_expires_idx
  on public.dashboard_password_resets (expires_at);

alter table public.dashboard_password_resets enable row level security;
