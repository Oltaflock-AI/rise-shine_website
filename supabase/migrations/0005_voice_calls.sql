-- Rise & Shine Travels — outbound voice agent (ElevenLabs) call log
-- Run in the Supabase SQL Editor (or `supabase db push` with the CLI).
--
-- Every call the ElevenLabs agent "Priya" places lands here via the post-call
-- webhook (/api/voice/webhook): the transcript, the post-call analysis (summary +
-- the fields she collected) and, when the audio webhook is enabled, the recording.
-- One row per conversation_id, upserted — the three webhook types (transcription,
-- audio, call_initiation_failure) each fill in their part of the same row.
--
-- Written server-side with the service-role key (bypasses RLS). This is agency
-- CRM data, not customer data, so no client policy is granted.

create table if not exists public.voice_calls (
  conversation_id  text primary key,
  agent_id         text,
  agent_name       text,
  status           text,             -- done | processing | failed | initiation_failed
  call_successful  text,             -- success | failure | unknown

  -- Who we called (from the dynamic variables set when the call was placed)
  lead_name        text,
  lead_phone       text,
  from_number      text,
  to_number        text,

  -- Call shape
  started_at       timestamptz,
  duration_secs    integer,
  language         text,
  cost             integer,          -- ElevenLabs credits
  termination_reason text,

  -- Post-call analysis
  summary          text,             -- analysis.transcript_summary
  qualified        boolean,          -- data_collection_results.lead_qualified

  -- The trip fields Priya collects, promoted to columns for easy CRM queries
  destination      text,
  num_travelers    text,
  travel_month     text,
  special_requests text,
  whatsapp_number  text,
  callback_time    text,

  -- Everything else, verbatim from the webhook payload
  transcript        jsonb,           -- data.transcript[]
  analysis          jsonb,           -- data.analysis
  data_collection   jsonb,           -- data.analysis.data_collection_results
  metadata          jsonb,           -- data.metadata
  dynamic_variables jsonb,           -- data.conversation_initiation_client_data.dynamic_variables

  -- Recording (post_call_audio webhook → Storage object path, bucket below)
  has_audio        boolean not null default false,
  audio_path       text,

  -- Failed call attempts (call_initiation_failure webhook)
  failure_reason   text,             -- busy | no-answer | unknown
  failure_metadata jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists voice_calls_agent_idx    on public.voice_calls (agent_id);
create index if not exists voice_calls_started_idx  on public.voice_calls (started_at desc);
create index if not exists voice_calls_phone_idx    on public.voice_calls (lead_phone);
create index if not exists voice_calls_qualified_idx on public.voice_calls (qualified);

alter table public.voice_calls enable row level security;
-- Service-role only (webhook writes, ops reads). No client policy granted.

-- Private bucket for call recordings. Only the service-role key can read/write it;
-- serve a recording to staff with a signed URL, never a public link.
insert into storage.buckets (id, name, public)
values ('voice-call-audio', 'voice-call-audio', false)
on conflict (id) do nothing;
