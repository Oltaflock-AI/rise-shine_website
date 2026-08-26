-- Rise & Shine Travels — marketing contacts and one-click unsubscribe
--
-- `offerEmail()` has always required an unsubscribe URL and there was nothing
-- behind it. This is that something.
--
-- The table is deliberately separate from `profiles`: consent to receive offers
-- is not the same fact as having an account, it is withdrawn independently, and
-- someone who deletes their account must still stay unsubscribed rather than
-- quietly reappearing on the list. It also has to serve addresses with no
-- account at all (a newsletter box, an enquiry form).
--
-- Nothing here is client-readable. The whole table is one long list of customer
-- email addresses, so RLS is on with NO policies: only the service role, i.e.
-- server code, can see it. A leak of this is a leak of the customer list.

create table if not exists public.marketing_contacts (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  name            text,
  -- The unsubscribe link's credential. A random uuid, not the email or the id:
  -- an unsubscribe URL travels in plain text through mail servers and sits in
  -- inbox history forever, and a guessable one lets anyone unsubscribe anyone.
  token           uuid not null default gen_random_uuid(),
  subscribed      boolean not null default true,
  -- Where the consent came from, so an "why am I getting this?" complaint can
  -- actually be answered.
  source          text,
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz
);

-- One row per address, case-insensitively: Hardik@ and hardik@ are one person,
-- and unsubscribing one must not leave the other on the list.
create unique index if not exists marketing_contacts_email_uniq
  on public.marketing_contacts (lower(email));

create unique index if not exists marketing_contacts_token_uniq
  on public.marketing_contacts (token);

-- The send query: subscribed contacts only.
create index if not exists marketing_contacts_subscribed_idx
  on public.marketing_contacts (subscribed) where subscribed;

alter table public.marketing_contacts enable row level security;
-- No policies on purpose. See the note above.
