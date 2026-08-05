-- Rise & Shine Travels — outbound callback queue (ElevenLabs)
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- NOT to be confused with `voice_calls` (migration 0005), its sibling: that table
-- is the CRM record of calls that ALREADY HAPPENED, written by the post-call
-- webhook. This one is the work queue of calls still TO BE PLACED. A lead flows
-- queue → dial → webhook, so it appears here first and in `voice_calls` after.
-- Join them on phone number (`callback_queue.phone` = `voice_calls.lead_phone`).
--
-- The /request-a-call form does NOT dial anyone itself: it parks a row here with
-- a `due_at` in the future, and /api/cron/callback-queue drains the queue. That
-- indirection is the whole point — a serverless function cannot hold a request
-- open for the callback delay (Vercel Hobby caps a function at 60s), and a lead
-- must survive a redeploy or a cold start between submit and dial.
--
-- Written only by server code holding the service-role key, so RLS is enabled
-- with NO policies at all: the anon/authenticated roles can never read a lead's
-- name and phone number, and the service role bypasses RLS by design.

create table if not exists public.callback_queue (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null,                     -- E.164, normalised on enqueue
  status          text not null default 'pending',   -- pending → calling → done | failed
  due_at          timestamptz not null,              -- dial no earlier than this
  attempts        smallint not null default 0,
  conversation_id text,                              -- ElevenLabs conversation id
  sip_call_id     text,
  last_error      text,
  source          text,                              -- which page/campaign produced the lead
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint callback_queue_status_check
    check (status in ('pending', 'calling', 'done', 'failed', 'cancelled'))
);

alter table public.callback_queue enable row level security;

-- The dispatcher's hot path: "give me pending rows that are due". Partial index
-- so it stays small no matter how many completed leads accumulate.
create index if not exists callback_queue_due_idx
  on public.callback_queue (due_at)
  where status = 'pending';

-- One outstanding callback per number. A double-submit (impatient user, retried
-- request) therefore hits a unique violation instead of dialling the customer
-- twice; lib/callback-queue.ts translates that into a friendly "already queued".
create unique index if not exists callback_queue_active_phone_idx
  on public.callback_queue (phone)
  where status in ('pending', 'calling');

-- Keep updated_at honest — every claim/complete/fail writes through this.
create or replace function public.touch_callback_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists callback_queue_set_updated_at on public.callback_queue;
create trigger callback_queue_set_updated_at
  before update on public.callback_queue
  for each row execute function public.touch_callback_queue_updated_at();
