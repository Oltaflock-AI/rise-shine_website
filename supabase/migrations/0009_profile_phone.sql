-- Rise & Shine Travels — carry the signup mobile number into `profiles`
--
-- `profiles.phone` has existed since 0001 but nothing ever wrote it: signup only
-- collected name + email, and the `on_auth_user_created` trigger copied
-- `full_name` alone. The signup form now asks for a mobile number too (stored in
-- E.164 by lib/auth.tsx, so it joins cleanly against `callback_queue.phone` and
-- `voice_calls.lead_phone`), and this teaches the trigger to persist it.
--
-- Idempotent: safe to re-run, and safe to run before or after the code deploys.

-- ── the trigger, widened to carry phone ──
-- `on conflict do update` rather than `do nothing`: a profile row may already
-- exist from a re-run or an earlier partial signup, and the phone is the new
-- information. coalesce() means a signup without a phone (an older client, or a
-- user created from the Supabase dashboard) never blanks a number we already had.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update
    set full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        phone      = coalesce(excluded.phone, public.profiles.phone),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── backfill ──
-- Accounts created between the deploy of the new form and the run of this
-- migration have the phone in their auth metadata but not in `profiles`.
-- Existing non-null phones are left alone.
update public.profiles p
   set phone      = nullif(u.raw_user_meta_data ->> 'phone', ''),
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and p.phone is null
   and nullif(u.raw_user_meta_data ->> 'phone', '') is not null;
