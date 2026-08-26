# Admin voice dashboard on admin.riseandshinetravel.in — design

**Date:** 2026-08-26
**Status:** Approved (brainstorm 2026-08-26)

## Goal

Host the existing `voice-agent/` dashboard publicly at
`admin.riseandshinetravel.in` so the team can see every voice-agent call —
ElevenLabs post-call analysis, the callback queue, and the CRM call records —
in one place, behind real sign-in.

## What exists today

- `voice-agent/` is a standalone Next.js 15 app (own package.json), excluded
  from the main site's Vercel deploy by `.vercelignore`.
- It reads calls, transcripts, summaries and collected trip fields live from
  the ElevenLabs Conversation API. No database.
- Sign-in is stubbed: with `DASHBOARD_AUTH_ENABLED` unset, anyone who opens
  the page is treated as an admin. The capability checks behind
  `requireCapability()` are real and already return 401/403.
- The team access list lives in git-ignored `.data/access.json` via four
  functions in `lib/access-store.ts`. On a read-only filesystem writes fall
  back to memory — useless on Vercel.
- The main site's Supabase holds `callback_queue` (migration 0006 — calls
  still to place) and `voice_calls` (migration 0005 — calls that happened,
  written by the ElevenLabs post-call webhook). Join:
  `callback_queue.phone = voice_calls.lead_phone`.

## Decisions (user-approved)

1. **Auth: Supabase Auth**, same Supabase project as the main site.
2. **Data scope: full picture** — ElevenLabs live + `callback_queue` +
   `voice_calls`.
3. **Hosting: separate Vercel project** rooted at `voice-agent/`, domain
   `admin.riseandshinetravel.in`.

## Design

### 1. Deployment

- New Vercel project; root directory `voice-agent/`.
- Cloudflare DNS: CNAME `admin` → `cname.vercel-dns.com`, DNS-only
  (grey cloud), per Vercel's recommendation.
- The app stays Next.js 15: its middleware (if any is added) is
  `middleware.ts`, **not** `proxy.ts` — that rename is Next 16 / main site
  only.
- Main site deploy is untouched; `.vercelignore` continues to exclude
  `voice-agent/` from it.

### 2. Auth

- Add `@supabase/ssr` + `@supabase/supabase-js` to `voice-agent/`.
- New `/login` page: email + password against the main site's Supabase
  project. No signup page here — team members sign up on the main site (or
  are created by an admin in Supabase); the dashboard only signs in.
- Implement `emailFromSession()` in `lib/session.ts`: server client reads the
  session cookie, calls `supabase.auth.getUser()` (never `getSession()`),
  returns the verified email or null.
- Set `DASHBOARD_AUTH_ENABLED=true` in the Vercel project. Everything
  downstream (`requireCapability()`, 401/403 responses, the role model)
  already works.
- Being a Supabase user is NOT enough to enter: the gate is the access list.
  Customers with site accounts get 403.

### 3. Access store → Supabase

- Migration `0013_dashboard_access.sql` in the main repo's
  `supabase/migrations/`: table `dashboard_access` — `email` (text, stored
  lower-cased, primary key), `role` (`viewer` | `editor` | `admin`),
  `added_by`, `created_at`, `updated_at`. RLS enabled with **no policies** —
  service-role access only; customers can never read or write it.
- Swap the four functions in `lib/access-store.ts` from the JSON file to
  Supabase queries using the service-role key (server-side only).
- `DASHBOARD_ADMIN_EMAILS` still seeds the first admin(s) when the table is
  empty. Last-admin removal/demotion protection is kept.

### 4. Data — full picture

Three sources on the dashboard, all reads server-side:

- **ElevenLabs live** (existing pages, unchanged): call list, transcript,
  post-call analysis, collected trip-field chips. Key supplied by the owner
  goes in the Vercel env.
- **Callback queue** (new page `/queue`): rows from `callback_queue` grouped
  by status (pending / claimed / done / failed), with due time, phone, name.
  Read via service-role client behind `requireCapability("view_calls")`.
- **CRM calls** (new section on the leads page): `voice_calls` webhook
  records — lead phone, summary, outcome, timestamps.
- **Lead timeline**: for a phone number, show queue row → dial → analysed
  call, joined on `callback_queue.phone = voice_calls.lead_phone`.

### 5. Environment (new Vercel project)

```
ELEVENLABS_API_KEY
ELEVENLABS_AGENT_ID            # read current id from ElevenLabs, never a doc
ELEVENLABS_PHONE_NUMBER_ID
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DASHBOARD_AUTH_ENABLED=true
DASHBOARD_ADMIN_EMAILS
```

### 6. Error handling & testing

- Missing env still throws at call time (existing `required()` pattern) —
  never a silent empty dashboard.
- Supabase read failures render a visible error state, not an empty list.
- Verify: `npx tsc --noEmit` + `npm run build` inside `voice-agent/`; main
  repo's `npm test` / `tsc` / build for the migration commit; Playwright
  smoke against a local run (login → calls list → queue) before pointing DNS.

## Out of scope

- Lead actions (editor role features) — role exists, actions ship later.
- Placing outbound calls from the dashboard — deliberately removed earlier;
  `/request-a-call` on the main site owns that.
- Any change to the ElevenLabs webhook or `callback_queue` dispatcher.
