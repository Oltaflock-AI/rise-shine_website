-- Fix the marketing opt-in, which silently did nothing.
--
-- 0010 enforced one-row-per-address with a unique index on `lower(email)`.
-- Correct for de-duplication, useless for the write path: `upsert(...,
-- { onConflict: "email" })` compiles to ON CONFLICT (email), and Postgres will
-- only match that against a unique constraint or index on the COLUMN — an
-- expression index on lower(email) is not a candidate. Every opt-in therefore
-- failed with 42P10, and because the caller ignored the returned error, a
-- customer could tick the offers box and simply never be added.
--
-- The fix is a real unique constraint on `email`, plus a CHECK that keeps the
-- stored value lowercase so that constraint IS the case-insensitive one. A
-- stray mixed-case insert now fails loudly instead of quietly creating a second
-- row for the same person — which is what would have let one address stay
-- subscribed after the other had opted out.

-- Normalise anything already stored before the constraint can reject it.
update public.marketing_contacts set email = lower(email) where email <> lower(email);

-- Collapse any duplicates the old index would have allowed through a direct
-- insert. Keep the earliest row, and keep an unsubscribe if EITHER row carried
-- one: consent lost is recoverable by asking again, consent wrongly assumed is not.
with ranked as (
  select id, lower(email) as em,
         row_number() over (partition by lower(email) order by created_at) as rn,
         bool_and(subscribed) over (partition by lower(email)) as all_subscribed
    from public.marketing_contacts
)
update public.marketing_contacts c
   set subscribed = r.all_subscribed
  from ranked r
 where c.id = r.id and r.rn = 1;

delete from public.marketing_contacts c
 using (
   select id, row_number() over (partition by lower(email) order by created_at) as rn
     from public.marketing_contacts
 ) r
 where c.id = r.id and r.rn > 1;

drop index if exists public.marketing_contacts_email_uniq;

alter table public.marketing_contacts
  drop constraint if exists marketing_contacts_email_lower_ck;
alter table public.marketing_contacts
  add constraint marketing_contacts_email_lower_ck check (email = lower(email));

alter table public.marketing_contacts
  drop constraint if exists marketing_contacts_email_key;
alter table public.marketing_contacts
  add constraint marketing_contacts_email_key unique (email);
