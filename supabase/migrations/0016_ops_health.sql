-- Ops health state — one row per monitored check.
--
-- The monitor runs every few minutes. Without somewhere to remember what it
-- already said, a broken TBO token would send an alert email every run until
-- somebody muted the whole address — which is how a monitor stops being read
-- and becomes the next silent failure. This table lets the monitor alert on the
-- TRANSITION into failure, remind sparingly while it stays broken, and say so
-- once when it recovers.
--
-- Service-role only: written by /api/cron/healthcheck, never by a browser.

create table if not exists public.ops_health (
  -- The check's stable name, e.g. 'tbo_search', 'cashfree_auth'.
  key             text primary key,
  -- 'ok' | 'fail'
  status          text not null,
  -- Why, for the reminder and recovery emails.
  detail          text,
  -- When the CURRENT status began — gives "failing for 25 minutes" in an alert.
  since           timestamptz not null default now(),
  -- When we last emailed about this key, so reminders can be throttled.
  last_alert_at   timestamptz,
  -- How long the check took, for spotting a service degrading before it dies.
  duration_ms     integer,
  checked_at      timestamptz not null default now()
);

alter table public.ops_health enable row level security;
-- No policies on purpose: RLS on with zero policies denies every anon/authenticated
-- request, while the service role bypasses RLS entirely. Ops state is not customer data.

comment on table public.ops_health is
  'Health-check state for /api/cron/healthcheck. Service-role only; drives alert de-duplication.';
